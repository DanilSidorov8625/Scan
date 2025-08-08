import os
from flask import Flask, app, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.exceptions import HTTPException
import resend
from datetime import timedelta
from .pages import pages_bp

db      = SQLAlchemy()
jwt     = JWTManager()
limiter = Limiter(key_func=get_remote_address, default_limits=["200 per hour"])

def create_app():
    app = Flask(__name__, instance_relative_config=True)

    # Ensure instance folder exists (for SQLite default)
    try:
        os.makedirs(app.instance_path, exist_ok=True)
    except Exception as e:
        app.logger.error("Could not create instance folder: %s", e)

    # Load config from environment
    app.config.from_mapping(
        SECRET_KEY=os.getenv("SECRET_KEY"),
        JWT_SECRET_KEY=os.getenv("JWT_SECRET_KEY"),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SQLALCHEMY_DATABASE_URI        = "sqlite:///" + os.path.join(app.instance_path, "app.db"),
        RESEND_API_KEY=os.getenv("RESEND_API_KEY"),
        # Safety/ops limits
        JWT_ACCESS_TOKEN_EXPIRES=timedelta(days=7),   # Access tokens valid for 7 days


        MAX_EXPORT_ROWS=int(os.getenv("MAX_EXPORT_ROWS", "5000")),
        MAX_PAYLOAD_BYTES=int(os.getenv("MAX_PAYLOAD_BYTES", str(2 * 1024 * 1024))),  # 2MB
        FRONTEND_ORIGINS=os.getenv(
            "FRONTEND_ORIGINS",
            "http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006,http://127.0.0.1:19006",
        ),
        PASSWORD_RESET_TOKEN_TTL=int(os.getenv("PASSWORD_RESET_TOKEN_TTL", "3600")),  # 1 hour
    )

    # Fail fast if secrets missing (in non-dev)
    if not app.debug and (not app.config["SECRET_KEY"] or not app.config["JWT_SECRET_KEY"]):
        raise RuntimeError("SECRET_KEY and JWT_SECRET_KEY must be set in production")

    # Init extensions
    db.init_app(app)
    jwt.init_app(app)
    limiter.init_app(app)

    # CORS from env
    CORS(
        app,
        origins=[o.strip() for o in app.config["FRONTEND_ORIGINS"].split(",") if o.strip()],
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        supports_credentials=False,
    )

    # Configure Resend
    if app.config.get("RESEND_API_KEY"):
        resend.api_key = app.config["RESEND_API_KEY"]

    # Consistent JSON error responses; no internal details leaked
    @app.errorhandler(Exception)
    def handle_errors(e):
        code = 500
        if isinstance(e, HTTPException):
            code = e.code
        app.logger.exception("Unhandled error") if code >= 500 else None
        return jsonify(
            error="Internal error" if code >= 500 else getattr(e, "description", "Bad request")
        ), code

    # Register API
    from .routes import bp as routes_bp
    app.register_blueprint(routes_bp, url_prefix="/api")
    app.register_blueprint(pages_bp)


    # Create tables
    with app.app_context():
        db.create_all()

    return app
