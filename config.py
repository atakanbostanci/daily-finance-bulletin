import os
from dotenv import load_dotenv

# Load environment variables from .env file if available
load_dotenv()

# API Keys & Email Credentials
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GMAIL_USER = os.getenv("GMAIL_USER", "")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "")
RECIPIENT_EMAIL = os.getenv("RECIPIENT_EMAIL", GMAIL_USER)

# Financial News RSS Feeds & Sources
BIST_RSS_FEEDS = [
    {"name": "Bloomberg HT", "url": "https://www.bloomberght.com/rss"},
    {"name": "Investing TR Ekonomi", "url": "https://tr.investing.com/rss/news_285.rss"},
    {"name": "Investing TR Borsa", "url": "https://tr.investing.com/rss/news_25.rss"},
    {"name": "Dünya Gazetesi Finans", "url": "https://www.dunya.com/rss?kategori=finans"},
    {"name": "Anadolu Ajansı Finans", "url": "https://www.aa.com.tr/tr/rss/default?cat=ekonomi"},
]

US_MARKET_RSS_FEEDS = [
    {"name": "Yahoo Finance Top News", "url": "https://finance.yahoo.com/news/rssindex"},
    {"name": "CNBC Market News", "url": "https://search.cnbc.com/rs/search/combinedAsset/rss/search.rss?partnerId=2000&keywords=stock%20market"},
    {"name": "MarketWatch Top Stories", "url": "http://feeds.marketwatch.com/marketwatch/topstories/"},
    {"name": "Investing US Stock News", "url": "https://www.investing.com/rss/news_25.rss"},
    {"name": "Reuters Business", "url": "https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best"},
]

MACRO_RSS_FEEDS = [
    {"name": "Investing US Economy", "url": "https://www.investing.com/rss/news_14.rss"},
    {"name": "CNBC Economy", "url": "https://search.cnbc.com/rs/search/combinedAsset/rss/search.rss?partnerId=2000&keywords=economy"},
    {"name": "Federal Reserve News", "url": "https://www.federalreserve.gov/feeds/press_all.xml"},
]
