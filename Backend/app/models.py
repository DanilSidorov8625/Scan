# app/models.py

from . import db
from datetime import datetime

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    user_key = db.Column(db.Text, unique=True, nullable=False)
    email = db.Column(db.Text, nullable=True)

    scans = db.relationship('Scan', backref='user', cascade='all, delete-orphan')

    def __repr__(self):
        return f"<User id={self.id} key={self.user_key}>"


class Scan(db.Model):
    __tablename__ = 'scans'

    id = db.Column(db.Text, primary_key=True)
    userId = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    formId = db.Column(db.Text, nullable=False)
    scannedAt = db.Column(db.Text, nullable=False)
    data = db.Column(db.Text, nullable=False)
    key = db.Column(db.Text, nullable=False)
    exported = db.Column(db.Integer, nullable=False, default=0)
    synced = db.Column(db.Integer, nullable=False, default=0)

    def __repr__(self):
        return f"<Scan id={self.id} form={self.formId} key={self.key}>"