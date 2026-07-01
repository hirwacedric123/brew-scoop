"""SMTP email delivery for Brew & Scoop."""

import os
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass


def _env_bool(name, default=True):
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def load_smtp_config():
    host = (os.environ.get("SMTP_HOST") or "").strip()
    user = (os.environ.get("SMTP_USER") or "").strip()
    password = (os.environ.get("SMTP_PASSWORD") or "").replace(" ", "")
    port_raw = (os.environ.get("SMTP_PORT") or "587").strip()
    from_email = (os.environ.get("SMTP_FROM") or user).strip()

    if not host:
        raise ValueError("SMTP_HOST is not set")
    if not user:
        raise ValueError("SMTP_USER is not set")
    if not password:
        raise ValueError("SMTP_PASSWORD is not set")
    if not from_email:
        raise ValueError("SMTP_FROM or SMTP_USER must be set")

    try:
        port = int(port_raw)
    except ValueError as exc:
        raise ValueError("SMTP_PORT must be an integer") from exc

    use_ssl = _env_bool("SMTP_USE_SSL", port == 465)
    use_tls = _env_bool("SMTP_USE_TLS", not use_ssl)

    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "from_email": from_email,
        "use_tls": use_tls,
        "use_ssl": use_ssl,
    }


def _smtp_send(config, message, recipients):
    context = ssl.create_default_context()
    timeout = 30

    if config["use_ssl"]:
        with smtplib.SMTP_SSL(
            config["host"], config["port"], timeout=timeout, context=context
        ) as smtp:
            smtp.login(config["user"], config["password"])
            smtp.sendmail(config["from_email"], recipients, message.as_string())
        return

    with smtplib.SMTP(config["host"], config["port"], timeout=timeout) as smtp:
        smtp.ehlo()
        if config["use_tls"]:
            smtp.starttls(context=context)
            smtp.ehlo()
        smtp.login(config["user"], config["password"])
        smtp.sendmail(config["from_email"], recipients, message.as_string())


def send_email(to_addrs, subject, html_body, text_body=None):
    recipients = [addr.strip() for addr in to_addrs if addr and addr.strip()]
    if not recipients:
        raise ValueError("No recipients provided")

    config = load_smtp_config()
    if text_body is None:
        text_body = "View this message in an HTML-capable email client."

    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = config["from_email"]
    message["To"] = ", ".join(recipients)
    message.attach(MIMEText(text_body, "plain", "utf-8"))
    message.attach(MIMEText(html_body, "html", "utf-8"))

    _smtp_send(config, message, recipients)
    return recipients
