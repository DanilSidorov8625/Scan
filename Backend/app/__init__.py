# app/__init__.py
import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

db      = SQLAlchemy()
jwt     = JWTManager()
limiter = Limiter(key_func=get_remote_address)

def create_app():
    app = Flask(__name__, instance_relative_config=True)

    # 1) Ensure the instance folder exists
    try:
        os.makedirs(app.instance_path, exist_ok=True)
    except Exception as e:
        app.logger.error("Could not create instance folder: %s", e)

    # 2) Load config from environment
    app.config.from_mapping(
        SECRET_KEY                     = os.getenv("SECRET_KEY", ""),
        JWT_SECRET_KEY                 = os.getenv("JWT_SECRET_KEY", ""),
        SQLALCHEMY_TRACK_MODIFICATIONS = False,
        SQLALCHEMY_DATABASE_URI        = "sqlite:///" + os.path.join(app.instance_path, "app.db"),
        RESEND_API_KEY                 = os.getenv("RESEND_API_KEY", ""),
    )

    # 3) Init extensions on the app
    db.init_app(app)
    jwt.init_app(app)
    limiter.init_app(app)
    CORS(
      app,
      origins=["http://localhost:8081", "http://127.0.0.1:8081", "http://localhost:19006", "http://127.0.0.1:19006"],
      allow_headers=["Content-Type", "Authorization"],
      methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    )

    # 4) Register your API blueprint
    from .routes import bp as routes_bp
    app.register_blueprint(routes_bp, url_prefix="/api")

    # 5) Create tables if they don't exist
    with app.app_context():
        db.create_all()

    return app