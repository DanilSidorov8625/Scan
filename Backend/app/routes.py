from __future__ import annotations

import re
import os
import csv
import json
import base64
import hmac
import hashlib
import secrets
from datetime import datetime, timedelta

from email_validator import validate_email, EmailNotValidError
from flask import Blueprint, jsonify, request, current_app, send_from_directory, abort
from flask_jwt_extended import (
    create_access_token,
    jwt_required,
    get_jwt_identity,
)
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from werkzeug.utils import secure_filename
import resend
import stripe


from .models import db, User, Email, PasswordResetToken, Export
from . import limiter as app_limiter  # use the Limiter initialized in __init__

bp = Blueprint("api", __name__)

# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #

# ---- Token pricing (tweak as you like) ----
COST_EXPORT   = 1   # charge when creating an export (email + files)
COST_DOWNLOAD = 1   # charge when downloading a file

def _get_current_user_from_jwt():
    ident = get_jwt_identity()
    try:
        uid = int(ident)
        return User.query.get(uid)
    except (TypeError, ValueError):
        return User.query.filter_by(username=str(ident)).first()

def _tokens_left(user: User) -> int:
    total = int(user.tokensTotal or 0)
    used  = int(user.tokensUsed or 0)
    return max(total - used, 0)

def _charge_tokens(user: User, cost: int = 1) -> bool:
    """Increment tokensUsed if there is enough balance. Commit immediately."""
    if _tokens_left(user) < cost:
        return False
    user.tokensUsed = int(user.tokensUsed or 0) + cost
    db.session.commit()
    return True

def _refund_tokens(user: User, cost: int = 1):
    """Best-effort: subtract previously charged tokens if something failed later."""
    try:
        used = int(user.tokensUsed or 0)
        user.tokensUsed = max(used - cost, 0)
        db.session.commit()
    except Exception:
        current_app.logger.exception("Failed to refund tokens")


def _json_error(message: str, code: int = 400):
    return jsonify(error=message), code

def _get_json():
    """Try JSON first, then form data."""
    data = request.get_json(silent=True)
    if data is None:
        data = request.form.to_dict()
    return data or {}

def _csv_safe(value):
    """Mitigate CSV injection: prefix dangerous leading chars with a single quote."""
    if value is None:
        return ""
    s = str(value)
    if s[:1] in ("=", "+", "-", "@"):
        return "'" + s
    return s

