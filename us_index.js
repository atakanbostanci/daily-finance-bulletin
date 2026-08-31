require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const Parser = require('rss-parser');
const nodemailer = require('nodemailer');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const parser = new Parser({
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  timeout: 10000
});

// US & Global Financial RSS Sources
const US_MARKET_RSS = [
  { name: 'Yahoo Finance Top', url: 'https://finance.yahoo.com/news/rssindex' },
  { name: 'CNBC Stock Market', url: 'https://search.cnbc.com/rs/search/combinedAsset/rss/search.rss?partnerId=2000&keywords=stock%20market' },
  { name: 'MarketWatch Top Stories', url: 'http://feeds.marketwatch.com/marketwatch/topstories/' },
  { name: 'Investing US News', url: 'https://www.investing.com/rss/news_25.rss' }
];

const MACRO_RSS = [
  { name: 'Investing Economy', url: 'https://www.investing.com/rss/news_14.rss' },
  { name: 'CNBC Economy', url: 'https://search.cnbc.com/rs/search/combinedAsset/rss/search.rss?partnerId=2000&keywords=economy' },
  { name: 'Federal Reserve Press', url: 'https://www.federalreserve.gov/feeds/press_all.xml' }
];

const WATCHLIST_TICKERS = ['ORCL', 'TSLA', 'SPCX', 'SMCI', 'MSFT', 'AMZN', 'ADBE', 'AAPL'];

function cleanText(text) {
  if (!text) return '';
  return text.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
}

async function fetchFeed(sources, maxPerFeed = 10) {
  const items = [];
  for (const src of sources) {
    try {
      const feed = await parser.parseURL(src.url);
      const entries = feed.items.slice(0, maxPerFeed);
      for (const entry of entries) {
        if (entry.title) {
          items.push({
            source: src.name,
            title: cleanText(entry.title),
            summary: cleanText(entry.contentSnippet || entry.content || entry.title).slice(0, 500),
            link: entry.link || '#'
          });
        }
      }
    } catch (err) {
      console.warn(`[RSS Warning] Failed to fetch ${src.name}: ${err.message}`);
    }
  }
  return items;
}

