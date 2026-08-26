import os
import smtplib
import logging
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from jinja2 import Environment, FileSystemLoader

logger = logging.getLogger(__name__)

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), 'templates')

def render_bulletin_html(bulletin_data, indicators=None):
    """Render HTML string from bulletin JSON and indicators using Jinja2."""
    env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))
    template = env.get_template('bulletin.html')
    rendered_html = template.render(
        bulletin=bulletin_data,
        indicators=indicators or [],
        now_year=datetime.now().year
    )
    return rendered_html

def send_bulletin_email(bulletin_data, indicators, gmail_user, app_password, recipient_email):
    """
    Send formatted HTML financial bulletin via Gmail SMTP.
    """
    html_content = render_bulletin_html(bulletin_data, indicators)

    # If credentials are not set, save preview HTML file locally
    if not gmail_user or not app_password or gmail_user == "your_email@gmail.com":
        preview_filename = "bulletin_preview.html"
        logger.warning(f"Gmail credentials not configured. Saving email preview to '{preview_filename}'...")
        with open(preview_filename, "w", encoding="utf-8") as f:
            f.write(html_content)
        logger.info(f"Preview saved successfully. Open '{preview_filename}' in browser to view.")
        return False

    if not recipient_email:
        recipient_email = gmail_user

    subject = f"📈 {bulletin_data.get('title', 'Sabah Finans Bülteni')}"

    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = f"Finans Bülteni Otomasyonu <{gmail_user}>"
    msg['To'] = recipient_email

    # Attach HTML content
    part_html = MIMEText(html_content, 'html', 'utf-8')
    msg.attach(part_html)

    try:
        logger.info(f"Connecting to Gmail SMTP server (smtp.gmail.com:465) to send to {recipient_email}...")
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(gmail_user, app_password)
            server.sendmail(gmail_user, [recipient_email], msg.as_string())
        logger.info("Daily finance bulletin email sent successfully!")
        return True
    except Exception as e:
        logger.error(f"Failed to send email via Gmail SMTP: {e}")
        # Save preview as fallback
        with open("bulletin_error_fallback.html", "w", encoding="utf-8") as f:
            f.write(html_content)
        return False