def _save_payload_json(export_id: str, payload: dict) -> str:
    folder = _export_folder()
    path = os.path.join(folder, f"{export_id}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return path

def encode_attachment(file_path):
    with open(file_path, "rb") as f:
        content = f.read()
        return {
            "filename": os.path.basename(file_path),
            "content": base64.b64encode(content).decode("utf-8"),
        }

def _hash_token(raw: str) -> str:
    key = (current_app.config.get("SECRET_KEY") or "").encode("utf-8")
    return hmac.new(key, raw.encode("utf-8"), hashlib.sha256).hexdigest()

def _export_folder() -> str:
    # Resolve to instance/savedExports at runtime (needs app context)
    folder = os.path.join(current_app.instance_path, "savedExports")
    os.makedirs(folder, exist_ok=True)
    return folder

# --------------------------------------------------------------------------- #
# Health check                                                                #
# --------------------------------------------------------------------------- #
@bp.route("/health", methods=["GET"])
def health():
    return jsonify(status="ok"), 200

# --------------------------------------------------------------------------- #
# Registration                                                                #
# --------------------------------------------------------------------------- #
@bp.route("/register", methods=["POST"])
@app_limiter.limit("10/hour")
def register():
    payload = _get_json()
    username = (payload.get("username") or "").strip()
    password = (payload.get("password") or "").strip()

    if len(username) < 3 or len(password) < 6:
        return _json_error("Username >= 3 chars & password >= 6 chars required.")

    if not re.fullmatch(r"[A-Za-z0-9_.-]+", username):
        return _json_error("Username may only contain letters, numbers, _ . -")

    try:
        user = User(username=username)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return _json_error("Username already taken.", 409)
    except SQLAlchemyError:
        db.session.rollback()
        return _json_error("Database error.", 500)

    return jsonify(message="registered"), 201

# --------------------------------------------------------------------------- #
# Login                                                                       #
# --------------------------------------------------------------------------- #
@bp.route("/login", methods=["POST"])
@app_limiter.limit("30/hour")
def login():
    payload  = _get_json()
    username = payload.get("username", "").strip()
    password = payload.get("password", "")

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return _json_error("Invalid credentials.", 401)

    token = create_access_token(identity=str(user.id))
    return jsonify(access_token=token), 200

# --------------------------------------------------------------------------- #
# User management                                                             #
# --------------------------------------------------------------------------- #
@bp.route("/reset-password/request", methods=["POST"])
@app_limiter.limit("5/hour")
def reset_password_request():
    payload = _get_json()
    identifier = (payload.get("username") or payload.get("email") or "").strip()
    if not identifier:
        return _json_error("username or email required.", 400)

    # Lookup by username or email
    user = User.query.filter_by(username=identifier).first()
    if not user:
        email_rec = Email.query.filter_by(email=identifier).first()
        user = email_rec.user if email_rec else None

    # Always respond success to avoid enumeration
    if not user:
        return jsonify(message="If the account exists, a reset email has been sent."), 200

    active_email = Email.query.filter_by(user_id=user.id, is_active=True).first()
    if not active_email:
        return jsonify(message="If the account exists, a reset email has been sent."), 200

    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw_token)
    ttl = int(current_app.config["PASSWORD_RESET_TOKEN_TTL"])
    expires_at = datetime.utcnow() + timedelta(seconds=ttl)

    try:
        prt = PasswordResetToken(user_id=user.id, token_hash=token_hash, expires_at=expires_at)
        db.session.add(prt)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        # Avoid enumeration patterns
        return jsonify(message="If the account exists, a reset email has been sent."), 200

    # Send email
    try:
        reset_link = f"http://127.0.0.1:5000/reset?token={raw_token}"
        params: resend.Emails.SendParams = {
            "from": "Scan App <noreply@scans.omnaris.xyz>",
            "to": active_email.email,
            "subject": "Reset your Scan App password",
            "html": (
                f"<p>Use this link to reset your password (valid for {ttl//60} minutes):</p>"
                f"<p><a href='{reset_link}'>{reset_link}</a></p>"
            ),
        }
        resend.Emails.send(params)
    except Exception:
        current_app.logger.exception("Failed to send reset email")
        # Still avoid leaking details
        pass

    return jsonify(message="If the account exists, a reset email has been sent."), 200

@bp.route("/reset-password/confirm", methods=["POST"])
@app_limiter.limit("10/hour")
def reset_password_confirm():
    payload = _get_json()
    raw_token = (payload.get("token") or "").strip()
    new_password = (payload.get("new_password") or "").strip()

    if len(new_password) < 6 or len(new_password) > 128:
        return _json_error("Password must be between 6 and 128 characters.", 400)
    if not raw_token:
        return _json_error("Token required.", 400)

    token_hash = _hash_token(raw_token)

    try:
        prt = PasswordResetToken.query.filter_by(token_hash=token_hash).first()
        if not prt or not prt.is_valid():
            return _json_error("Invalid or expired token.", 400)

        user = prt.user
        user.set_password(new_password)
        prt.used_at = datetime.utcnow()
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return _json_error("Failed to reset password.", 500)

    return jsonify(message="Password updated."), 200



