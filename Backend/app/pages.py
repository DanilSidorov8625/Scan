# app/pages.py
from flask import Blueprint, render_template, request

pages_bp = Blueprint("pages", __name__, template_folder="templates")

@pages_bp.route("/reset", methods=["GET"])
def reset_password_page():
    token = request.args.get("token", "")
    return render_template("reset_password.html", token=token)