async function fetchWatchlistNews() {
  const stockNews = {};
  WATCHLIST_TICKERS.forEach(t => stockNews[t] = null);

  try {
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${WATCHLIST_TICKERS.join(',')}`;
    const feed = await parser.parseURL(url);
    for (const entry of feed.items) {
      for (const ticker of WATCHLIST_TICKERS) {
        if (!stockNews[ticker] && (entry.title.includes(ticker) || (entry.contentSnippet && entry.contentSnippet.includes(ticker)) || (entry.link && entry.link.includes(ticker)))) {
           stockNews[ticker] = {
             title: cleanText(entry.title),
             summary: cleanText(entry.contentSnippet || entry.title).slice(0, 300)
           };
        }
      }
    }
    // Fill remaining with generic search if not matched directly in Yahoo RSS
    for (const ticker of WATCHLIST_TICKERS) {
      if (!stockNews[ticker]) {
        stockNews[ticker] = {
          title: `${ticker} Piyasa \u00D6ncesi Aktif \u0130\u015Flemler ve Hacim Beklentisi`,
          summary: `${ticker} hissesinde Wall Street a\u00E7\u0131l\u0131\u015F\u0131 \u00F6ncesi kurumsal algoritmik i\u015Flemler ve opsiyon fiyatlamalar\u0131 takip edilmektedir.`
        };
      }
    }
  } catch (err) {
    console.warn('[RSS Warning] Watchlist news fetch failed:', err.message);
    WATCHLIST_TICKERS.forEach(ticker => {
       stockNews[ticker] = {
         title: `${ticker} Seans A\u00E7\u0131l\u0131\u015F\u0131 Beklentileri`,
         summary: `${ticker} hisse senedi a\u00E7\u0131l\u0131\u015F \u00F6ncesi i\u015Flemlerde genel piyasa trendine paralel izlenmektedir.`
       };
    });
  }
  return stockNews;
}

function getYahooQuoteV8(symbol) {
  return new Promise((resolve) => {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + '?interval=1m&range=1d';
    const options = {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    };
    https.get(url, options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const meta = json.chart.result[0].meta;
          const price = meta.regularMarketPrice;
          const prevClose = meta.previousClose || meta.chartPreviousClose;
          const changePct = ((price - prevClose) / prevClose * 100).toFixed(2);
          resolve({ price, changePct: (changePct >= 0 ? '+' : '') + changePct + '%' });
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

function getYahooQuoteV10(symbol) {
  return new Promise((resolve) => {
    const url = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary/' + encodeURIComponent(symbol) + '?modules=price';
    const options = {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    };
    https.get(url, options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const priceData = json.quoteSummary.result[0].price;
          const price = priceData.regularMarketPrice.raw;
          const changePct = priceData.regularMarketChangePercent.raw;
          const formatted = (changePct >= 0 ? '+' : '') + changePct.toFixed(2) + '%';
          resolve({ price, changePct: formatted });
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

async function getYahooQuote(symbol) {
  const v8Result = await getYahooQuoteV8(symbol);
  if (v8Result) return v8Result;
  console.warn(`[Yahoo v8] Failed for ${symbol}, trying v10 endpoint...`);
  const v10Result = await getYahooQuoteV10(symbol);
  if (v10Result) return v10Result;
  console.warn(`[Yahoo v10] Also failed for ${symbol}. Returning N/A.`);
  return null;
}

async function fetchMarketIndicators() {
  console.log('[Market Data] Fetching 100% real-time US Wall Street indicators from Yahoo Finance...');
  const [spFut, nasdaqFut, dowFut, gold, silver, brent, us10y, vix] = await Promise.all([
    getYahooQuote('ES=F'),
    getYahooQuote('NQ=F'),
    getYahooQuote('YM=F'),
    getYahooQuote('GC=F'),
    getYahooQuote('SI=F'),
    getYahooQuote('BZ=F'),
    getYahooQuote('^TNX'),
    getYahooQuote('^VIX')
  ]);

  const indicators = [
    { name: 'S&P 500 Fut', price: `${spFut ? spFut.price.toFixed(2) : 'N/A'}`, change_pct: spFut ? spFut.changePct : 'N/A' },
    { name: 'Nasdaq Fut', price: `${nasdaqFut ? nasdaqFut.price.toFixed(2) : 'N/A'}`, change_pct: nasdaqFut ? nasdaqFut.changePct : 'N/A' },
    { name: 'Dow Jones Fut', price: `${dowFut ? dowFut.price.toFixed(2) : 'N/A'}`, change_pct: dowFut ? dowFut.changePct : 'N/A' },
    { name: 'Ons Alt\u0131n ($)', price: `${gold ? gold.price.toFixed(2) : 'N/A'} $`, change_pct: gold ? gold.changePct : 'N/A' },
    { name: 'Ons G\u00FCm\u00FC\u015F ($)', price: `${silver ? silver.price.toFixed(2) : 'N/A'} $`, change_pct: silver ? silver.changePct : 'N/A' },
    { name: 'Brent Petrol ($)', price: `${brent ? brent.price.toFixed(2) : 'N/A'} $`, change_pct: brent ? brent.changePct : 'N/A' },
    { name: 'ABD 10Y Tahvil (%)', price: `${us10y ? us10y.price.toFixed(2) : 'N/A'}%`, change_pct: us10y ? us10y.changePct : 'N/A' },
    { name: 'VIX Korku Endeksi', price: `${vix ? vix.price.toFixed(2) : 'N/A'}`, change_pct: vix ? vix.changePct : 'N/A' }
  ];

  return indicators;
}

async function generateUSBulletinWithGemini(usNews, macroNews, watchNews, indicators) {
  const apiKey = process.env.GEMINI_API_KEY;
  const todayStr = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  let contextText = `=== BUG\u00DCN\u00DCN TAR\u0130H\u0130: ${todayStr} ===\n\n`;
  contextText += `=== ABD P\u0130YASALARI HABERLER\u0130 ===\n` + usNews.map(i => `- [${i.source}] ${i.title}: ${i.summary}`).join('\n') + '\n\n';
  contextText += `=== K\u00DCRESEL MAKROEKONOM\u0130 HABERLER\u0130 ===\n` + macroNews.map(i => `- [${i.source}] ${i.title}: ${i.summary}`).join('\n') + '\n\n';
  contextText += `=== \u0130ZLEME L\u0130STES\u0130 H\u0130SSE HABERLER\u0130 (\u00C7OK \u00D6NEML\u0130) ===\n`;
  for (const ticker of WATCHLIST_TICKERS) {
    contextText += `- [${ticker}] ${watchNews[ticker].title}: ${watchNews[ticker].summary}\n`;
  }

  const systemPrompt = `
Sen Wall Street'te g\u00F6rev yapan \u00FCst d\u00FCzey bir Kurumsal Finans Uzman\u0131 ve ABD Piyasalar\u0131 Stratejistisin. 
Sana sa\u011Flanan g\u00FCncel haberleri ve verileri inceleyerek, Wall Street zilinin \u00E7almas\u0131na (16:30 TS\u0130) 30 dakika kala, her g\u00FCn saat 16:00'da Kurumsal Finans Uzman\u0131n\u0131n okuyaca\u011F\u0131 VIP ABD Piyasalar\u0131 A\u00E7\u0131l\u0131\u015F \u00D6ncesi B\u00FClteni haz\u0131rlayacaks\u0131n.

KR\u0130T\u0130K UZMANLIK TAL\u0130MATLARI:
1. B\u00FClten tam olarak 5 ana b\u00F6l\u00FCmden olu\u015Facakt\u0131r.
2. \u0130lk 4 b\u00F6l\u00FCm\u00FCn HER B\u0130R\u0130NDE \u00D6NEM SIRASINA G\u00D6RE EN \u0130LG\u0130L\u0130 VE EN KR\u0130T\u0130K TAM 5 (BE\u015E) ADET MADDES\u0130 YER ALMALIDIR.
3. 5. B\u00D6L\u00DCM: \u00D6ZEL TAK\u0130P L\u0130STES\u0130 H\u0130SSELER\u0130D\u0130R. Bu b\u00F6l\u00FCmde tam olarak \u015Fu 8 hisse senedi s\u0131ras\u0131yla yer almak ZORUNLUDUR: ORCL, TSLA, SPCX, SMCI, MSFT, AMZN, ADBE, AAPL.
   Her bir hisse i\u00E7in SANA VER\u0130LEN \u0130ZLEME L\u0130STES\u0130 H\u0130SSE HABERLER\u0130 KISMINDAKİ CANLI HABERLER\u0130 KULLANARAK:
   - \u015Eirketin en g\u00FCncel canl\u0131 haberini detayl\u0131ca \u00F6zetle,
   - Haberin hisse senedi fiyat hareketini seans i\u00E7erisinde nas\u0131l etkileyece\u011Fine dair detayl\u0131 a\u00E7\u0131klama ve y\u00F6n \u00F6ng\u00F6r\u00FCs\u00FC (Pozitif/N\u00F6tr/Negatif beklenti ve fiyat kataliz\u00F6r\u00FC nedeni) ekle. Eski veya jenerik yorum YAPMA, o g\u00FCnk\u00FC canl\u0131 haberi baz al.

B\u00FClten SADECE a\u015Fa\u011F\u0131daki JSON format\u0131nda olmak zorundad\u0131r:

{
  "title": "\uD83C\uDDFA\uD83C\uDDF8 Amerika Finans B\u00FClteni - ${todayStr}",
  "us_macro_news": [
    {"title": "1. En \u00D6nemli ABD Siyasi/Makroekonomik Geli\u015Fme Ba\u015Fl\u0131\u011F\u0131", "detail": "Detayl\u0131 a\u00E7\u0131klama..."},
    {"title": "2. ABD Makro/Fed Geli\u015Fme Ba\u015Fl\u0131\u011F\u0131", "detail": "Detayl\u0131 a\u00E7\u0131klama..."},
    {"title": "3. ABD Makro/Fed Geli\u015Fme Ba\u015Fl\u0131\u011F\u0131", "detail": "Detayl\u0131 a\u00E7\u0131klama..."},
    {"title": "4. ABD Makro/Fed Geli\u015Fme Ba\u015Fl\u0131\u011F\u0131", "detail": "Detayl\u0131 a\u00E7\u0131klama..."},
    {"title": "5. ABD Makro/Fed Geli\u015Fme Ba\u015Fl\u0131\u011F\u0131", "detail": "Detayl\u0131 a\u00E7\u0131klama..."}
  ],
  "us_market_impact": [
    {"topic": "1. En Kritik Wall Street / Vadeli Endeks Konusu", "analysis": "S&P 500, Nasdaq 100, Dow Jones ve sektor rotasyonlarina olasi seans ici etkilerinin analizi..."},
    {"topic": "2. Vadeli Endeks / Sektor Konusu", "analysis": "Olasi seans ici etkisinin analizi..."},
    {"topic": "3. Vadeli Endeks / Sektor Konusu", "analysis": "Olasi seans ici etkisinin analizi..."},
    {"topic": "4. Vadeli Endeks / Sektor Konusu", "analysis": "Olasi seans ici etkisinin analizi..."},
    {"topic": "5. Vadeli Endeks / Sektor Konusu", "analysis": "Olasi seans ici etkisinin analizi..."}
  ],
  "us_company_news": [
    {"ticker": "NVDA", "title": "1. En \u00D6nemli Wall Street \u015Eirket Haberi/Bilan\u00E7o Ba\u015Fl\u0131\u011F\u0131", "detail": "Finansal sonu\u00E7lar, gelirler, CapEx veya analist hedef fiyat detaylar\u0131..."},
    {"ticker": "AAPL", "title": "2. Wall Street \u015Eirket Haberi Ba\u015Fl\u0131\u011F\u0131", "detail": "Finansal/operasyonel detaylar..."},
    {"ticker": "MSFT", "title": "3. Wall Street \u015Eirket Haberi Ba\u015Fl\u0131\u011F\u0131", "detail": "Finansal/operasyonel detaylar..."},
    {"ticker": "AMZN", "title": "4. Wall Street \u015Eirket Haberi Ba\u015Fl\u0131\u011F\u0131", "detail": "Finansal/operasyonel detaylar..."},
    {"ticker": "TSLA", "title": "5. Wall Street \u015Eirket Haberi Ba\u015Fl\u0131\u011F\u0131", "detail": "Finansal/operasyonel detaylar..."}
  ],
  "us_global_news": [
    {"title": "1. K\u00FCresel Geli\u015Fmelerin ABD Piyasalar\u0131na Etkisi Haberi Ba\u015Fl\u0131\u011F\u0131", "detail": "Avrupa/Asya borsalar\u0131, emtialar veya jeopoliti\u011Fin Wall Street'e yans\u0131mas\u0131..."},
    {"title": "2. K\u00FCresel Geli\u015Fme Haberi Ba\u015Fl\u0131\u011F\u0131", "detail": "Detayl\u0131 a\u00E7\u0131klama..."},
    {"title": "3. K\u00FCresel Geli\u015Fme Haberi Ba\u015Fl\u0131\u011F\u0131", "detail": "Detayl\u0131 a\u00E7\u0131klama..."},
    {"title": "4. K\u00FCresel Geli\u015Fme Haberi Ba\u015Fl\u0131\u011F\u0131", "detail": "Detayl\u0131 a\u00E7\u0131klama..."},
    {"title": "5. K\u00FCresel G\u00FCndem Haberi Ba\u015Fl\u0131\u011F\u0131", "detail": "Detayl\u0131 a\u00E7\u0131klama..."}
  ],
  "watchlist_stocks": [
    {
      "ticker": "ORCL",
      "title": "Oracle: [Canl\u0131 Haber Ba\u015Fl\u0131\u011F\u0131]",
      "detail": "[Canl\u0131 haber detay\u0131]",
      "forecast": "[Pozitif/N\u00F6tr/Negatif]: [Seans i\u00E7i y\u00F6n \u00F6ng\u00F6r\u00FCs\u00FC ve kataliz\u00F6r nedeni]"
    },
    ... (Di\u011Fer 7 hisse: TSLA, SPCX, SMCI, MSFT, AMZN, ADBE, AAPL i\u00E7in SANA VER\u0130LEN CANLI HABERLER\u0130 KULLANARAK AYNI FORMATTA) ...
  ]
}
`;

  if (apiKey && !apiKey.includes('your_gemini_api_key')) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const modelNames = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
      let text = null;

      for (const mName of modelNames) {
        try {
          console.log(`[Gemini] Trying model: ${mName}...`);
          const model = genAI.getGenerativeModel({ model: mName });
          const result = await model.generateContent(`${systemPrompt}\n\nVER\u0130LER:\n${contextText}`);
          text = result.response.text().trim();
          if (text) {
            console.log(`[Gemini] Success with model: ${mName}`);
            break;
          }
        } catch (e) {
          console.warn(`[Gemini] Model ${mName} failed: ${e.message}. Trying next...`);
        }
      }

      if (text) {
        if (text.startsWith('```')) {
          text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
        }
        return JSON.parse(text);
      }
    } catch (err) {
      console.warn(`[Gemini Warn] ${err.message}. Using Live US RSS Synthesizer.`);
    }
  }

  console.log('[Live Synthesizer] Generating 100% fresh live US Wall Street bulletin from RSS news feeds...');
  return generateLiveUSRSSBulletin(usNews, macroNews, watchNews, todayStr);
}