@bp.route("/getUserTokens", methods=["GET"])
@jwt_required()
def get_user_tokens():
    ident = get_jwt_identity()

    # Resolve the user whether your JWT stores an int ID or a username
    user = None
    try:
        # If identity is an int (or numeric string), treat as primary key
        user_id = int(ident)
        user = User.query.get(user_id)
    except (TypeError, ValueError):
        # Otherwise treat identity as username
        user = User.query.filter_by(username=ident).first()

    if not user:
        return jsonify({"error": "User not found"}), 404

    # Safely coerce and clamp
    tokens_total = int(user.tokensTotal or 0)
    tokens_used  = int(user.tokensUsed or 0)

    # If used > total (bad data), let total float up so "left" isn't negative
    if tokens_used > tokens_total:
        tokens_total = tokens_used

    tokens_left = max(tokens_total - tokens_used, 0)

    return jsonify({
        "tokensTotal": tokens_total,
        "tokensLeft": tokens_left,
        "tokensUsed": tokens_used,
    }), 200

@bp.route("/getMoreTokens", methods=["POST"])
@jwt_required()
def get_more_tokens():
    """
    Create a Stripe Checkout Session to buy tokens.

    Request body (any are optional):
    {
      "tokens": 25,         # if provided, fixed quantity; otherwise buyer can adjust in Stripe
      "email": "x@y.z",     # fallback email if user has no active email
      "min": 1,             # adjustable min when tokens not provided
      "max": 1000           # adjustable max when tokens not provided
    }
    """
    # --- config / pricing ---
    stripe_key = os.getenv("STRIPE_API_KEY")     

    if not stripe_key:
        return _json_error("Stripe key not configured on server.", 500)
    stripe.api_key = stripe_key

    TOKEN_PRICE_CENTS = int(current_app.config.get("TOKEN_PRICE_CENTS", 10))  # $0.10/token
    from flask import url_for

    success_url = current_app.config.get(
        "CHECKOUT_SUCCESS_URL",
        url_for("pages.tokens_success", _external=True)
    )
    cancel_url  = current_app.config.get(
        "CHECKOUT_CANCEL_URL",
        url_for("pages.tokens_cancel", _external=True)
    )
    from_email  = current_app.config.get("RESEND_FROM_EMAIL", "Scan App <noreply@scans.omnaris.xyz>")

    # --- identify user & email ---
    ident = get_jwt_identity()
    user = None
    try:
        user = User.query.get(int(ident))
    except (TypeError, ValueError):
        user = User.query.filter_by(username=str(ident)).first()

    if not user:
        return _json_error("User not found.", 404)

    active_email_row = Email.query.filter_by(user_id=user.id, is_active=True).first()

    # --- parse payload ---
    payload = _get_json()
    fallback_email = (payload.get("email") or "").strip() or None
    customer_email = (active_email_row.email if active_email_row else None) or fallback_email

    tokens = payload.get("tokens", 10)
    min_q = int(payload.get("min", 1))
    max_q = int(payload.get("max", 1000))

    # validate tokens if provided
    adjustable = False
    if tokens is not None:
        try:
            tokens = int(tokens)
            if tokens < 1:
                return _json_error("'tokens' must be >= 1.", 400)
        except Exception:
            return _json_error("'tokens' must be an integer.", 400)
    else:
        adjustable = True

    # --- build line item ---
    line_item = {
        "price_data": {
            "currency": "usd",
            "unit_amount": TOKEN_PRICE_CENTS,
            "product_data": {
                "name": "Tokens",
                "description": "Purchase usage tokens",
            },
        },
        "quantity": tokens if tokens else 1,
    }
    if adjustable:
        line_item["adjustable_quantity"] = {
            "enabled": True,
            "minimum": max(1, min_q),
            "maximum": max(1, max_q),
        }

    # --- create checkout session ---
    session = stripe.checkout.Session.create(
        mode="payment",
        payment_method_types=["card"],
        line_items=[line_item],
        allow_promotion_codes=True,
        success_url=success_url,
        cancel_url=cancel_url,
        customer_email=customer_email,
        metadata={
            "user_id": str(user.id),
            "username": user.username,
            "price_per_token_cents": str(TOKEN_PRICE_CENTS),
        },
    )

    # --- best-effort email with Resend (optional) ---
    emailed = False
    try:
        if customer_email:
            resend.Emails.send({
                "from": from_email,
                "to": customer_email,
                "subject": "Complete your token purchase",
                "html": (
                    "<p>Hi,</p>"
                    "<p>You can complete your token purchase here:</p>"
                    f"<p><a href=\"{session.url}\">{session.url}</a></p>"
                    "<p>If you didn’t request this, you can ignore this email.</p>"
                ),
            })
            emailed = True
    except Exception:
        # Don't fail the request if email sending fails
        current_app.logger.exception("Resend email error")

    return jsonify({
        "url": session.url,
        "emailed": emailed,
        "adjustable": adjustable,
        "unitAmountCents": TOKEN_PRICE_CENTS,
    }), 200




