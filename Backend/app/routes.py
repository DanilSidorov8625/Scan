# app/routes.py

from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import (
    create_access_token, jwt_required, get_jwt_identity
)
from app.models import db, User, Scan
import uuid, csv, io, os

bp = Blueprint("api", __name__)

@bp.route("/register", methods=["POST"])
def register():
    # TODO: accept email, create User.user_key, etc.
    new_key = str(uuid.uuid4())
    user = User(user_key=new_key, email=request.json.get("email"))
    db.session.add(user); db.session.commit()
    return jsonify(user_key=new_key), 201

@bp.route("/login", methods=["POST"])
def login():
    # 1) Try to read from form data first, then fall back to JSON:
    key = request.form.get("user_key") or (request.get_json(silent=True) or {}).get("user_key")
    if not key:
        return jsonify(error="Missing user_key"), 400

    # 2) Lookup
    user = User.query.filter_by(user_key=key).first()
    if not user:
        return jsonify(error="Bad user_key"), 401

    # 3) Create JWT
    token = create_access_token(identity=key)
    return jsonify(access_token=token), 200

@bp.route("/scan", methods=["POST"])
@jwt_required()
def scan():
    # get the user_key from the JWT and look up the user
    key = get_jwt_identity()
    user = User.query.filter_by(user_key=key).first_or_404()

    # 1) grab everything from form data if supplied, otherwise from JSON
    form = request.form or {}
    payload = form if form else (request.get_json(silent=True) or {})

    # 2) extract fields
    scanId   = payload.get("id")
    formId   = payload.get("formId")
    data      = payload.get("data")
    key = payload.get("key")
    scannedAt = payload.get("scannedAt")

    # 3) validate required fields
    if not formId or not data or not key:
        return jsonify(error="Missing one of required fields: formId, data, key"), 400

    # 4) create & save
    scan = Scan(
        id         = scanId,
        userId    = user.id,
        formId    = formId,
        data       = data,
        key        = key,
        scannedAt = scannedAt,
        synced = 1
    )
    try:
        db.session.add(scan)
        db.session.commit()
        return jsonify(message="Scan created successfully", scanId=scan.id), 201
    except Exception as e:
        db.session.rollback()
        print("❌ DB error:", repr(e))   # ← ADD THIS
        return jsonify(error="Failed to create scan"), 500



@bp.route("/export", methods=["GET"])
@jwt_required()
def export():
    # TODO: stream CSV back
    return jsonify(message="TODO"), 501

@bp.route("/change-user-key", methods=["POST"])
@jwt_required()
def change_user_key():
    return jsonify(message="TODO"), 501

@bp.route("/resend-user-key", methods=["POST"])
@jwt_required()
def resend_user_key():
    return jsonify(message="TODO"), 501

@bp.route("/resend-export", methods=["POST"])
@jwt_required()
def resend_export():
    return jsonify(message="TODO"), 501

@bp.route("/delete-account", methods=["DELETE"])
@jwt_required()
def delete_account():
    return jsonify(message="TODO"), 501