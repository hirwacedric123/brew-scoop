"""Daily sales report data and HTML builders for Brew & Scoop."""

import os
import re
import sqlite3
from datetime import datetime, timedelta, timezone
from html import escape

KIGALI_OFFSET = timedelta(hours=2)

PAYMENT_METHODS = {
    "momo": "MoMo",
    "cash": "Cash",
    "visa": "Visa",
}


def get_database_path():
    return os.environ.get(
        "BREW_SCOOP_DATABASE",
        os.path.join(os.path.dirname(__file__), "brew_scoop.db"),
    )


def connect_db():
    db = sqlite3.connect(get_database_path())
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def now_kigali():
    return datetime.now(timezone.utc) + KIGALI_OFFSET


def today_kigali():
    return now_kigali().strftime("%Y-%m-%d")


def yesterday_kigali():
    return (now_kigali().date() - timedelta(days=1)).strftime("%Y-%m-%d")


def parse_date(value):
    if not value or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


def format_currency(amount):
    return f"{amount:,.0f} RWF"


def _parse_user_id_filter(user_id):
    if not user_id:
        return None
    try:
        return int(user_id)
    except (TypeError, ValueError):
        return None


def _sale_user_clause(user_id, alias=""):
    uid = _parse_user_id_filter(user_id)
    if uid is None:
        return "", []
    prefix = f"{alias}." if alias else ""
    return f" AND {prefix}user_id = ?", [uid]


def sales_summary(db, date_from, date_to, user_id=None):
    user_clause, user_params = _sale_user_clause(user_id)
    row = db.execute(
        f"""SELECT COALESCE(SUM(total_amount), 0) AS revenue,
                  COALESCE(SUM(quantity), 0) AS units,
                  COUNT(*) AS transactions
           FROM transactions
           WHERE type = 'sale'
             AND substr(created_at, 1, 10) >= ?
             AND substr(created_at, 1, 10) <= ?{user_clause}""",
        (date_from, date_to, *user_params),
    ).fetchone()
    return {
        "revenue": round(row["revenue"], 2),
        "units": row["units"],
        "transactions": row["transactions"],
    }


def payment_breakdown(db, date_from, date_to, user_id=None):
    user_clause, user_params = _sale_user_clause(user_id)
    rows = db.execute(
        f"""SELECT payment_method,
                  COALESCE(SUM(total_amount), 0) AS revenue,
                  COUNT(DISTINCT checkout_ref) AS checkouts
           FROM transactions
           WHERE type = 'sale'
             AND payment_method IS NOT NULL
             AND substr(created_at, 1, 10) >= ?
             AND substr(created_at, 1, 10) <= ?{user_clause}
           GROUP BY payment_method""",
        (date_from, date_to, *user_params),
    ).fetchall()
    totals = {row["payment_method"]: row for row in rows}
    return [
        {
            "method": method,
            "label": label,
            "revenue": round(totals[method]["revenue"], 2) if method in totals else 0,
            "checkouts": totals[method]["checkouts"] if method in totals else 0,
        }
        for method, label in PAYMENT_METHODS.items()
    ]


def seller_breakdown(db, report_date):
    rows = db.execute(
        """SELECT u.id,
                  u.display_name,
                  COALESCE(SUM(t.total_amount), 0) AS revenue,
                  COALESCE(SUM(t.quantity), 0) AS units,
                  COUNT(t.id) AS transactions
           FROM users u
           LEFT JOIN transactions t
             ON t.user_id = u.id
            AND t.type = 'sale'
            AND substr(t.created_at, 1, 10) = ?
           WHERE u.role = 'seller'
             AND u.is_active = 1
           GROUP BY u.id
           ORDER BY revenue DESC, u.display_name COLLATE NOCASE ASC""",
        (report_date,),
    ).fetchall()
    return [
        {
            "id": row["id"],
            "display_name": row["display_name"],
            "revenue": round(row["revenue"], 2),
            "units": row["units"],
            "transactions": row["transactions"],
        }
        for row in rows
    ]


def top_products_for_day(db, report_date, limit=5, user_id=None):
    user_clause, user_params = _sale_user_clause(user_id, "t")
    rows = db.execute(
        f"""SELECT p.name,
                  COALESCE(SUM(t.quantity), 0) AS units,
                  COALESCE(SUM(t.total_amount), 0) AS revenue
           FROM transactions t
           JOIN products p ON p.id = t.product_id
           WHERE t.type = 'sale'
             AND substr(t.created_at, 1, 10) = ?{user_clause}
           GROUP BY p.id
           ORDER BY units DESC, revenue DESC
           LIMIT ?""",
        (report_date, *user_params, limit),
    ).fetchall()
    return [
        {
            "name": row["name"],
            "units": row["units"],
            "revenue": round(row["revenue"], 2),
        }
        for row in rows
    ]