@bp.route("/stripe/webhook", methods=["POST"])
def stripe_webhook():
    payload = request.data
    sig_header = request.headers.get("Stripe-Signature")
    secret = current_app.config.get("STRIPE_WEBHOOK_SECRET")
    stripe.api_key = current_app.config.get("STRIPE_API_KEY")

    if not secret or not stripe.api_key:
        current_app.logger.error("Stripe keys not configured")
        return "Stripe keys not configured", 500

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, secret
        )
    except ValueError:
        return "Invalid payload", 400
    except stripe.error.SignatureVerificationError:
        return "Invalid signature", 400

    # Handle events
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session["metadata"].get("user_id")
        qty = session["amount_total"] // int(session["metadata"]["price_per_token_cents"])
        user = User.query.get(user_id)
        if user:
            user.tokensTotal = (user.tokensTotal or 0) + qty
            db.session.commit()
            current_app.logger.info(f"Added {qty} tokens to user {user.username}")

    return jsonify(success=True)

# --------------------------------------------------------------------------- #
# Email management                                                            #
# --------------------------------------------------------------------------- #
@bp.route("/emails", methods=["GET"])
@jwt_required()
def get_emails():
    user_id = get_jwt_identity()
    emails  = (
        Email.query.filter_by(user_id=user_id)
        .order_by(Email.id.asc())
        .all()
    )

    if not emails:
        return jsonify(message="No emails found."), 200

    return jsonify(
        [
            {"id": e.id, "email": e.email, "is_active": e.is_active}
            for e in emails
        ]
    ), 200

@bp.route("/emails", methods=["POST"])
@jwt_required()
@app_limiter.limit("60/hour")
def add_email():
    user_id = get_jwt_identity()
    payload = _get_json()
    raw_email = (payload.get("email") or "").strip()

    # validate email address
    try:
        valid_email = validate_email(raw_email).normalized
    except EmailNotValidError as e:
        return _json_error(str(e))

    # insert
    try:
        new_email = Email(user_id=user_id, email=valid_email, is_active=False)
        db.session.add(new_email)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return _json_error("This email is already on file.", 409)
    except SQLAlchemyError:
        db.session.rollback()
        return _json_error("Database error.", 500)

    return jsonify(id=new_email.id), 201

@bp.route("/emails/<int:email_id>", methods=["PUT"])
@jwt_required()
def set_active_email(email_id: int):
    user_id = get_jwt_identity()

    email = Email.query.filter_by(id=email_id, user_id=user_id).first()
    if not email:
        return _json_error("Email not found.", 404)

    try:
        # deactivate all, then activate chosen one
        Email.query.filter_by(user_id=user_id, is_active=True).update(
            {"is_active": False}
        )
        email.is_active = True
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return _json_error("Database error.", 500)

    return jsonify(message="active email updated"), 200

@bp.route("/emails/<int:email_id>", methods=["DELETE"])
@jwt_required()
def remove_email(email_id: int):
    user_id = get_jwt_identity()

    email = Email.query.filter_by(id=email_id, user_id=user_id).first()
    if not email:
        return _json_error("Email not found.", 404)

    try:
        db.session.delete(email)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return _json_error("Database error.", 500)

    return jsonify(message="deleted"), 200