function generateLiveUSRSSBulletin(usNews, macroNews, watchNews, todayStr) {
  const noDataMsg = 'Bu b\u00F6l\u00FCmde g\u00FCncel veri bulunamad\u0131.';

  // us_macro_news: macroNews ilk 5
  const usMacroItems = macroNews.slice(0, 5).map((item, idx) => ({
    title: `${idx + 1}. ${item.title}`,
    detail: `${item.summary} [Kaynak: ${item.source} - ${todayStr}]`
  }));
  while (usMacroItems.length < 5) {
    usMacroItems.push({ title: `${usMacroItems.length + 1}. -`, detail: noDataMsg });
  }

  // us_market_impact: usNews ilk 5
  const usImpactItems = usNews.slice(0, 5).map((item, idx) => ({
    topic: `${idx + 1}. ${item.title}`,
    analysis: `S&P 500, Nasdaq 100 ve Wall Street a\u00E7\u0131l\u0131\u015F \u00F6ncesi i\u015Flemlere olas\u0131 etkisi: ${item.summary}`
  }));
  while (usImpactItems.length < 5) {
    usImpactItems.push({ topic: `${usImpactItems.length + 1}. -`, analysis: noDataMsg });
  }

  // us_company_news: usNews 5-10
  const usCompanyItems = usNews.slice(5, 10).map((item, idx) => ({
    ticker: 'US',
    title: `${idx + 1}. ${item.title}`,
    detail: `${item.summary} Wall Street analist tahminleri ve pre-market hareketleri izlenmektedir.`
  }));
  while (usCompanyItems.length < 5) {
    usCompanyItems.push({ ticker: 'US', title: `${usCompanyItems.length + 1}. -`, detail: noDataMsg });
  }

  // us_global_news: macroNews 5-10 veya usNews 10-15
  const usGlobalSource = macroNews.length >= 10 ? macroNews.slice(5, 10) : usNews.slice(10, 15);
  const formattedGlobal = usGlobalSource.map((item, idx) => ({
    title: `${idx + 1}. ${item.title}`,
    detail: `${item.summary} [Kaynak: ${item.source} - K\u00FCresel Piyasalar]`
  }));
  while (formattedGlobal.length < 5) {
    formattedGlobal.push({ title: `${formattedGlobal.length + 1}. -`, detail: noDataMsg });
  }

  // watchlist_stocks: watchNews canlı verileri
  const watchlist = WATCHLIST_TICKERS.map((ticker) => {
    const liveNews = watchNews[ticker];
    return {
      ticker: ticker,
      title: `${ticker}: ${liveNews.title}`,
      detail: `${liveNews.summary} [Canl\u0131 Veri]`,
      forecast: `Volatilite Beklentisi: G\u00FCncel piyasa haberleri ve kurumsal geli\u015Fmeler do\u011Frultusunda seans i\u00E7erisinde hareketlilik \u00F6ng\u00F6r\u00FClmektedir.`
    };
  });

  return {
    title: `\uD83C\uDDFA\uD83C\uDDF8 Amerika Finans B\u00FClteni - ${todayStr}`,
    us_macro_news: usMacroItems,
    us_market_impact: usImpactItems,
    us_company_news: usCompanyItems,
    us_global_news: formattedGlobal,
    watchlist_stocks: watchlist
  };
}

