# app/__init__.py
import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager

db  = SQLAlchemy()
jwt = JWTManager()

def create_app():
    app = Flask(__name__, instance_relative_config=True)

    # 1) Ensure the instance folder exists
    try:
        os.makedirs(app.instance_path, exist_ok=True)
    except Exception as e:
        app.logger.error("Could not create instance folder: %s", e)

    # 2) Load config from environment
    app.config.from_mapping(
        SECRET_KEY                  = os.getenv("SECRET_KEY", "change-me"),
        JWT_SECRET_KEY              = os.getenv("JWT_SECRET_KEY", "change-me-too"),
        SQLALCHEMY_TRACK_MODIFICATIONS = False,
        # 3) Build the SQLite URI from the absolute instance path
        SQLALCHEMY_DATABASE_URI     = "sqlite:///" + os.path.join(app.instance_path, "app.db"),
    )

    # init extensions
    db.init_app(app)
    jwt.init_app(app)

    # register routes
    from .routes import bp as routes_bp
    app.register_blueprint(routes_bp)

    # create tables if they don't exist
    with app.app_context():
        db.create_all()

    return app