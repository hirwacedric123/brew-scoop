"""Authentication helpers for Brew & Scoop."""

from functools import wraps

from flask import jsonify, redirect, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

ROLES = ("admin", "stock_manager")


def init_users_table(db):
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin', 'stock_manager')),
            is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
        """
    )


def row_to_user(row):
    return {
        "id": row["id"],
        "username": row["username"],
        "display_name": row["display_name"],
        "role": row["role"],
        "is_active": bool(row["is_active"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def public_user(row):
    data = row_to_user(row)
    data.pop("created_at", None)
    data.pop("updated_at", None)
    return data


def get_user_by_id(db, user_id):
    return db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def get_user_by_username(db, username):
    return db.execute(
        "SELECT * FROM users WHERE username = ? COLLATE NOCASE",
        (username.strip(),),
    ).fetchone()


def get_current_user(db):
    user_id = session.get("user_id")
    if not user_id:
        return None
    row = get_user_by_id(db, user_id)
    if not row or not row["is_active"]:
        session.clear()
        return None
    return row


def login_user(user_id):
    session.clear()
    session["user_id"] = user_id
    session.permanent = True


def logout_user():
    session.clear()


def hash_password(password):
    return generate_password_hash(password)


def verify_password(password_hash, password):
    return check_password_hash(password_hash, password)


def validate_user_payload(data, creating=False):
    username = (data.get("username") or "").strip()
    display_name = (data.get("display_name") or "").strip()
    password = data.get("password") or ""
    role = (data.get("role") or "stock_manager").strip()

    if not username:
        return "Username is required"
    if len(username) < 3:
        return "Username must be at least 3 characters"
    if not username.replace("_", "").replace("-", "").isalnum():
        return "Username may only contain letters, numbers, hyphens, and underscores"

    if creating and not password:
        return "Password is required"
    if password and len(password) < 6:
        return "Password must be at least 6 characters"

    if not display_name:
        display_name = username

    if role not in ROLES:
        return f"Invalid role. Choose from: {', '.join(ROLES)}"

    return None


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        from app import get_db

        if get_current_user(get_db()) is None:
            if request.path.startswith("/api/"):
                return jsonify({"error": "Authentication required"}), 401
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)

    return wrapped


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        from app import get_db

        user = get_current_user(get_db())
        if user is None:
            return jsonify({"error": "Authentication required"}), 401
        if user["role"] != "admin":
            return jsonify({"error": "Admin access required"}), 403
        return view(*args, **kwargs)

    return wrapped
