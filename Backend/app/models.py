from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from . import db

class User(db.Model):
    __tablename__ = "users"

    id            = db.Column(db.Integer, primary_key=True)
    username      = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)

    emails = db.relationship("Email", backref="user", lazy="dynamic")

    tokensTotal = db.Column(db.Integer, nullable=False, server_default="0")
    tokensUsed  = db.Column(db.Integer, nullable=False, server_default="0")
    stripeID       = db.Column(db.String(255), nullable=True)

    def set_password(self, password: str):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

class Email(db.Model):
    __tablename__ = "emails"

    id        = db.Column(db.Integer, primary_key=True)
    user_id   = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )
    email     = db.Column(db.String(120), nullable=False)
    is_active = db.Column(db.Boolean, default=False, nullable=False)

    __table_args__ = (
        db.UniqueConstraint("user_id", "email", name="uq_user_email"),
    )

class PasswordResetToken(db.Model):
    __tablename__ = "password_reset_tokens"

    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash = db.Column(db.String(128), nullable=False, index=True)
    expires_at = db.Column(db.DateTime, nullable=False)
    used_at    = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    user = db.relationship("User")

    def is_valid(self) -> bool:
        return self.used_at is None and datetime.utcnow() < self.expires_at



class Export(db.Model):
    __tablename__ = "exports"

    id = db.Column(db.Integer, primary_key=True)
    export_id = db.Column(db.String(64), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    form_id = db.Column(db.String(64), nullable=True)

    minimal_csv = db.Column(db.String(255), nullable=False)
    full_csv = db.Column(db.String(255), nullable=False)
    payload_json = db.Column(db.String(255), nullable=False)

    email_sent = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    user = db.relationship("User", backref="exports")


class ProcessedEvent(db.Model):
    __tablename__ = "processed_events"
    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.String(255), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
