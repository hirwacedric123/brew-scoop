"""Email delivery for Brew & Scoop.

Providers (set EMAIL_PROVIDER in .env):
  smtp      — Gmail etc. (works locally; often blocked on PythonAnywhere web apps)
  brevo     — https://www.brevo.com (free tier, easy setup)
  resend    — https://resend.com (simple API)
  mailgun   — https://www.mailgun.com
  sendgrid  — https://sendgrid.com
"""

import base64
import json
import os
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from env_loader import load_env_file

load_env_file()

HTTP_PROVIDERS = frozenset({"sendgrid", "brevo", "resend", "mailgun"})


def _env_bool(name, default=True):
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _from_email():
    return (os.environ.get("SMTP_FROM") or os.environ.get("SMTP_USER") or "").strip()


def _from_name():
    return (
        os.environ.get("EMAIL_FROM_NAME")
        or os.environ.get("SENDGRID_FROM_NAME")
        or "Brew & Scoop"
    ).strip()


def email_provider():
    explicit = (os.environ.get("EMAIL_PROVIDER") or "").strip().lower()
    if explicit:
        return explicit
    for name, key in (
        ("brevo", "BREVO_API_KEY"),
        ("resend", "RESEND_API_KEY"),
        ("mailgun", "MAILGUN_API_KEY"),
        ("sendgrid", "SENDGRID_API_KEY"),
    ):
        if (os.environ.get(key) or "").strip():
            return name
    return "smtp"