# --------------------------------------------------------------------------- #
# Exports                                                                     #
# --------------------------------------------------------------------------- #
@bp.route("/export", methods=["POST"])
@jwt_required()
@app_limiter.limit("20/hour")
def export_data():
    # ---- identify user + enforce tokens ----
    user = _get_current_user_from_jwt()
    if not user:
        return _json_error("User not found.", 404)

    if _tokens_left(user) < COST_EXPORT:
        return _json_error("No tokens left. Please purchase more tokens.", 402)

    # Charge upfront; if we fail later, we’ll refund.
    charged = _charge_tokens(user, COST_EXPORT)
    if not charged:
        return _json_error("No tokens left. Please purchase more tokens.", 402)

    try:
        user_id = user.id

        # Size check
        raw_len = request.content_length or 0
        if raw_len > current_app.config["MAX_PAYLOAD_BYTES"]:
            raise ValueError("Payload too large.")

        # Parse JSON
        try:
            payload = request.get_json(force=True, silent=False)
        except Exception:
            raise ValueError("Invalid JSON body.")

        export_id = payload.get("exportId") or datetime.utcnow().strftime("%Y%m%d%H%M%S")

        # Save raw payload JSON
        try:
            payload_path = _save_payload_json(export_id, payload)
        except Exception:
            current_app.logger.exception("Failed to save payload JSON")
            raise RuntimeError("Failed to persist payload.")

        headers_str = payload.get("headers", "")
        rows = payload.get("rows", [])
        form_id = payload.get("formId") or None

        if not isinstance(rows, list):
            raise ValueError("Field 'rows' must be a list.")

        max_rows = current_app.config["MAX_EXPORT_ROWS"]
        if not rows:
            raise ValueError("No rows to export.")
        if len(rows) > max_rows:
            raise ValueError(f"Too many rows (>{max_rows}).")

        # Build CSV data
        minimal_headers = [h.strip() for h in headers_str.split(",") if isinstance(h, str) and h.strip()]
        full_fieldnames = set()
        parsed_rows = []

        for row in rows:
            if not isinstance(row, dict):
                continue
            try:
                data_obj = row.get("data")
                if isinstance(data_obj, str):
                    data_obj = json.loads(data_obj)
                elif data_obj is None:
                    data_obj = {}
                merged = {
                    **(data_obj if isinstance(data_obj, dict) else {}),
                    "id": row.get("id"),
                    "form_id": row.get("form_id"),
                    "scanned_at": row.get("scanned_at"),
                }
                parsed_rows.append(merged)
                full_fieldnames.update(merged.keys())
            except Exception:
                continue

        if not parsed_rows:
            raise ValueError("No valid rows after parsing.")

        folder = _export_folder()
        minimal_csv_name = f"{export_id}_minimal.csv"
        full_csv_name    = f"{export_id}_full.csv"

        minimal_csv_path = os.path.join(folder, minimal_csv_name)
        full_csv_path    = os.path.join(folder, full_csv_name)

        # Minimal CSV
        try:
            with open(minimal_csv_path, mode="w", newline="", encoding="utf-8") as f:
                fieldnames = minimal_headers or sorted(full_fieldnames)
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                for row in parsed_rows:
                    writer.writerow({k: _csv_safe(row.get(k, "")) for k in fieldnames})
        except Exception:
            current_app.logger.exception("Failed writing minimal CSV")
            raise RuntimeError("Failed to generate minimal CSV.")

        # Full CSV
        try:
            with open(full_csv_path, mode="w", newline="", encoding="utf-8") as f:
                fieldnames = sorted(full_fieldnames)
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                for row in parsed_rows:
                    writer.writerow({k: _csv_safe(row.get(k, "")) for k in fieldnames})
        except Exception:
            current_app.logger.exception("Failed writing full CSV")
            raise RuntimeError("Failed to generate full CSV.")

        # Email active email
        active_email = Email.query.filter_by(user_id=user_id, is_active=True).first()
        if not active_email:
            raise ValueError("No active email on file.")

        try:
            params: resend.Emails.SendParams = {
                "from": "Scan App <noreply@scans.omnaris.xyz>",
                "to": active_email.email,
                "subject": f"📦 Scan App Export {export_id} @ {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')}",
                "html": f"""
                    <div style="font-family: Arial, sans-serif; font-size: 16px; color: #333;">
                        <h2 style="color: #007BFF;">📦 Your Scan Export is Ready</h2>
                        <p>Hello,</p>
                        <p>Your requested export has been generated successfully. You’ll find the files attached to this email.</p>
                        <div style="margin-top: 20px;">
                            <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
                                <thead>
                                    <tr style="background-color: #f8f9fa; text-align: left;">
                                        <th style="padding: 8px; border: 1px solid #ddd;">File</th>
                                        <th style="padding: 8px; border: 1px solid #ddd;">Description</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style="padding: 8px; border: 1px solid #ddd;">{minimal_csv_name}</td>
                                        <td style="padding: 8px; border: 1px solid #ddd;">Minimal CSV export</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px; border: 1px solid #ddd;">{full_csv_name}</td>
                                        <td style="padding: 8px; border: 1px solid #ddd;">Full CSV export</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px; border: 1px solid #ddd;">{export_id}.json</td>
                                        <td style="padding: 8px; border: 1px solid #ddd;">Raw JSON data</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <p style="margin-top: 20px;">If you did not request this export, please contact your administrator immediately.</p>
                        <p style="color: #777; font-size: 12px; margin-top: 30px;">
                            — Scan App Automated Export System
                        </p>
                    </div>
                """,
                "attachments": [
                    encode_attachment(minimal_csv_path),
                    encode_attachment(full_csv_path),
                ],
            }

            resend.Emails.send(params)
            email_sent = True
        except Exception:
            current_app.logger.exception("Failed to send export email")
            email_sent = False

        # Store in DB
        export_record = Export(
            export_id=export_id,
            user_id=user_id,
            form_id=form_id,
            minimal_csv=minimal_csv_name,
            full_csv=full_csv_name,
            payload_json=f"{export_id}.json",
            email_sent=email_sent,
        )
        db.session.add(export_record)
        db.session.commit()

        return jsonify(
            message="Exported successfully" if email_sent else "Exported, but failed to send email.",
            export_id=export_id,
            minimal_csv=f"/api/exports/{export_id}/{minimal_csv_name}",
            full_csv=f"/api/exports/{export_id}/{full_csv_name}",
            payload_json=f"/api/exports/{export_id}/{export_id}.json",
            email_sent=email_sent,
        ), 200

    except ValueError as ve:
        # Bad request; refund the token
        _refund_tokens(user, COST_EXPORT)
        return _json_error(str(ve), 400)
    except RuntimeError as re_err:
        _refund_tokens(user, COST_EXPORT)
        return _json_error(str(re_err), 500)
    except Exception:
        current_app.logger.exception("Export failed")
        _refund_tokens(user, COST_EXPORT)
        return _json_error("Export failed.", 500)