def low_stock_items(db, limit=8):
    category_cup_map = {
        row["name"]: bool(row["uses_cup_stock"])
        for row in db.execute("SELECT name, uses_cup_stock FROM categories").fetchall()
    }
    cup = db.execute("SELECT quantity, reorder_level FROM cup_inventory WHERE id = 1").fetchone()
    items = []

    for row in db.execute("SELECT name, category, quantity, reorder_level FROM products").fetchall():
        if category_cup_map.get(row["category"], False):
            continue
        qty = row["quantity"]
        reorder = row["reorder_level"]
        if qty <= reorder:
            status = "out" if qty == 0 else "low"
            items.append(
                {
                    "name": row["name"],
                    "quantity": qty,
                    "reorder_level": reorder,
                    "status": status,
                }
            )

    if cup and cup["quantity"] <= cup["reorder_level"]:
        items.append(
            {
                "name": "Shared cups",
                "quantity": cup["quantity"],
                "reorder_level": cup["reorder_level"],
                "status": "out" if cup["quantity"] == 0 else "low",
            }
        )

    items.sort(key=lambda item: (0 if item["status"] == "out" else 1, item["quantity"]))
    return items[:limit]


def seller_shifts_for_day(db, user_id, report_date):
    rows = db.execute(
        """SELECT status, opened_at, closed_at, total_sales, cash_sales,
                  momo_sales, visa_sales, units_sold, sale_count, variance,
                  counted_cash, expected_cash
           FROM seller_shifts
           WHERE user_id = ?
             AND (substr(opened_at, 1, 10) = ? OR substr(closed_at, 1, 10) = ?)
           ORDER BY opened_at ASC""",
        (user_id, report_date, report_date),
    ).fetchall()
    return [dict(row) for row in rows]


def report_recipients(db):
    rows = db.execute(
        """SELECT id, display_name, email, role
           FROM users
           WHERE is_active = 1
             AND email IS NOT NULL
             AND TRIM(email) != ''"""
    ).fetchall()
    admin_roles = {"admin", "stock_manager"}
    admins = []
    sellers = []
    for row in rows:
        entry = {
            "id": row["id"],
            "display_name": row["display_name"],
            "email": row["email"].strip(),
            "role": row["role"],
        }
        if row["role"] in admin_roles:
            admins.append(entry)
        elif row["role"] == "seller":
            sellers.append(entry)
    return admins, sellers


def extra_report_emails():
    raw = os.environ.get("BREW_SCOOP_EXTRA_REPORT_EMAILS", "")
    return [part.strip() for part in raw.split(",") if part.strip()]


def build_admin_daily_report(db, report_date):
    return {
        "report_date": report_date,
        "summary": sales_summary(db, report_date, report_date),
        "payments": payment_breakdown(db, report_date, report_date),
        "sellers": seller_breakdown(db, report_date),
        "top_products": top_products_for_day(db, report_date),
        "low_stock": low_stock_items(db),
    }


def build_seller_daily_report(db, user_id, display_name, report_date):
    return {
        "report_date": report_date,
        "seller_name": display_name,
        "summary": sales_summary(db, report_date, report_date, user_id=user_id),
        "payments": payment_breakdown(db, report_date, report_date, user_id=user_id),
        "top_products": top_products_for_day(db, report_date, user_id=user_id),
        "shifts": seller_shifts_for_day(db, user_id, report_date),
    }