def _http_json_post(url, payload, headers, provider_label):
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={**headers, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            if response.status >= 400:
                raise RuntimeError(f"{provider_label} returned HTTP {response.status}")
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{provider_label} error {exc.code}: {detail}") from exc


def _http_form_post(url, form_data, headers, provider_label):
    request = Request(
        url,
        data=urlencode(form_data).encode("utf-8"),
        headers={**headers, "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            if response.status >= 400:
                raise RuntimeError(f"{provider_label} returned HTTP {response.status}")
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{provider_label} error {exc.code}: {detail}") from exc


def load_mail_config():
    provider = email_provider()
    from_email = _from_email()
    from_name = _from_name()

    if provider == "sendgrid":
        api_key = (os.environ.get("SENDGRID_API_KEY") or "").strip()
        if not api_key:
            raise ValueError("SENDGRID_API_KEY is not set")
        if not from_email:
            raise ValueError("SMTP_FROM must be set")
        return {
            "provider": "sendgrid",
            "api_key": api_key,
            "from_email": from_email,
            "from_name": from_name,
        }

    if provider == "brevo":
        api_key = (os.environ.get("BREVO_API_KEY") or "").strip()
        if not api_key:
            raise ValueError("BREVO_API_KEY is not set")
        if not from_email:
            raise ValueError("SMTP_FROM must be set")
        return {
            "provider": "brevo",
            "api_key": api_key,
            "from_email": from_email,
            "from_name": from_name,
        }

    if provider == "resend":
        api_key = (os.environ.get("RESEND_API_KEY") or "").strip()
        if not api_key:
            raise ValueError("RESEND_API_KEY is not set")
        if not from_email:
            raise ValueError("SMTP_FROM must be set")
        return {
            "provider": "resend",
            "api_key": api_key,
            "from_email": from_email,
            "from_name": from_name,
        }

    if provider == "mailgun":
        api_key = (os.environ.get("MAILGUN_API_KEY") or "").strip()
        domain = (os.environ.get("MAILGUN_DOMAIN") or "").strip()
        if not api_key:
            raise ValueError("MAILGUN_API_KEY is not set")
        if not domain:
            raise ValueError("MAILGUN_DOMAIN is not set")
        if not from_email:
            raise ValueError("SMTP_FROM must be set")
        region = (os.environ.get("MAILGUN_REGION") or "us").strip().lower()
        api_host = "api.eu.mailgun.net" if region == "eu" else "api.mailgun.net"
        return {
            "provider": "mailgun",
            "api_key": api_key,
            "domain": domain,
            "api_host": api_host,
            "from_email": from_email,
            "from_name": from_name,
        }

    if provider != "smtp":
        raise ValueError(
            f"Unknown EMAIL_PROVIDER '{provider}'. "
            f"Use one of: smtp, brevo, resend, mailgun, sendgrid"
        )

    host = (os.environ.get("SMTP_HOST") or "").strip()
    user = (os.environ.get("SMTP_USER") or "").strip()
    password = (os.environ.get("SMTP_PASSWORD") or "").replace(" ", "")
    port_raw = (os.environ.get("SMTP_PORT") or "587").strip()

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
        "provider": "smtp",
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "from_email": from_email,
        "use_tls": use_tls,
        "use_ssl": use_ssl,
    }


def load_smtp_config():
    """Backward-compatible helper for scripts that only use SMTP."""
    config = load_mail_config()
    if config["provider"] != "smtp":
        raise ValueError(f"EMAIL_PROVIDER is {config['provider']}, not smtp")
    return config


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


def _send_sendgrid(config, recipients, subject, html_body, text_body):
    _http_json_post(
        "https://api.sendgrid.com/v3/mail/send",
        {
            "personalizations": [{"to": [{"email": email} for email in recipients]}],
            "from": {"email": config["from_email"], "name": config["from_name"]},
            "subject": subject,
            "content": [
                {"type": "text/plain", "value": text_body},
                {"type": "text/html", "value": html_body},
            ],
        },
        {"Authorization": f"Bearer {config['api_key']}"},
        "SendGrid",
    )


def _send_brevo(config, recipients, subject, html_body, text_body):
    _http_json_post(
        "https://api.brevo.com/v3/smtp/email",
        {
            "sender": {"name": config["from_name"], "email": config["from_email"]},
            "to": [{"email": email} for email in recipients],
            "subject": subject,
            "htmlContent": html_body,
            "textContent": text_body,
        },
        {"api-key": config["api_key"]},
        "Brevo",
    )


def _send_resend(config, recipients, subject, html_body, text_body):
    _http_json_post(
        "https://api.resend.com/emails",
        {
            "from": f"{config['from_name']} <{config['from_email']}>",
            "to": recipients,
            "subject": subject,
            "html": html_body,
            "text": text_body,
        },
        {"Authorization": f"Bearer {config['api_key']}"},
        "Resend",
    )


def _send_mailgun(config, recipients, subject, html_body, text_body):
    auth = base64.b64encode(f"api:{config['api_key']}".encode()).decode()
    _http_form_post(
        f"https://{config['api_host']}/v3/{config['domain']}/messages",
        {
            "from": f"{config['from_name']} <{config['from_email']}>",
            "to": ", ".join(recipients),
            "subject": subject,
            "text": text_body,
            "html": html_body,
        },
        {"Authorization": f"Basic {auth}"},
        "Mailgun",
    )


def send_email(to_addrs, subject, html_body, text_body=None):
    recipients = [addr.strip() for addr in to_addrs if addr and addr.strip()]
    if not recipients:
        raise ValueError("No recipients provided")

    config = load_mail_config()
    if text_body is None:
        text_body = "View this message in an HTML-capable email client."

    provider = config["provider"]
    if provider == "sendgrid":
        _send_sendgrid(config, recipients, subject, html_body, text_body)
    elif provider == "brevo":
        _send_brevo(config, recipients, subject, html_body, text_body)
    elif provider == "resend":
        _send_resend(config, recipients, subject, html_body, text_body)
    elif provider == "mailgun":
        _send_mailgun(config, recipients, subject, html_body, text_body)
    else:
        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = config["from_email"]
        message["To"] = ", ".join(recipients)
        message.attach(MIMEText(text_body, "plain", "utf-8"))
        message.attach(MIMEText(html_body, "html", "utf-8"))
        _smtp_send(config, message, recipients)

    return recipients
