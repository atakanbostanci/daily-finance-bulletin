import logging
import feedparser
import requests
from bs4 import BeautifulSoup
from config import BIST_RSS_FEEDS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

def clean_html(raw_html):
    """Clean HTML tags and extra whitespace from summary text."""
    if not raw_html:
        return ""
    soup = BeautifulSoup(raw_html, "html.parser")
    text = soup.get_text(separator=" ", strip=True)
    return " ".join(text.split())

def fetch_bist_news(max_items_per_feed=8):
    """
    Fetch news relevant to Borsa Istanbul (BIST), KAP announcements, and Turkish financial developments.
    """
    news_items = []
    headers = {"User-Agent": USER_AGENT}

    for feed_info in BIST_RSS_FEEDS:
        feed_name = feed_info["name"]
        feed_url = feed_info["url"]
        logger.info(f"Fetching BIST news from: {feed_name} ({feed_url})")

        try:
            # Custom request with User-Agent header to avoid 403 Forbidden on some feeds
            resp = requests.get(feed_url, headers=headers, timeout=10)
            if resp.status_code == 200:
                feed = feedparser.parse(resp.content)
            else:
                feed = feedparser.parse(feed_url)

            count = 0
            for entry in feed.entries:
                if count >= max_items_per_feed:
                    break

                title = clean_html(getattr(entry, 'title', ''))
                summary = clean_html(getattr(entry, 'summary', getattr(entry, 'description', '')))
                link = getattr(entry, 'link', '')
                published = getattr(entry, 'published', getattr(entry, 'updated', ''))

                if title:
                    news_items.append({
                        "source": feed_name,
                        "title": title,
                        "summary": summary[:400] if summary else title,
                        "link": link,
                        "published": published
                    })
                    count += 1
        except Exception as e:
            logger.warning(f"Failed to fetch from {feed_name}: {e}")

    logger.info(f"Total BIST news items collected: {len(news_items)}")
    return news_items

if __name__ == "__main__":
    items = fetch_bist_news(3)
    for i in items:
        print(f"[{i['source']}] {i['title']}\n  {i['summary']}\n")
