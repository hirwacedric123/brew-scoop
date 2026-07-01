#!/usr/bin/env python3
"""Test email settings. Run on the server to see the real connection error.

  python3.10 scripts/test_smtp.py
  python3.10 scripts/test_smtp.py --send you@example.com
"""

import argparse
import os
import smtplib
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from env_loader import load_env_file

load_env_file(os.path.join(ROOT, ".env"))

from mailer import load_mail_config, send_email


def main():
    parser = argparse.ArgumentParser(description="Test Brew & Scoop email configuration.")
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
        config = load_mail_config()
    except ValueError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        print(
            "\nOn PythonAnywhere: create .env on the server OR set variables under "
            "Web → your app → Environment variables.",
            file=sys.stderr,
        )
        return 1

    safe = {**config}
    if "password" in safe:
        safe["password"] = "***"
    if "api_key" in safe:
        safe["api_key"] = "***"
    print("Email config:", safe)

    if not args.send:
        print("\nConfig looks loaded. Run with --send your@email.com to test delivery.")
        return 0

    try:
        send_email(
            [args.send],
            "Brew & Scoop email test",
            "<p>If you received this, email delivery is working.</p>",
            "If you received this, email delivery is working.",
        )
    except OSError as exc:
        print(f"Connection error: {exc}", file=sys.stderr)
        print(
            "\nPythonAnywhere web workers often cannot reach Gmail SMTP. "
            "Set EMAIL_PROVIDER to brevo, resend, mailgun, or sendgrid in .env.",
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
