-- schema.sql
CREATE TABLE users (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_key TEXT UNIQUE NOT NULL,
  email TEXT 
);

CREATE TABLE scans (
  id         TEXT    PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id),
  form_id    TEXT    NOT NULL,
  scanned_at TEXT    NOT NULL,
  data       TEXT    NOT NULL,
  key        TEXT    NOT NULL,
  exported   INTEGER NOT NULL DEFAULT 0,
  synced     INTEGER NOT NULL DEFAULT 0
);