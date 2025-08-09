# app/__init__.py
import os
from datetime import timedelta
from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_migrate import Migrate
import resend
import stripe

from .pages import pages_bp

db = SQLAlchemy()
jwt = JWTManager()
limiter = Limiter(key_func=get_remote_address, default_limits=["200 per hour"])
migrate = Migrate()  # <- create globally

def create_app():
    app = Flask(__name__, instance_relative_config=True)

    # Ensure instance folder exists (for SQLite file)
    os.makedirs(app.instance_path, exist_ok=True)

    app.config.from_mapping(
        STRIPE_API_KEY=os.getenv("STRIPE_API_KEY"),
        STRIPE_WEBHOOK_SECRET=os.getenv("STRIPE_WEBHOOK_SECRET"),
        SECRET_KEY=os.getenv("SECRET_KEY"),
        JWT_SECRET_KEY=os.getenv("JWT_SECRET_KEY"),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SQLALCHEMY_DATABASE_URI="sqlite:///" + os.path.join(app.instance_path, "app.db"),
        RESEND_API_KEY=os.getenv("RESEND_API_KEY"),
        JWT_ACCESS_TOKEN_EXPIRES=timedelta(days=7),
        MAX_EXPORT_ROWS=int(os.getenv("MAX_EXPORT_ROWS", "5000")),
        MAX_PAYLOAD_BYTES=int(os.getenv("MAX_PAYLOAD_BYTES", str(2 * 1024 * 1024))),
        FRONTEND_ORIGINS=os.getenv(
            "FRONTEND_ORIGINS",
            "http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006,http://127.0.0.1:19006",
        ),
        PASSWORD_RESET_TOKEN_TTL=int(os.getenv("PASSWORD_RESET_TOKEN_TTL", "3600")),
    )


    if not app.debug and (not app.config["SECRET_KEY"] or not app.config["JWT_SECRET_KEY"]):
        raise RuntimeError("SECRET_KEY and JWT_SECRET_KEY must be set in production")

    db.init_app(app)
    jwt.init_app(app)
    limiter.init_app(app)

    CORS(
        app,
        origins=[o.strip() for o in app.config["FRONTEND_ORIGINS"].split(",") if o.strip()],
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        supports_credentials=False,
    )

    if app.config.get("RESEND_API_KEY"):
        resend.api_key = app.config["RESEND_API_KEY"]

    @app.errorhandler(Exception)
    def handle_errors(e):
        code = e.code if isinstance(e, HTTPException) else 500
        if code >= 500:
            app.logger.exception("Unhandled error")
        return jsonify(error="Internal error" if code >= 500 else getattr(e, "description", "Bad request")), code

    # Import models BEFORE initializing Migrate, so Alembic sees tables/columns
    from . import models  # <- make sure this imports User, Email, etc.

    migrate.init_app(app, db)  # <- after models import

    from .routes import bp as routes_bp
    app.register_blueprint(routes_bp, url_prefix="/api")
    app.register_blueprint(pages_bp)

    # ❌ REMOVE db.create_all(); migrations handle schema
    # with app.app_context():
    #     db.create_all()

    return app