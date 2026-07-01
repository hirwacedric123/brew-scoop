#!/usr/bin/env python3
"""Test SMTP settings. Run on the server to see the real connection error.

  .venv/bin/python scripts/test_smtp.py
  .venv/bin/python scripts/test_smtp.py --send you@example.com
"""

import argparse
import os
import smtplib
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(ROOT, ".env"))
except ImportError:
    pass

from mailer import load_smtp_config, send_email


def main():
    parser = argparse.ArgumentParser(description="Test Brew & Scoop SMTP configuration.")
    parser.add_argument(
        "--send",
        metavar="EMAIL",
        help="Send a test email to this address",
    )
    args = parser.parse_args()

    env_path = os.path.join(ROOT, ".env")
    print(f"Project root: {ROOT}")
    print(f".env exists: {os.path.isfile(env_path)}")

    try:
        config = load_smtp_config()
    except ValueError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        print(
            "\nOn PythonAnywhere: create .env on the server OR set variables under "
            "Web → your app → Environment variables.",
            file=sys.stderr,
        )
        return 1

    safe = {**config, "password": "***"}
    print("SMTP config:", safe)

    if not args.send:
        print("\nConfig looks loaded. Run with --send your@email.com to test delivery.")
        return 0

    try:
        send_email(
            [args.send],
            "Brew & Scoop SMTP test",
            "<p>If you received this, SMTP is working.</p>",
            "If you received this, SMTP is working.",
        )
    except OSError as exc:
        print(f"Connection error: {exc}", file=sys.stderr)
        print(
            "\nPythonAnywhere often blocks Gmail SMTP (Network is unreachable). "
            "Contact PythonAnywhere support or use an HTTPS email API (SendGrid, etc.).",
            file=sys.stderr,
        )
        return 1
    except smtplib.SMTPException as exc:
        print(f"SMTP error: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1

    print(f"Test email sent to {args.send}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
