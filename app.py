"""Brew & Scoop Stock Management — Flask backend."""

import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone

from flask import Flask, jsonify, redirect, render_template, request, g, url_for
from werkzeug.security import generate_password_hash

from auth import (
    admin_required,
    get_current_user,
    get_user_by_username,
    hash_password,
    init_users_table,
    login_required,
    login_user,
    logout_user,
    public_user,
    row_to_user,
    validate_user_payload,
    verify_password,
)

app = Flask(__name__)
app.config["DATABASE"] = os.path.join(os.path.dirname(__file__), "brew_scoop.db")
app.config["SECRET_KEY"] = os.environ.get(
    "BREW_SCOOP_SECRET_KEY", "dev-change-me-in-production"
)
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=7)

KIGALI_OFFSET = timedelta(hours=2)

CATEGORIES = [
    "Coffee",
    "Tea",
    "Juice",
    "Water",
    "Energy Drinks",
    "Ice Cream",
    "Chapati",
    "Other",
]


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(app.config["DATABASE"])
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(app.config["DATABASE"])
    db.row_factory = sqlite3.Row
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'Other',
            price REAL NOT NULL CHECK(price >= 0),
            quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
            reorder_level INTEGER NOT NULL DEFAULT 10 CHECK(reorder_level >= 0),
            sku TEXT,
            description TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('sale', 'restock', 'adjustment')),
            quantity INTEGER NOT NULL,
            unit_price REAL NOT NULL,
            total_amount REAL NOT NULL,
            notes TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
        CREATE INDEX IF NOT EXISTS idx_transactions_product ON transactions(product_id);
        CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);
        """
    )
    _migrate_db(db)
    init_users_table(db)
    _seed_default_admin(db)
    db.commit()
    db.close()


def _migrate_db(db):
    cols = {row[1] for row in db.execute("PRAGMA table_info(transactions)").fetchall()}
    if "checkout_ref" not in cols:
        db.execute("ALTER TABLE transactions ADD COLUMN checkout_ref TEXT")
    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_transactions_checkout ON transactions(checkout_ref)"
    )


def _seed_default_admin(db):
    count = db.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]
    if count > 0:
        return

    username = os.environ.get("BREW_SCOOP_ADMIN_USERNAME", "admin")
    password = os.environ.get("BREW_SCOOP_ADMIN_PASSWORD", "admin123")
    display_name = os.environ.get("BREW_SCOOP_ADMIN_NAME", "Administrator")
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")

    db.execute(
        """INSERT INTO users
           (username, password_hash, display_name, role, is_active, created_at, updated_at)
           VALUES (?, ?, ?, 'admin', 1, ?, ?)""",
        (username, generate_password_hash(password), display_name, ts, ts),
    )


def now_kigali():
    return datetime.now(timezone.utc) + KIGALI_OFFSET


def now_iso():
    return now_kigali().strftime("%Y-%m-%dT%H:%M:%S")


def today_kigali():
    return now_kigali().strftime("%Y-%m-%d")


def parse_date(value):
    if not value or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


def week_range_kigali():
    today = now_kigali().date()
    start = today - timedelta(days=today.weekday())
    return start.strftime("%Y-%m-%d"), today.strftime("%Y-%m-%d")


def month_range_kigali():
    today = now_kigali().date()
    start = today.replace(day=1)
    return start.strftime("%Y-%m-%d"), today.strftime("%Y-%m-%d")


def row_to_product(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "category": row["category"],
        "price": round(row["price"], 2),
        "quantity": row["quantity"],
        "reorder_level": row["reorder_level"],
        "sku": row["sku"] or "",
        "description": row["description"] or "",
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "stock_status": _stock_status(row["quantity"], row["reorder_level"]),
    }


def _stock_status(quantity, reorder_level):
    if quantity <= 0:
        return "out"
    if quantity <= reorder_level:
        return "low"
    return "ok"


def row_to_transaction(row):
    return {
        "id": row["id"],
        "product_id": row["product_id"],
        "product_name": row["product_name"],
        "category": row["category"],
        "type": row["type"],
        "quantity": row["quantity"],
        "unit_price": round(row["unit_price"], 2),
        "total_amount": round(row["total_amount"], 2),
        "notes": row["notes"] or "",
        "checkout_ref": row["checkout_ref"] or "",
        "created_at": row["created_at"],
        "sale_date": row["created_at"][:10],
    }


def _sales_summary(db, date_from, date_to):
    row = db.execute(
        """SELECT COALESCE(SUM(total_amount), 0) AS revenue,
                  COALESCE(SUM(quantity), 0) AS units,
                  COUNT(*) AS transactions
           FROM transactions
           WHERE type = 'sale'
             AND substr(created_at, 1, 10) >= ?
             AND substr(created_at, 1, 10) <= ?""",
        (date_from, date_to),
    ).fetchone()
    return {
        "revenue": round(row["revenue"], 2),
        "units": row["units"],
        "transactions": row["transactions"],
    }


def _daily_sales_breakdown(db, date_from, date_to):
    rows = db.execute(
        """SELECT substr(created_at, 1, 10) AS sale_date,
                  COALESCE(SUM(total_amount), 0) AS revenue,
                  COALESCE(SUM(quantity), 0) AS units,
                  COUNT(*) AS transactions
           FROM transactions
           WHERE type = 'sale'
             AND substr(created_at, 1, 10) >= ?
             AND substr(created_at, 1, 10) <= ?
           GROUP BY sale_date
           ORDER BY sale_date DESC""",
        (date_from, date_to),
    ).fetchall()
    return [
        {
            "date": r["sale_date"],
            "revenue": round(r["revenue"], 2),
            "units": r["units"],
            "transactions": r["transactions"],
        }
        for r in rows
    ]


# ── Pages ──────────────────────────────────────────────────────────────────

@app.route("/login")
def login():
    if get_current_user(get_db()) is not None:
        return redirect(url_for("index"))
    return render_template("login.html")


@app.route("/")
@login_required
def index():
    user = get_current_user(get_db())
    return render_template(
        "index.html",
        categories=CATEGORIES,
        current_user=public_user(user),
    )


# ── Auth API ───────────────────────────────────────────────────────────────

@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    db = get_db()
    row = get_user_by_username(db, username)
    if not row or not row["is_active"] or not verify_password(row["password_hash"], password):
        return jsonify({"error": "Invalid username or password"}), 401

    login_user(row["id"])
    return jsonify({"user": public_user(row)})


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    logout_user()
    return jsonify({"message": "Logged out"})


@app.route("/api/auth/me", methods=["GET"])
@login_required
def auth_me():
    user = get_current_user(get_db())
    return jsonify({"user": public_user(user)})


# ── Admin API ──────────────────────────────────────────────────────────────

@app.route("/api/admin/users", methods=["GET"])
@admin_required
def admin_list_users():
    rows = get_db().execute(
        "SELECT * FROM users ORDER BY role ASC, username ASC"
    ).fetchall()
    return jsonify([row_to_user(r) for r in rows])


@app.route("/api/admin/users", methods=["POST"])
@admin_required
def admin_create_user():
    data = request.get_json(silent=True) or {}
    error = validate_user_payload(data, creating=True)
    if error:
        return jsonify({"error": error}), 400

    db = get_db()
    if get_user_by_username(db, data["username"]):
        return jsonify({"error": "Username already exists"}), 409

    ts = now_iso()
    cur = db.execute(
        """INSERT INTO users
           (username, password_hash, display_name, role, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)""",
        (
            data["username"].strip(),
            hash_password(data["password"]),
            (data.get("display_name") or data["username"]).strip(),
            data.get("role", "stock_manager"),
            ts,
            ts,
        ),
    )
    db.commit()
    row = get_db().execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(row_to_user(row)), 201


@app.route("/api/admin/users/<int:user_id>", methods=["PUT"])
@admin_required
def admin_update_user(user_id):
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        return jsonify({"error": "User not found"}), 404

    current = get_current_user(db)
    data = request.get_json(silent=True) or {}

    if "display_name" in data:
        display_name = (data.get("display_name") or "").strip()
        if not display_name:
            return jsonify({"error": "Display name cannot be empty"}), 400
    else:
        display_name = row["display_name"]

    if "role" in data:
        role = data["role"]
        if role not in ("admin", "stock_manager"):
            return jsonify({"error": "Invalid role"}), 400
        if current["id"] == user_id and role != "admin":
            return jsonify({"error": "You cannot remove your own admin role"}), 400
    else:
        role = row["role"]

    if "is_active" in data:
        is_active = 1 if data["is_active"] else 0
        if current["id"] == user_id and not is_active:
            return jsonify({"error": "You cannot deactivate your own account"}), 400
    else:
        is_active = row["is_active"]

    password_hash = row["password_hash"]
    if data.get("password"):
        if len(data["password"]) < 6:
            return jsonify({"error": "Password must be at least 6 characters"}), 400
        password_hash = hash_password(data["password"])

    ts = now_iso()
    db.execute(
        """UPDATE users SET
           display_name=?, role=?, is_active=?, password_hash=?, updated_at=?
           WHERE id=?""",
        (display_name, role, is_active, password_hash, ts, user_id),
    )
    db.commit()
    updated = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return jsonify(row_to_user(updated))


@app.route("/api/admin/users/<int:user_id>", methods=["DELETE"])
@admin_required
def admin_delete_user(user_id):
    db = get_db()
    current = get_current_user(db)
    if current["id"] == user_id:
        return jsonify({"error": "You cannot delete your own account"}), 400

    row = db.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        return jsonify({"error": "User not found"}), 404

    db.execute("DELETE FROM users WHERE id = ?", (user_id,))
    db.commit()
    return jsonify({"message": "User deleted"})


# ── Products API ───────────────────────────────────────────────────────────

@app.route("/api/products", methods=["GET"])
@login_required
def list_products():
    db = get_db()
    search = request.args.get("search", "").strip()
    category = request.args.get("category", "").strip()
    low_only = request.args.get("low_stock") == "1"

    query = "SELECT * FROM products WHERE 1=1"
    params = []

    if search:
        query += " AND (name LIKE ? OR sku LIKE ? OR description LIKE ?)"
        like = f"%{search}%"
        params.extend([like, like, like])
    if category:
        query += " AND category = ?"
        params.append(category)
    if low_only:
        query += " AND quantity <= reorder_level"

    query += " ORDER BY name ASC"
    rows = db.execute(query, params).fetchall()
    return jsonify([row_to_product(r) for r in rows])


@app.route("/api/products/<int:product_id>", methods=["GET"])
@login_required
def get_product(product_id):
    row = get_db().execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if not row:
        return jsonify({"error": "Product not found"}), 404
    return jsonify(row_to_product(row))


@app.route("/api/products", methods=["POST"])
@login_required
def create_product():
    data = request.get_json(silent=True) or {}
    error = _validate_product(data)
    if error:
        return jsonify({"error": error}), 400

    ts = now_iso()
    db = get_db()
    cur = db.execute(
        """INSERT INTO products
           (name, category, price, quantity, reorder_level, sku, description, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            data["name"].strip(),
            data.get("category", "Other"),
            float(data["price"]),
            int(data.get("quantity", 0)),
            int(data.get("reorder_level", 10)),
            (data.get("sku") or "").strip() or None,
            (data.get("description") or "").strip() or None,
            ts,
            ts,
        ),
    )
    if int(data.get("quantity", 0)) > 0:
        db.execute(
            """INSERT INTO transactions
               (product_id, type, quantity, unit_price, total_amount, notes, created_at)
               VALUES (?, 'restock', ?, ?, ?, ?, ?)""",
            (cur.lastrowid, int(data["quantity"]), float(data["price"]),
             float(data["price"]) * int(data["quantity"]), "Initial stock", ts),
        )
    db.commit()
    row = db.execute("SELECT * FROM products WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(row_to_product(row)), 201


@app.route("/api/products/<int:product_id>", methods=["PUT"])
@login_required
def update_product(product_id):
    row = get_db().execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if not row:
        return jsonify({"error": "Product not found"}), 404

    data = request.get_json(silent=True) or {}
    error = _validate_product(data, partial=False)
    if error:
        return jsonify({"error": error}), 400

    ts = now_iso()
    db = get_db()
    db.execute(
        """UPDATE products SET
           name=?, category=?, price=?, reorder_level=?, sku=?, description=?, updated_at=?
           WHERE id=?""",
        (
            data["name"].strip(),
            data.get("category", row["category"]),
            float(data["price"]),
            int(data.get("reorder_level", row["reorder_level"])),
            (data.get("sku") or "").strip() or None,
            (data.get("description") or "").strip() or None,
            ts,
            product_id,
        ),
    )
    db.commit()
    updated = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    return jsonify(row_to_product(updated))


@app.route("/api/products/<int:product_id>", methods=["DELETE"])
@login_required
def delete_product(product_id):
    db = get_db()
    row = db.execute("SELECT id FROM products WHERE id = ?", (product_id,)).fetchone()
    if not row:
        return jsonify({"error": "Product not found"}), 404
    db.execute("DELETE FROM products WHERE id = ?", (product_id,))
    db.commit()
    return jsonify({"message": "Product deleted"})


def _validate_product(data, partial=False):
    if not data.get("name", "").strip():
        return "Product name is required"
    try:
        price = float(data.get("price", -1))
        if price < 0:
            return "Price must be zero or positive"
    except (TypeError, ValueError):
        return "Invalid price"
    if "quantity" in data:
        try:
            if int(data["quantity"]) < 0:
                return "Quantity cannot be negative"
        except (TypeError, ValueError):
            return "Invalid quantity"
    if "reorder_level" in data:
        try:
            if int(data["reorder_level"]) < 0:
                return "Reorder level cannot be negative"
        except (TypeError, ValueError):
            return "Invalid reorder level"
    cat = data.get("category", "Other")
    if cat not in CATEGORIES:
        return f"Invalid category. Choose from: {', '.join(CATEGORIES)}"
    return None


# ── Sales & Stock API ──────────────────────────────────────────────────────

def _normalize_checkout_items(raw_items):
    if not isinstance(raw_items, list) or not raw_items:
        return None, "Cart is empty"

    merged = {}
    for item in raw_items:
        try:
            product_id = int(item.get("product_id"))
            quantity = int(item.get("quantity"))
        except (TypeError, ValueError):
            return None, "Invalid item in cart"
        if quantity <= 0:
            return None, "Quantity must be greater than zero"
        merged[product_id] = merged.get(product_id, 0) + quantity

    return [{"product_id": pid, "quantity": qty} for pid, qty in merged.items()], None


def _execute_checkout(db, items, notes=None):
    checkout_ref = (
        f"CHK-{now_kigali().strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3).upper()}"
    )
    ts = now_iso()
    notes_text = (notes or "").strip() or None

    db.execute("BEGIN IMMEDIATE")
    try:
        product_ids = [item["product_id"] for item in items]
        placeholders = ",".join("?" * len(product_ids))
        rows = db.execute(
            f"SELECT * FROM products WHERE id IN ({placeholders})",
            product_ids,
        ).fetchall()
        products = {row["id"]: row for row in rows}

        for item in items:
            product_id = item["product_id"]
            quantity = item["quantity"]
            row = products.get(product_id)
            if row is None:
                db.rollback()
                return None, "Product not found", 404
            if row["quantity"] < quantity:
                db.rollback()
                return None, (
                    f"Insufficient stock for {row['name']}. "
                    f"Only {row['quantity']} available."
                ), 400

        result_items = []
        total_amount = 0.0
        total_units = 0

        for item in items:
            product_id = item["product_id"]
            quantity = item["quantity"]
            row = products[product_id]
            unit_price = float(row["price"])
            line_total = round(unit_price * quantity, 2)
            new_qty = row["quantity"] - quantity

            db.execute(
                "UPDATE products SET quantity=?, updated_at=? WHERE id=?",
                (new_qty, ts, product_id),
            )
            cur = db.execute(
                """INSERT INTO transactions
                   (product_id, type, quantity, unit_price, total_amount,
                    notes, created_at, checkout_ref)
                   VALUES (?, 'sale', ?, ?, ?, ?, ?, ?)""",
                (
                    product_id,
                    quantity,
                    unit_price,
                    line_total,
                    notes_text,
                    ts,
                    checkout_ref,
                ),
            )

            updated = db.execute(
                "SELECT * FROM products WHERE id = ?", (product_id,)
            ).fetchone()
            result_items.append({
                "transaction_id": cur.lastrowid,
                "product": row_to_product(updated),
                "quantity_sold": quantity,
                "unit_price": unit_price,
                "total_amount": line_total,
                "remaining_stock": new_qty,
            })
            total_amount += line_total
            total_units += quantity
            products[product_id] = updated

        db.commit()
        return {
            "checkout_ref": checkout_ref,
            "items": result_items,
            "total_amount": round(total_amount, 2),
            "total_units": total_units,
            "line_count": len(result_items),
        }, None, 201
    except Exception:
        db.rollback()
        raise


@app.route("/api/sales", methods=["POST"])
@login_required
def create_sale():
    data = request.get_json(silent=True) or {}
    product_id = data.get("product_id")
    quantity = data.get("quantity")

    try:
        quantity = int(quantity)
        if quantity <= 0:
            return jsonify({"error": "Quantity must be greater than zero"}), 400
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid quantity"}), 400

    items, error = _normalize_checkout_items(
        [{"product_id": product_id, "quantity": quantity}]
    )
    if error:
        return jsonify({"error": error}), 400

    db = get_db()
    result, error, status = _execute_checkout(db, items, data.get("notes"))
    if error:
        return jsonify({"error": error}), status

    item = result["items"][0]
    return jsonify({
        "transaction_id": item["transaction_id"],
        "checkout_ref": result["checkout_ref"],
        "product": item["product"],
        "quantity_sold": item["quantity_sold"],
        "unit_price": item["unit_price"],
        "total_amount": item["total_amount"],
        "remaining_stock": item["remaining_stock"],
    }), status


@app.route("/api/sales/checkout", methods=["POST"])
@login_required
def checkout_sale():
    data = request.get_json(silent=True) or {}
    items, error = _normalize_checkout_items(data.get("items"))
    if error:
        return jsonify({"error": error}), 400

    db = get_db()
    result, error, status = _execute_checkout(db, items, data.get("notes"))
    if error:
        return jsonify({"error": error}), status
    return jsonify(result), status


@app.route("/api/restock", methods=["POST"])
@login_required
def restock_product():
    data = request.get_json(silent=True) or {}
    product_id = data.get("product_id")

    try:
        quantity = int(data.get("quantity", 0))
        if quantity <= 0:
            return jsonify({"error": "Quantity must be greater than zero"}), 400
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid quantity"}), 400

    db = get_db()
    row = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if not row:
        return jsonify({"error": "Product not found"}), 404

    ts = now_iso()
    unit_price = float(data.get("unit_price", row["price"]))
    new_qty = row["quantity"] + quantity

    db.execute("UPDATE products SET quantity=?, updated_at=? WHERE id=?",
               (new_qty, ts, product_id))
    db.execute(
        """INSERT INTO transactions
           (product_id, type, quantity, unit_price, total_amount, notes, created_at)
           VALUES (?, 'restock', ?, ?, ?, ?, ?)""",
        (product_id, quantity, unit_price, round(unit_price * quantity, 2),
         (data.get("notes") or "Stock replenishment").strip(), ts),
    )
    db.commit()

    updated = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    return jsonify(row_to_product(updated))


@app.route("/api/adjust", methods=["POST"])
@login_required
def adjust_stock():
    data = request.get_json(silent=True) or {}
    product_id = data.get("product_id")

    try:
        new_quantity = int(data.get("new_quantity", -1))
        if new_quantity < 0:
            return jsonify({"error": "Quantity cannot be negative"}), 400
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid quantity"}), 400

    db = get_db()
    row = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if not row:
        return jsonify({"error": "Product not found"}), 404

    diff = new_quantity - row["quantity"]
    if diff == 0:
        return jsonify(row_to_product(row))

    ts = now_iso()
    db.execute("UPDATE products SET quantity=?, updated_at=? WHERE id=?",
               (new_quantity, ts, product_id))
    db.execute(
        """INSERT INTO transactions
           (product_id, type, quantity, unit_price, total_amount, notes, created_at)
           VALUES (?, 'adjustment', ?, ?, 0, ?, ?)""",
        (product_id, abs(diff), float(row["price"]),
         f"Adjusted from {row['quantity']} to {new_quantity}. "
         + ((data.get("notes") or "").strip() or "Manual stock correction"), ts),
    )
    db.commit()

    updated = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    return jsonify(row_to_product(updated))


# ── Transactions & Dashboard API ─────────────────────────────────────────────

@app.route("/api/transactions", methods=["GET"])
@login_required
def list_transactions():
    db = get_db()
    limit = min(int(request.args.get("limit", 50)), 500)
    tx_type = request.args.get("type", "").strip()
    date_from = request.args.get("from", "").strip()
    date_to = request.args.get("to", "").strip()

    query = """
        SELECT t.*, p.name AS product_name, p.category
        FROM transactions t
        JOIN products p ON p.id = t.product_id
        WHERE 1=1
    """
    params = []
    if tx_type:
        query += " AND t.type = ?"
        params.append(tx_type)
    if date_from:
        query += " AND substr(t.created_at, 1, 10) >= ?"
        params.append(date_from)
    if date_to:
        query += " AND substr(t.created_at, 1, 10) <= ?"
        params.append(date_to)
    query += " ORDER BY t.created_at DESC LIMIT ?"
    params.append(limit)

    rows = db.execute(query, params).fetchall()
    return jsonify([row_to_transaction(r) for r in rows])


@app.route("/api/sales/dates", methods=["GET"])
@login_required
def sales_dates():
    db = get_db()
    rows = db.execute(
        """SELECT substr(created_at, 1, 10) AS sale_date,
                  COALESCE(SUM(total_amount), 0) AS revenue,
                  COALESCE(SUM(quantity), 0) AS units,
                  COUNT(*) AS transactions
           FROM transactions
           WHERE type = 'sale'
           GROUP BY sale_date
           ORDER BY sale_date DESC"""
    ).fetchall()
    return jsonify([
        {
            "date": r["sale_date"],
            "revenue": round(r["revenue"], 2),
            "units": r["units"],
            "transactions": r["transactions"],
        }
        for r in rows
    ])


@app.route("/api/sales/report", methods=["GET"])
@login_required
def sales_report():
    preset = request.args.get("preset", "").strip()
    date_from = request.args.get("from", "").strip()
    date_to = request.args.get("to", "").strip()

    if preset == "today":
        date_from = date_to = today_kigali()
    elif preset == "week":
        date_from, date_to = week_range_kigali()
    elif preset == "month":
        date_from, date_to = month_range_kigali()
    elif not date_from or not date_to:
        return jsonify({"error": "Provide a preset or both from and to dates"}), 400

    start = parse_date(date_from)
    end = parse_date(date_to)
    if not start or not end or start > end:
        return jsonify({"error": "Invalid date range"}), 400

    db = get_db()
    sales_rows = db.execute(
        """SELECT t.*, p.name AS product_name, p.category
           FROM transactions t
           JOIN products p ON p.id = t.product_id
           WHERE t.type = 'sale'
             AND substr(t.created_at, 1, 10) >= ?
             AND substr(t.created_at, 1, 10) <= ?
           ORDER BY t.created_at DESC""",
        (date_from, date_to),
    ).fetchall()

    summary = _sales_summary(db, date_from, date_to)
    daily = _daily_sales_breakdown(db, date_from, date_to)

    return jsonify({
        "from": date_from,
        "to": date_to,
        "preset": preset or "custom",
        "summary": summary,
        "daily_breakdown": daily,
        "sales": [row_to_transaction(r) for r in sales_rows],
    })


@app.route("/api/dashboard", methods=["GET"])
@login_required
def dashboard_stats():
    db = get_db()

    products = db.execute("SELECT * FROM products").fetchall()
    total_products = len(products)
    total_stock = sum(p["quantity"] for p in products)
    inventory_value = sum(p["price"] * p["quantity"] for p in products)
    low_stock = [row_to_product(p) for p in products if p["quantity"] <= p["reorder_level"]]
    out_of_stock = sum(1 for p in products if p["quantity"] <= 0)

    today = today_kigali()
    week_from, week_to = week_range_kigali()
    month_from, month_to = month_range_kigali()

    sales_today = db.execute(
        """SELECT COALESCE(SUM(total_amount), 0) AS revenue,
                  COALESCE(SUM(quantity), 0) AS units
           FROM transactions WHERE type='sale' AND substr(created_at, 1, 10) = ?""",
        (today,),
    ).fetchone()

    sales_week = db.execute(
        """SELECT COALESCE(SUM(total_amount), 0) AS revenue,
                  COALESCE(SUM(quantity), 0) AS units
           FROM transactions
           WHERE type='sale'
             AND substr(created_at, 1, 10) >= ?
             AND substr(created_at, 1, 10) <= ?""",
        (week_from, week_to),
    ).fetchone()

    sales_month = db.execute(
        """SELECT COALESCE(SUM(total_amount), 0) AS revenue,
                  COALESCE(SUM(quantity), 0) AS units
           FROM transactions
           WHERE type='sale'
             AND substr(created_at, 1, 10) >= ?
             AND substr(created_at, 1, 10) <= ?""",
        (month_from, month_to),
    ).fetchone()

    sales_all = db.execute(
        """SELECT COALESCE(SUM(total_amount), 0) AS revenue,
                  COUNT(*) AS count
           FROM transactions WHERE type='sale'"""
    ).fetchone()

    category_stats = db.execute(
        """SELECT category,
                  COUNT(*) AS product_count,
                  SUM(quantity) AS total_qty,
                  SUM(price * quantity) AS value
           FROM products GROUP BY category ORDER BY value DESC"""
    ).fetchall()

    top_products = db.execute(
        """SELECT p.id, p.name, p.category, p.price,
                  COALESCE(SUM(t.quantity), 0) AS units_sold,
                  COALESCE(SUM(t.total_amount), 0) AS revenue
           FROM products p
           LEFT JOIN transactions t ON t.product_id = p.id AND t.type = 'sale'
           GROUP BY p.id
           ORDER BY units_sold DESC
           LIMIT 5"""
    ).fetchall()

    recent = db.execute(
        """SELECT t.*, p.name AS product_name, p.category
           FROM transactions t
           JOIN products p ON p.id = t.product_id
           ORDER BY t.created_at DESC LIMIT 8"""
    ).fetchall()

    return jsonify({
        "total_products": total_products,
        "total_stock_units": total_stock,
        "inventory_value": round(inventory_value, 2),
        "low_stock_count": len(low_stock),
        "out_of_stock_count": out_of_stock,
        "low_stock_items": low_stock[:8],
        "revenue_today": round(sales_today["revenue"], 2),
        "units_sold_today": sales_today["units"],
        "revenue_week": round(sales_week["revenue"], 2),
        "units_sold_week": sales_week["units"],
        "revenue_month": round(sales_month["revenue"], 2),
        "units_sold_month": sales_month["units"],
        "today_date": today,
        "total_revenue": round(sales_all["revenue"], 2),
        "total_sales_count": sales_all["count"],
        "categories": [
            {
                "name": c["category"],
                "product_count": c["product_count"],
                "total_qty": c["total_qty"],
                "value": round(c["value"], 2),
            }
            for c in category_stats
        ],
        "top_products": [
            {
                "id": t["id"],
                "name": t["name"],
                "category": t["category"],
                "price": round(t["price"], 2),
                "units_sold": t["units_sold"],
                "revenue": round(t["revenue"], 2),
            }
            for t in top_products
        ],
        "recent_transactions": [row_to_transaction(r) for r in recent],
    })


@app.route("/api/categories", methods=["GET"])
@login_required
def list_categories():
    return jsonify(CATEGORIES)


with app.app_context():
    init_db()


if __name__ == "__main__":
    app.run(debug=True, port=5000)