@bp.route("/exports/resend/<export_id>", methods=["POST"])
@jwt_required()
def resend_export_email(export_id):
    """
    Re-send the export email for a given export_id if it belongs to the current user.
    Charges one token (uses COST_EXPORT or define COST_RESEND=1).
    """
    # identify user
    user = _get_current_user_from_jwt()
    if not user:
        return _json_error("User not found.", 404)

    # must own this export
    export_record = Export.query.filter_by(export_id=export_id, user_id=user.id).first()
    if not export_record:
        return _json_error("Export not found.", 404)

    # active email required
    active_email = Email.query.filter_by(user_id=user.id, is_active=True).first()
    if not active_email:
        return _json_error("No active email on file.", 400)

    # tokens check
    if _tokens_left(user) < COST_EXPORT:  # or COST_RESEND if you defined it
        return _json_error("No tokens left. Please purchase more tokens.", 402)

    # charge upfront; refund on failure
    if not _charge_tokens(user, COST_EXPORT):  # or COST_RESEND
        return _json_error("No tokens left. Please purchase more tokens.", 402)

    try:
        folder = _export_folder()
        minimal_csv_path = os.path.join(folder, export_record.minimal_csv)
        full_csv_path    = os.path.join(folder, export_record.full_csv)

        if not os.path.isfile(minimal_csv_path) or not os.path.isfile(full_csv_path):
            _refund_tokens(user, COST_EXPORT)  # refund on missing files
            return _json_error("Export files not found.", 404)

        params: resend.Emails.SendParams = {
            "from": "Scan App <noreply@scans.omnaris.xyz>",
            "to": active_email.email,
            "subject": f"📦 Scan App Export {export_id} (Re-send) @ {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')}",
            "html": f"""
                <div style="font-family: Arial, sans-serif; font-size: 16px; color: #333;">
                    <h2 style="color: #007BFF;">📦 Your Scan Export (Re-sent)</h2>
                    <p>Hello,</p>
                    <p>Your export has been re-sent as requested. You’ll find the files attached to this email.</p>
                    <div style="margin-top: 20px;">
                        <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
                            <thead>
                                <tr style="background-color: #f8f9fa; text-align: left;">
                                    <th style="padding: 8px; border: 1px solid #ddd;">File</th>
                                    <th style="padding: 8px; border: 1px solid #ddd;">Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style="padding: 8px; border: 1px solid #ddd;">{export_record.minimal_csv}</td>
                                    <td style="padding: 8px; border: 1px solid #ddd;">Minimal CSV export</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px; border: 1px solid #ddd;">{export_record.full_csv}</td>
                                    <td style="padding: 8px; border: 1px solid #ddd;">Full CSV export</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px; border: 1px solid #ddd;">{export_record.payload_json}</td>
                                    <td style="padding: 8px; border: 1px solid #ddd;">Raw JSON data</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <p style="margin-top: 20px;">If you did not request this export, please contact your administrator immediately.</p>
                    <p style="color: #777; font-size: 12px; margin-top: 30px;">
                        — Scan App Automated Export System
                    </p>
                </div>
            """,
            "attachments": [
                encode_attachment(minimal_csv_path),
                encode_attachment(full_csv_path),
            ],
        }

        resend.Emails.send(params)
        return jsonify({"message": "Export email re-sent successfully."}), 200

    except Exception:
        current_app.logger.exception("Failed to resend export email")
        _refund_tokens(user, COST_EXPORT)  # refund on failure
        return _json_error("Failed to resend email.", 500)


