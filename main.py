import sys
import argparse
import logging
from config import GEMINI_API_KEY, GMAIL_USER, GMAIL_APP_PASSWORD, RECIPIENT_EMAIL
from fetchers.bist_fetcher import fetch_bist_news
from fetchers.us_market_fetcher import fetch_us_market_news
from fetchers.macro_fetcher import fetch_macro_news, fetch_quick_market_indicators
from analyzer.ai_summarizer import generate_bulletin_with_gemini
from notifier.email_sender import send_bulletin_email, render_bulletin_html

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')
logger = logging.getLogger("DailyFinanceBulletin")

def run_bulletin_pipeline(preview_only=False):
    logger.info("Starting Daily Finance Bulletin Pipeline...")

    # Step 1: Fetch raw data
    logger.info("Step 1/4: Fetching live financial news and market indicators...")
    bist_news = fetch_bist_news(max_items_per_feed=6)
    us_news = fetch_us_market_news(max_items_per_feed=6)
    macro_news = fetch_macro_news(max_items_per_feed=5)
    indicators = fetch_quick_market_indicators()

    # Step 2: AI Summarization with Gemini
    logger.info("Step 2/4: Synthesizing bulletin using Gemini AI...")
    bulletin_data = generate_bulletin_with_gemini(
        bist_news, us_news, macro_news, indicators, api_key=GEMINI_API_KEY
    )

    # Step 3: Render HTML
    logger.info("Step 3/4: Rendering executive HTML email template...")
    html_output = render_bulletin_html(bulletin_data, indicators)

    if preview_only:
        preview_file = "bulletin_preview.html"
        with open(preview_file, "w", encoding="utf-8") as f:
            f.write(html_output)
        logger.info(f"PREVIEW MODE: Rendered bulletin saved to '{preview_file}'. No email sent.")
        return True

    # Step 4: Send Email
    logger.info("Step 4/4: Sending email via Gmail SMTP...")
    success = send_bulletin_email(
        bulletin_data, indicators, GMAIL_USER, GMAIL_APP_PASSWORD, RECIPIENT_EMAIL
    )

    if success:
        logger.info("Pipeline completed successfully! E-mail delivered.")
    else:
        logger.info("Pipeline finished (Preview mode or SMTP setup needed).")

    return success

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Daily Finance Bulletin Generator for Corporate Finance Specialists.")
    parser.add_argument("--preview", action="store_true", help="Generate HTML preview locally without sending email.")
    args = parser.parse_args()

    run_bulletin_pipeline(preview_only=args.preview)
