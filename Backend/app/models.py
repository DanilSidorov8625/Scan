from . import db
from werkzeug.security import generate_password_hash, check_password_hash

class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)

    # back‐ref to all Email entries
    emails = db.relationship("Email", backref="user", lazy="dynamic")

    def set_password(self, password: str):
        """Hashes & stores the password."""
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        """Verifies a plaintext password against the stored hash."""
        return check_password_hash(self.password_hash, password)


class Email(db.Model):
    __tablename__ = "emails"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )
    email = db.Column(db.String(120), nullable=False)
    is_active = db.Column(db.Boolean, default=False, nullable=False)
