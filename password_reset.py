"""Password reset tokens and notification emails."""

import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from html import escape

from flask import request

from mailer import send_email
from reporting import _email_shell

KIGALI_OFFSET = timedelta(hours=2)


def now_kigali():
    return datetime.now(timezone.utc) + KIGALI_OFFSET


def now_iso():
    return now_kigali().strftime("%Y-%m-%dT%H:%M:%S")


def reset_expiry_hours():
    raw = (os.environ.get("PASSWORD_RESET_EXPIRY_HOURS") or "48").strip()
    try:
        return max(1, int(raw))
    except ValueError:
        return 48


def app_base_url():
    base = (os.environ.get("APP_BASE_URL") or "").strip().rstrip("/")
    if base:
        return base
    if request:
        return request.host_url.rstrip("/")
    return "http://127.0.0.1:5000"


def hash_reset_token(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def init_password_reset_table(db):
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            used_at TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
            ON password_reset_tokens(user_id);
        """
    )


def get_user_by_email(db, email):
    normalized = (email or "").strip().lower()
    if not normalized:
        return None
    return db.execute(
        """SELECT * FROM users
           WHERE LOWER(TRIM(email)) = ? AND is_active = 1""",
        (normalized,),
    ).fetchone()


def create_password_reset_token(db, user_id):
    ts = now_iso()
    expires = (
        now_kigali() + timedelta(hours=reset_expiry_hours())
    ).strftime("%Y-%m-%dT%H:%M:%S")
    db.execute(
        "DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL",
        (user_id,),
    )
    token = secrets.token_urlsafe(32)
    db.execute(
        """INSERT INTO password_reset_tokens
           (user_id, token_hash, expires_at, created_at)
           VALUES (?, ?, ?, ?)""",
        (user_id, hash_reset_token(token), expires, ts),
    )
    return token


def find_valid_reset_token(db, token):
    if not token:
        return None
    return db.execute(
        """SELECT * FROM password_reset_tokens
           WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?""",
        (hash_reset_token(token), now_iso()),
    ).fetchone()


def mark_reset_token_used(db, token_id):
    db.execute(
        "UPDATE password_reset_tokens SET used_at = ? WHERE id = ?",
        (now_iso(), token_id),
    )


def send_password_reset_email(to_email, display_name, username, reset_url):
    hours = reset_expiry_hours()
    subject = "Reset your Brew & Scoop password"
    body = f"""
      <p>Hi {escape(display_name)},</p>
      <p>We received a request to reset your Brew &amp; Scoop password.</p>
      <div style="background:#faf7f2;border:1px solid #ece3d8;border-radius:10px;padding:16px;margin:20px 0;">
        <div style="font-size:12px;color:#7a6a5c;text-transform:uppercase;letter-spacing:0.04em;">
          Your sign-in username
        </div>
        <div style="font-size:20px;font-weight:bold;margin-top:8px;color:#2b2118;font-family:monospace;">
          {escape(username)}
        </div>
        <p style="margin:10px 0 0;font-size:13px;color:#7a6a5c;">
          Use this username when signing in after you reset your password.
        </p>
      </div>
      <p style="margin:24px 0;">
        <a href="{escape(reset_url)}"
           style="display:inline-block;background:#5c3d2e;color:#ffffff;text-decoration:none;
                  padding:12px 20px;border-radius:8px;font-weight:600;">
          Reset password
        </a>
      </p>
      <p style="color:#7a6a5c;font-size:14px;">
        This link expires in {hours} hour{'s' if hours != 1 else ''}.
        If you did not request this, you can ignore this email.
      </p>
      <p style="color:#7a6a5c;font-size:13px;word-break:break-all;">
        Or copy this reset link: {escape(reset_url)}
      </p>
    """
    html = _email_shell(subject, body).replace(
        "Automated daily report from Brew &amp; Scoop.",
        "Password reset message from Brew &amp; Scoop.",
    )
    text = (
        f"Hi {display_name},\n\n"
        f"We received a request to reset your Brew & Scoop password.\n\n"
        f"Your sign-in username: {username}\n"
        f"Use this username when signing in after you reset your password.\n\n"
        f"Reset your password: {reset_url}\n\n"
        f"This link expires in {hours} hours.\n"
        "If you did not request this, ignore this email."
    )
    send_email([to_email], subject, html, text)


def request_password_reset(db, email):
    user = get_user_by_email(db, email)
    if not user or not (user["email"] or "").strip():
        return

    token = create_password_reset_token(db, user["id"])
    reset_url = f"{app_base_url()}/reset-password?token={token}"
    send_password_reset_email(
        user["email"].strip(),
        user["display_name"],
        user["username"],
        reset_url,
    )
    db.commit()
