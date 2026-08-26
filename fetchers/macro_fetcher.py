import logging
import feedparser
import requests
from bs4 import BeautifulSoup
from config import MACRO_RSS_FEEDS

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

def fetch_macro_news(max_items_per_feed=8):
    """
    Fetch news relevant to Global Macroeconomics, Central Banks (Fed, ECB, CBRT), Commodities, and Inflation data.
    """
    news_items = []
    headers = {"User-Agent": USER_AGENT}

    for feed_info in MACRO_RSS_FEEDS:
        feed_name = feed_info["name"]
        feed_url = feed_info["url"]
        logger.info(f"Fetching Macro news from: {feed_name} ({feed_url})")

        try:
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

    logger.info(f"Total Macro news items collected: {len(news_items)}")
    return news_items

def fetch_quick_market_indicators():
    """
    Fetch or structure quick indicators (USD/TRY, EUR/USD, Gold, Brent, US 10Y).
    Returns a dictionary of key indicators if available.
    """
    # Simple light query to public Yahoo Finance quotes endpoint
    symbols = {
        "USDTRY=X": "USD/TRY",
        "EURUSD=X": "EUR/USD",
        "GC=F": "Ons Altın ($)",
        "BZ=F": "Brent Petrol ($)",
        "^TNX": "ABD 10Y Tahvil (%)"
    }
    indicators = []
    headers = {"User-Agent": USER_AGENT}

    try:
        url = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" + ",".join(symbols.keys())
        resp = requests.get(url, headers=headers, timeout=5)
        if resp.status_code == 200:
            results = resp.json().get("quoteResponse", {}).get("result", [])
            for res in results:
                sym = res.get("symbol")
                name = symbols.get(sym, sym)
                price = res.get("regularMarketPrice", "N/A")
                change_pct = res.get("regularMarketChangePercent", 0.0)
                indicators.append({
                    "name": name,
                    "price": f"{price:,.2f}" if isinstance(price, (int, float)) else str(price),
                    "change_pct": f"{change_pct:+.2f}%" if isinstance(change_pct, (int, float)) else "0.00%"
                })
    except Exception as e:
        logger.warning(f"Could not fetch indicators: {e}")

    return indicators

if __name__ == "__main__":
    items = fetch_macro_news(3)
    indicators = fetch_quick_market_indicators()
    print("Indicators:", indicators)
    for i in items:
        print(f"[{i['source']}] {i['title']}\n  {i['summary']}\n")
