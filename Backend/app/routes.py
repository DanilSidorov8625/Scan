# app/routes.py
from __future__ import annotations

import re
from email_validator import validate_email, EmailNotValidError
from flask           import Blueprint, jsonify, request, current_app
from datetime        import datetime
from flask_jwt_extended import (
    create_access_token,
    jwt_required,
    get_jwt_identity,
)
from flask_limiter          import Limiter
from flask_limiter.util     import get_remote_address
from sqlalchemy.exc         import SQLAlchemyError, IntegrityError

import os
import csv
import json
import resend
import base64



from .models import db, User, Email

bp = Blueprint("api", __name__, url_prefix="/api")


EXPORT_FOLDER = os.path.join(os.getcwd(), "savedExports")
os.makedirs(EXPORT_FOLDER, exist_ok=True)


# --------------------------------------------------------------------------- #
# Rate-limiter (limits per client IP)                                         #
# --------------------------------------------------------------------------- #
limiter = Limiter(key_func=get_remote_address, default_limits=["200/hour"])
limiter.limit("10 per minute")(bp)

# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #
def _json_error(message: str, code: int = 400):
    return jsonify(error=message), code


def _get_json():
    """Try JSON first, then form data."""
    data = request.get_json(silent=True)
    if data is None:
        data = request.form.to_dict()
    return data or {}


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
@limiter.limit("10/hour")            # slow down bots
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
    except SQLAlchemyError as e:
        db.session.rollback()
        return _json_error(f"DB error: {e}", 500)

    return jsonify(message="registered"), 201


# --------------------------------------------------------------------------- #
# Login                                                                       #
# --------------------------------------------------------------------------- #
@bp.route("/login", methods=["POST"])
@limiter.limit("30/hour")
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
@bp.route("/reset-password", methods=["POST"])
@jwt_required()
def reset_password():
    return _json_error("Reset password feature not implemented yet.", 501)


# WILL NOT PUT IN MVP YET
@bp.route("/user-info", methods=["GET"])
# GET user info, like username, "tokens", etc.
@jwt_required()
def user_info():
    return _json_error("User info feature not implemented yet.", 501)

@bp.route("/addTokens", methods=["POST"])
@jwt_required()
def add_tokens():
    return _json_error("Add tokens feature not implemented yet.", 501)

@bp.route("/deleteAccount", methods=["DELETE"])
@jwt_required()
def delete_account():
    return _json_error("Delete account feature not implemented yet.", 501)

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
@limiter.limit("60/hour")
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
    except SQLAlchemyError as e:
        db.session.rollback()
        return _json_error(f"DB error: {e}", 500)

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
    except SQLAlchemyError as e:
        db.session.rollback()
        return _json_error(f"DB error: {e}", 500)

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
    except SQLAlchemyError as e:
        db.session.rollback()
        return _json_error(f"DB error: {e}", 500)

    return jsonify(message="deleted"), 200


# --------------------------------------------------------------------------- #
# Exports                                                                     #
# --------------------------------------------------------------------------- #

# GET JSON DATA in BODY, make CSV and email it with nodemailer / equivalent package for python, most likely using Flask-Mail/Resend
# @bp.route("/export", methods=["POST"])
# # @jwt_required()
# def export_data():
#     from pprint import pprint

#     try:
#         # Prefer JSON body first
#         payload = request.get_json(force=True, silent=True) or {}

#         print("\n--- /export received ---")
#         pprint(payload)
#         print("------------------------\n")

#         return jsonify(message="Payload received", data=payload), 200

#     except Exception as e:
#         return _json_error(f"Error parsing request: {str(e)}", 400)

def encode_attachment(file_path):
    with open(file_path, "rb") as f:
        content = f.read()
        return {
            "filename": os.path.basename(file_path),
            "content": base64.b64encode(content).decode("utf-8"),
        }


@bp.route("/export", methods=["POST"])
# @jwt_required()
def export_data():
    payload = request.get_json(force=True, silent=True) or {}
    export_id = payload.get("exportId") or datetime.utcnow().strftime("%Y%m%d%H%M%S")
    headers_str = payload.get("headers", "")
    rows = payload.get("rows", [])

    try:
        if not rows:
            return _json_error("No rows to export", 400)

        # Parse headers
        minimal_headers = [h.strip() for h in headers_str.split(",") if h.strip()]
        full_fieldnames = set()

        parsed_rows = []
        for row in rows:
            try:
                merged = {
                    **json.loads(row["data"]),
                    "id": row.get("id"),
                    "form_id": row.get("form_id"),
                    # "key": row.get("key"),
                    "scanned_at": row.get("scanned_at"),
                }
                parsed_rows.append(merged)
                full_fieldnames.update(merged.keys())
            except Exception as e:
                continue  # or log error
        # ----------------------
        # 1. Write minimal CSV
        # ----------------------
        minimal_csv_path = os.path.join(EXPORT_FOLDER, f"{export_id}_minimal.csv")
        with open(minimal_csv_path, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=minimal_headers)
            writer.writeheader()
            for row in parsed_rows:
                writer.writerow({k: row.get(k, "") for k in minimal_headers})

        # ----------------------
        # 2. Write full CSV
        # ----------------------
        full_csv_path = os.path.join(EXPORT_FOLDER, f"{export_id}_full.csv")
        with open(full_csv_path, mode="w", newline="", encoding="utf-8") as f:
            fieldnames = sorted(full_fieldnames)
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for row in parsed_rows:
                writer.writerow(row)


        # Encode both CSVs
        minimal_attachment = encode_attachment(minimal_csv_path)
        full_attachment    = encode_attachment(full_csv_path)

        try:
            params: resend.Emails.SendParams = {
                "from": "Scan App <noreply@scans.omnaris.xyz>",
                "to": "dannyboy1737@gmail.com",
                "subject": f"Scan App Export {export_id} @ {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')}",
                "html": f"<p>Your export is ready.</p><ul><li>{minimal_attachment['filename']}</li><li>{full_attachment['filename']}</li></ul>",
                "attachments": [minimal_attachment, full_attachment],
            }

            email = resend.Emails.send(params)
            print(email)

        except Exception as e:
            current_app.logger.exception("Failed to send email")
            return _json_error("Failed to send export email", 500)

        return jsonify(
            message="Exported successfully",
            export_id=export_id,
            minimal_csv=f"/savedExports/{export_id}_minimal.csv",
            full_csv=f"/savedExports/{export_id}_full.csv"
        ), 200

    except Exception as e:
        current_app.logger.exception("Export failed")
        return _json_error("Failed to export data", 500)