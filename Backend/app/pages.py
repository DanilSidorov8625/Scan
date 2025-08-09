# app/pages.py
from flask import Blueprint, render_template, request

pages_bp = Blueprint("pages", __name__, template_folder="templates")

@pages_bp.route("/reset", methods=["GET"])
def reset_password_page():
    token = request.args.get("token", "")
    return render_template("reset_password.html", token=token)

@pages_bp.route("/tokens/success")
def tokens_success():
    return render_template("tokens_success.html")

@pages_bp.route("/tokens/cancel")
def tokens_cancel():
    return render_template("tokens_cancel.html")