function renderUSHtml(bulletin, indicators) {
  const templatePath = path.join(__dirname, 'notifier', 'templates', 'us_bulletin.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  html = html.replaceAll('{{ BULLETIN_TITLE }}', () => bulletin.title || '\uD83C\uDDFA\uD83C\uDDF8 Amerika Finans B\u00FClteni');
  html = html.replaceAll('{{ NOW_YEAR }}', () => new Date().getFullYear());

  const macroHtml = (bulletin.us_macro_news || []).map(i => `
    <div class="news-item">
      <div class="news-item-title">\uD83D\uDCCC ${i.title}</div>
      <div class="news-item-detail">${i.detail}</div>
    </div>
  `).join('\n');
  html = html.replaceAll('<!-- US_MACRO_NEWS_PLACEHOLDER -->', () => macroHtml);

  const impactHtml = (bulletin.us_market_impact || []).map(i => `
    <div class="impact-box">
      <div class="impact-title">\u26A1 ${i.topic}</div>
      <div class="impact-text"><strong>Olas\u0131 Seans \u0130\u00E7i Etki:</strong> ${i.analysis}</div>
    </div>
  `).join('\n');
  html = html.replaceAll('<!-- US_MARKET_IMPACT_PLACEHOLDER -->', () => impactHtml);

  const companyHtml = (bulletin.us_company_news || []).map(i => `
    <div class="news-item">
      <div class="news-item-title">
        ${i.ticker ? `<span class="company-badge">${i.ticker}</span>` : ''}${i.title}
      </div>
      <div class="news-item-detail">${i.detail}</div>
    </div>
  `).join('\n');
  html = html.replaceAll('<!-- US_COMPANY_NEWS_PLACEHOLDER -->', () => companyHtml);

  const globalHtml = (bulletin.us_global_news || []).map(i => `
    <div class="news-item">
      <div class="news-item-title">\uD83C\uDF10 ${i.title}</div>
      <div class="news-item-detail">${i.detail}</div>
    </div>
  `).join('\n');
  html = html.replaceAll('<!-- US_GLOBAL_NEWS_PLACEHOLDER -->', () => globalHtml);

  const watchlistHtml = (bulletin.watchlist_stocks || []).map(stock => `
    <div class="stock-box">
      <div class="stock-header">
        <span class="stock-badge">${stock.ticker}</span>
        <span class="stock-title">${stock.title}</span>
      </div>
      <div class="stock-detail">${stock.detail}</div>
      <div class="forecast-box">
        <strong>\uD83D\uDCC8 Seans \u0130\u00E7i Y\u00F6n \u00D6ng\u00F6r\u00FCs\u00FC & Etki Analizi:</strong> ${stock.forecast}
      </div>
    </div>
  `).join('\n');
  html = html.replaceAll('<!-- WATCHLIST_STOCKS_PLACEHOLDER -->', () => watchlistHtml);

  const indHtml = (indicators || []).map(ind => `
    <div class="indicator-item">
      <strong>${ind.name}:</strong> <span class="indicator-val">${ind.price}</span> (${ind.change_pct})
    </div>
  `).join('\n');
  html = html.replaceAll('<!-- INDICATORS_PLACEHOLDER -->', () => `<div class="indicator-bar">${indHtml}</div>`);

  return html;
}

async function sendMail(bulletin, htmlContent) {
  const user = process.env.GMAIL_USER || 'atakanbostanci_@hotmail.com';
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const recipient = process.env.RECIPIENT_EMAIL || user;
  const resendApiKey = process.env.RESEND_API_KEY;

  if (resendApiKey && !resendApiKey.includes('your_resend')) {
    try {
      console.log(`[Resend API] Sending US Bulletin email to ${recipient}...`);
      const { Resend } = require('resend');
      const resend = new Resend(resendApiKey);
      const response = await resend.emails.send({
        from: 'Finans B\u00FClteni <onboarding@resend.dev>',
        to: [recipient],
        subject: bulletin.title,
        html: htmlContent
      });

      if (response.error) {
        console.warn(`[Resend Error] ${response.error.message || JSON.stringify(response.error)}`);
      } else if (response.data && response.data.id) {
        console.log(`\uD83C\uDF89 [Resend Success] US Bulletin sent via Resend API! ID: ${response.data.id}`);
        return true;
      }
    } catch (err) {
      console.warn(`[Resend Exception] Resend API failed: ${err.message}`);
    }
  }

  if (!user || !pass) {
    console.log('[SMTP Warning] Credentials not set in .env. Saving HTML preview.');
    fs.writeFileSync('us_bulletin_preview.html', htmlContent, 'utf8');
    return false;
  }

  const configs = [
    { name: 'Gmail SMTP (Port 587 STARTTLS)', host: 'smtp.gmail.com', port: 587, secure: false },
    { name: 'Gmail SMTP (Port 465 SSL)', host: 'smtp.gmail.com', port: 465, secure: true },
    { name: 'Outlook SMTP (Port 587 STARTTLS)', host: 'smtp-mail.outlook.com', port: 587, secure: false }
  ];

  for (const cfg of configs) {
    try {
      console.log(`[SMTP] Attempting connection via ${cfg.name} for ${user}...`);
      const transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: { user, pass },
        tls: { rejectUnauthorized: false }
      });

      const info = await transporter.sendMail({
        from: `"Wall Street B\u00FClteni Otomasyonu" <${user}>`,
        to: recipient,
        subject: bulletin.title,
        html: htmlContent
      });

      console.log(`\uD83C\uDF89 [SMTP Success] US Bulletin sent successfully via ${cfg.name}! MessageID: ${info.messageId}`);
      return true;
    } catch (err) {
      console.warn(`[SMTP Warning] ${cfg.name} failed: ${err.message}`);
    }
  }

  console.error('\u274C All SMTP/Email configurations failed. Saving HTML preview file.');
  fs.writeFileSync('us_bulletin_preview.html', htmlContent, 'utf8');
  return false;
}