@bp.route("/exports/file/<export_id>/<path:filename>", methods=["GET"])
@jwt_required()
def download_export(export_id, filename):
    user = _get_current_user_from_jwt()
    if not user:
        return _json_error("User not found.", 404)

    # Ensure this export belongs to the logged-in user
    export_record = Export.query.filter_by(export_id=export_id, user_id=user.id).first()
    if not export_record:
        return _json_error("Export not found.", 404)

    # Tokens check
    if _tokens_left(user) < COST_DOWNLOAD:
        return _json_error("No tokens left. Please purchase more tokens.", 402)

    # Sanitize & locate file
    filename = secure_filename(filename)
    folder = _export_folder()
    path = os.path.join(folder, filename)
    if not os.path.isfile(path):
        return _json_error("File not found.", 404)

    # Charge (no refund on download—file sends immediately)
    charged = _charge_tokens(user, COST_DOWNLOAD)
    if not charged:
        return _json_error("No tokens left. Please purchase more tokens.", 402)

    return send_from_directory(folder, filename, as_attachment=True)

@bp.route("/exports", methods=["GET"])
@jwt_required()
def list_exports():
    """
    Return all export IDs belonging to the current user.
    """
    user_id = get_jwt_identity()
    export_ids = (
        db.session.query(Export.export_id)
        .filter_by(user_id=user_id)
        .order_by(Export.created_at.desc())
        .all()
    )

    return jsonify([eid for (eid,) in export_ids]), 200








