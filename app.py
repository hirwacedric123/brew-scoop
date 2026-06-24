"""Brew & Scoop Stock Management — Flask backend."""

import os
import re
import sqlite3
from datetime import datetime, timedelta, timezone

from flask import Flask, jsonify, render_template, request, g

app = Flask(__name__)
app.config["DATABASE"] = os.path.join(os.path.dirname(__file__), "brew_scoop.db")

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
    db.commit()
    db.close()


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

@app.route("/")
def index():
    return render_template("index.html", categories=CATEGORIES)


# ── Products API ───────────────────────────────────────────────────────────

@app.route("/api/products", methods=["GET"])
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
def get_product(product_id):
    row = get_db().execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if not row:
        return jsonify({"error": "Product not found"}), 404
    return jsonify(row_to_product(row))


@app.route("/api/products", methods=["POST"])
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

@app.route("/api/sales", methods=["POST"])
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

    db = get_db()
    row = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if not row:
        return jsonify({"error": "Product not found"}), 404
    if row["quantity"] < quantity:
        return jsonify({
            "error": f"Insufficient stock. Only {row['quantity']} available."
        }), 400

    ts = now_iso()
    unit_price = float(row["price"])
    total = round(unit_price * quantity, 2)
    new_qty = row["quantity"] - quantity

    db.execute("UPDATE products SET quantity=?, updated_at=? WHERE id=?",
               (new_qty, ts, product_id))
    cur = db.execute(
        """INSERT INTO transactions
           (product_id, type, quantity, unit_price, total_amount, notes, created_at)
           VALUES (?, 'sale', ?, ?, ?, ?, ?)""",
        (product_id, quantity, unit_price, total,
         (data.get("notes") or "").strip() or None, ts),
    )
    db.commit()

    updated = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    return jsonify({
        "transaction_id": cur.lastrowid,
        "product": row_to_product(updated),
        "quantity_sold": quantity,
        "unit_price": unit_price,
        "total_amount": total,
        "remaining_stock": new_qty,
    }), 201


@app.route("/api/restock", methods=["POST"])
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
def list_categories():
    return jsonify(CATEGORIES)


with app.app_context():
    init_db()


if __name__ == "__main__":
    app.run(debug=True, port=5000)