def _email_shell(title, body_html):
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{escape(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f1ec;font-family:Arial,Helvetica,sans-serif;color:#2b2118;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ec;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e6ddd1;">
          <tr>
            <td style="background:#5c3d2e;color:#ffffff;padding:20px 24px;">
              <h1 style="margin:0;font-size:22px;">Brew &amp; Scoop</h1>
              <p style="margin:6px 0 0;font-size:14px;opacity:0.9;">{escape(title)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">{body_html}</td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#faf7f2;color:#7a6a5c;font-size:12px;">
              Automated daily report from Brew &amp; Scoop.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _stat_cards(items):
    cards = []
    for label, value in items:
        cards.append(
            f"""<td style="width:33%;padding:8px;">
              <div style="background:#faf7f2;border:1px solid #ece3d8;border-radius:10px;padding:14px;">
                <div style="font-size:12px;color:#7a6a5c;text-transform:uppercase;letter-spacing:0.04em;">{escape(label)}</div>
                <div style="font-size:22px;font-weight:bold;margin-top:6px;color:#2b2118;">{escape(value)}</div>
              </div>
            </td>"""
        )
    return f'<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>{"".join(cards)}</tr></table>'


def _table(headers, rows):
    head = "".join(
        f'<th align="left" style="padding:10px 12px;background:#faf7f2;border-bottom:1px solid #ece3d8;">{escape(h)}</th>'
        for h in headers
    )
    body_rows = []
    for row in rows:
        cells = "".join(
            f'<td style="padding:10px 12px;border-bottom:1px solid #f0ebe4;">{cell}</td>'
            for cell in row
        )
        body_rows.append(f"<tr>{cells}</tr>")
    if not body_rows:
        body_rows.append(
            f'<tr><td colspan="{len(headers)}" style="padding:14px 12px;color:#7a6a5c;">No data for this period.</td></tr>'
        )
    return f"""<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:12px;">
      <thead><tr>{head}</tr></thead>
      <tbody>{"".join(body_rows)}</tbody>
    </table>"""


def _section(title, content):
    return f"""<div style="margin-top:24px;">
      <h2 style="margin:0 0 8px;font-size:16px;color:#5c3d2e;">{escape(title)}</h2>
      {content}
    </div>"""


def render_admin_report_html(report):
    summary = report["summary"]
    body = _stat_cards(
        [
            ("Revenue", format_currency(summary["revenue"])),
            ("Units sold", str(summary["units"])),
            ("Transactions", str(summary["transactions"])),
        ]
    )

    payment_rows = [
        (
            escape(p["label"]),
            format_currency(p["revenue"]),
            str(p["checkouts"]),
        )
        for p in report["payments"]
    ]
    body += _section("Payment breakdown", _table(["Method", "Revenue", "Checkouts"], payment_rows))

    seller_rows = [
        (
            escape(s["display_name"]),
            format_currency(s["revenue"]),
            str(s["units"]),
            str(s["transactions"]),
        )
        for s in report["sellers"]
        if s["transactions"] > 0
    ]
    body += _section("Seller performance", _table(["Seller", "Revenue", "Units", "Sales"], seller_rows))

    product_rows = [
        (escape(p["name"]), str(p["units"]), format_currency(p["revenue"]))
        for p in report["top_products"]
    ]
    body += _section("Top products", _table(["Product", "Units", "Revenue"], product_rows))

    if report["low_stock"]:
        stock_rows = [
            (
                escape(item["name"]),
                str(item["quantity"]),
                str(item["reorder_level"]),
                "Out of stock" if item["status"] == "out" else "Low stock",
            )
            for item in report["low_stock"]
        ]
        body += _section("Stock alerts", _table(["Item", "Qty", "Reorder at", "Status"], stock_rows))

    title = f"Daily store report — {report['report_date']}"
    return _email_shell(title, body)


def render_admin_report_text(report):
    summary = report["summary"]
    lines = [
        f"Brew & Scoop daily store report — {report['report_date']}",
        "",
        f"Revenue: {format_currency(summary['revenue'])}",
        f"Units sold: {summary['units']}",
        f"Transactions: {summary['transactions']}",
        "",
        "Payment breakdown:",
    ]
    for p in report["payments"]:
        lines.append(f"  {p['label']}: {format_currency(p['revenue'])} ({p['checkouts']} checkouts)")
    lines.extend(["", "Seller performance:"])
    for s in report["sellers"]:
        if s["transactions"] > 0:
            lines.append(
                f"  {s['display_name']}: {format_currency(s['revenue'])}, "
                f"{s['units']} units, {s['transactions']} sales"
            )
    return "\n".join(lines)


def render_seller_report_html(report):
    summary = report["summary"]
    body = _stat_cards(
        [
            ("Your revenue", format_currency(summary["revenue"])),
            ("Units sold", str(summary["units"])),
            ("Transactions", str(summary["transactions"])),
        ]
    )

    payment_rows = [
        (escape(p["label"]), format_currency(p["revenue"]), str(p["checkouts"]))
        for p in report["payments"]
    ]
    body += _section("Payment breakdown", _table(["Method", "Revenue", "Checkouts"], payment_rows))

    product_rows = [
        (escape(p["name"]), str(p["units"]), format_currency(p["revenue"]))
        for p in report["top_products"]
    ]
    body += _section("Your top products", _table(["Product", "Units", "Revenue"], product_rows))

    if report["shifts"]:
        shift_rows = []
        for shift in report["shifts"]:
            status = shift["status"].title()
            total = format_currency(shift["total_sales"] or 0)
            if shift["status"] == "closed" and shift["variance"] is not None:
                variance = format_currency(abs(shift["variance"]))
                note = "Balanced" if shift["variance"] == 0 else f"Variance {variance}"
            else:
                note = "Still open" if shift["status"] == "open" else "Closed"
            shift_rows.append((status, total, escape(note)))
        body += _section("Shifts", _table(["Status", "Total sales", "Notes"], shift_rows))

    title = f"Your daily sales — {report['report_date']}"
    return _email_shell(title, body)


def render_seller_report_text(report):
    summary = report["summary"]
    lines = [
        f"Brew & Scoop daily sales for {report['seller_name']} — {report['report_date']}",
        "",
        f"Revenue: {format_currency(summary['revenue'])}",
        f"Units sold: {summary['units']}",
        f"Transactions: {summary['transactions']}",
    ]
    return "\n".join(lines)