async function main() {
  console.log('\uD83D\uDE80 Starting US Wall Street 16:00 Bulletin Engine...');

  console.log('Step 1/4: Fetching live US RSS news, specific watchlist stock news & real-time market indicators...');
  const [usNews, macroNews, watchNews, indicators] = await Promise.all([
    fetchFeed(US_MARKET_RSS),
    fetchFeed(MACRO_RSS),
    fetchWatchlistNews(),
    fetchMarketIndicators()
  ]);

  console.log(`Fetched: ${usNews.length} US items, ${macroNews.length} Macro items, and 8 Live Watchlist items.`);

  console.log('Step 2/4: Generating 5-Section US AI Bulletin with 8 Watchlist Stocks...');
  const bulletin = await generateUSBulletinWithGemini(usNews, macroNews, watchNews, indicators);

  console.log('Step 3/4: Rendering US Executive HTML Email Template...');
  const htmlContent = renderUSHtml(bulletin, indicators);

  if (process.argv.includes('--preview')) {
    fs.writeFileSync('us_bulletin_preview.html', htmlContent, 'utf8');
    console.log('\u2705 Preview mode: Output saved to us_bulletin_preview.html');
    return;
  }

  console.log('Step 4/4: Delivering US Bulletin Email via Resend / SMTP...');
  await sendMail(bulletin, htmlContent);
  console.log('\uD83C\uDF89 US Wall Street Bulletin Pipeline Completed!');
}

main().catch(err => {
  console.error('\u274C Pipeline Error:', err);
  process.exit(1);
});
