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

// RSS Sources
const BIST_RSS = [
  { name: 'Bloomberg HT', url: 'https://www.bloomberght.com/rss' },
  { name: 'Investing TR Ekonomi', url: 'https://tr.investing.com/rss/news_285.rss' },
  { name: 'Investing TR Borsa', url: 'https://tr.investing.com/rss/news_25.rss' },
  { name: 'Dünya Gazetesi Finans', url: 'https://www.dunya.com/rss?kategori=finans' },
  { name: 'Anadolu Ajansı Finans', url: 'https://www.aa.com.tr/tr/rss/default?cat=ekonomi' }
];

const US_MARKET_RSS = [
  { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex' },
  { name: 'CNBC Markets', url: 'https://search.cnbc.com/rs/search/combinedAsset/rss/search.rss?partnerId=2000&keywords=stock%20market' },
  { name: 'MarketWatch', url: 'http://feeds.marketwatch.com/marketwatch/topstories/' },
  { name: 'Investing US', url: 'https://www.investing.com/rss/news_25.rss' }
];

const MACRO_RSS = [
  { name: 'Investing Economy', url: 'https://www.investing.com/rss/news_14.rss' },
  { name: 'CNBC Economy', url: 'https://search.cnbc.com/rs/search/combinedAsset/rss/search.rss?partnerId=2000&keywords=economy' },
  { name: 'Federal Reserve', url: 'https://www.federalreserve.gov/feeds/press_all.xml' }
];

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

// --- Yahoo Finance v8 API ---
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

// --- Yahoo Finance v10 API (fallback) ---
function getYahooQuoteV10(symbol) {
  return new Promise((resolve) => {
    const url = 'https://query2.finance.yahoo.com/v10/finance/quoteSummary/' + encodeURIComponent(symbol) + '?modules=price';
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
          const prevClose = priceData.regularMarketPreviousClose.raw;
          const changePct = ((price - prevClose) / prevClose * 100).toFixed(2);
          resolve({ price, changePct: (changePct >= 0 ? '+' : '') + changePct + '%' });
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// --- Combined quote fetcher: v8 first, then v10, then null ---
async function getYahooQuote(symbol) {
  const v8Result = await getYahooQuoteV8(symbol);
  if (v8Result) return v8Result;
  console.warn(`[Yahoo v8] ${symbol} failed, trying v10 fallback...`);
  const v10Result = await getYahooQuoteV10(symbol);
  if (v10Result) return v10Result;
  console.warn(`[Yahoo v10] ${symbol} also failed. No data available.`);
  return null;
}

async function fetchMarketIndicators() {
  console.log('[Market Data] Fetching real-time financial market indicators from Yahoo Finance...');
  const [usdTry, eurTry, gold, silver, brent, us10y] = await Promise.all([
    getYahooQuote('USDTRY=X'),
    getYahooQuote('EURTRY=X'),
    getYahooQuote('GC=F'),
    getYahooQuote('SI=F'),
    getYahooQuote('BZ=F'),
    getYahooQuote('^TNX')
  ]);

  // Helper: format price or 'Veri Yok'
  const fmt = (quote, decimals = 2) => quote ? quote.price.toFixed(decimals) : null;

  const usdVal = fmt(usdTry);
  const eurVal = fmt(eurTry);
  const goldVal = fmt(gold);
  const silverVal = fmt(silver);
  const brentVal = fmt(brent);
  const us10yVal = fmt(us10y);

  // Calculate Gram Gold and Gram Silver only if both dependencies are available
  const gramGoldVal = (usdTry && gold) ? (gold.price / 31.1035 * usdTry.price).toFixed(2) : null;
  const gramSilverVal = (usdTry && silver) ? (silver.price / 31.1035 * usdTry.price).toFixed(2) : null;

  const indicators = [
    { name: 'USD/TRY', price: usdVal ? `${usdVal} TL` : 'Veri Yok', change_pct: usdTry ? usdTry.changePct : 'N/A' },
    { name: 'EUR/TRY', price: eurVal ? `${eurVal} TL` : 'Veri Yok', change_pct: eurTry ? eurTry.changePct : 'N/A' },
    { name: 'Ons Altın ($)', price: goldVal ? `${goldVal} $` : 'Veri Yok', change_pct: gold ? gold.changePct : 'N/A' },
    { name: 'Gram Altın', price: gramGoldVal ? `${gramGoldVal} TL` : 'Veri Yok', change_pct: gold ? gold.changePct : 'N/A' },
    { name: 'Ons Gümüş ($)', price: silverVal ? `${silverVal} $` : 'Veri Yok', change_pct: silver ? silver.changePct : 'N/A' },
    { name: 'Gram Gümüş', price: gramSilverVal ? `${gramSilverVal} TL` : 'Veri Yok', change_pct: silver ? silver.changePct : 'N/A' },
    { name: 'Brent Petrol ($)', price: brentVal ? `${brentVal} $` : 'Veri Yok', change_pct: brent ? brent.changePct : 'N/A' },
    { name: 'ABD 10Y Tahvil (%)', price: us10yVal ? `${us10yVal}%` : 'Veri Yok', change_pct: us10y ? us10y.changePct : 'N/A' }
  ];

  return indicators;
}

async function generateBulletinWithGemini(bistNews, usNews, macroNews, indicators) {
  const apiKey = process.env.GEMINI_API_KEY;
  const todayStr = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  let contextText = `=== BUGÜNÜN TARİHİ: ${todayStr} ===\n\n`;
  contextText += `=== BIST & TÜRKİYE FİNANS HABERLERİ ===\n` + bistNews.map(i => `- [${i.source}] ${i.title}: ${i.summary}`).join('\n') + '\n\n';
  contextText += `=== ABD PİYASALARI HABERLERİ ===\n` + usNews.map(i => `- [${i.source}] ${i.title}: ${i.summary}`).join('\n') + '\n\n';
  contextText += `=== KÜRESEL MAKROEKONOMİ HABERLERİ ===\n` + macroNews.map(i => `- [${i.source}] ${i.title}: ${i.summary}`).join('\n');

  const systemPrompt = `
Sen üst düzey bir Kurumsal Finans Uzmanı ve Hisse Senedi Araştırma (Equity Research) Direktörüsün. 
Sana sağlanan güncel haberleri ve verileri inceleyerek, her sabah saat 08:00 itibarıyla Kurumsal Finans Uzmanının okuyacağı VIP Türkiye Finans Bültenini hazırlayacaksın.

KRİTİK UZMANLIK TALİMATLARI:
1. Bülten tam olarak 4 ana bölümden oluşmalı ve HER BİR BÖLÜMDE ÖNEM SIRASINA GÖRE EN İLGİLİ VE EN KRİTİK TAM 5 (BEŞ) ADET HABER VEYA ANALİZ MADDESİ YER MALMALIDIR.
2. AÇIKLAMALAR YÜZEYSEL OLMAYACAK! Tek cümlelik yüzeysel özetlerden kaçın. Her bir maddenin açıklamasında haberin arka planı, finansal/operasyonel sebepleri, net rakamsal verileri ve piyasa/sektör üzerindeki somut etkileri kurumsal finans uzmanı derinliğinde detaylıca yazılmalıdır. Gereksiz dolgu kelimeler kullanma, bilgi yoğunluğunu yüksek tut.

Bülten SADECE aşağıdaki JSON formatında olmak zorundadır:

{
  "title": "🇹🇷 Türkiye Finans Bülteni - ${todayStr}",
  "turkey_news": [
    {"title": "1. En Önemli Türkiye Siyasi/Ekonomik Gelişme Başlığı", "detail": "Detaylı, rakamsal ve finansal arka planı içeren açıklama..."},
    {"title": "2. Türkiye Siyasi/Ekonomik Gelişme Başlığı", "detail": "Detaylı açıklama..."},
    {"title": "3. Türkiye Siyasi/Ekonomik Gelişme Başlığı", "detail": "Detaylı açıklama..."},
    {"title": "4. Türkiye Siyasi/Ekonomik Gelişme Başlığı", "detail": "Detaylı açıklama..."},
    {"title": "5. Türkiye Siyasi/Ekonomik Gelişme Başlığı", "detail": "Detaylı açıklama..."}
  ],
  "bist_impact_analysis": [
    {"topic": "1. En Kritik Gündem Konusu", "analysis": "BIST 100, XBANK, sanayi endeksi ve ilgili hisse gruplarına olası seans içi ve orta vadeli etkilerinin derinlemesine finansal analizi..."},
    {"topic": "2. Gündem Konusu", "analysis": "Olası Borsa etkisinin detaylı analizi..."},
    {"topic": "3. Gündem Konusu", "analysis": "Olası Borsa etkisinin detaylı analizi..."},
    {"topic": "4. Gündem Konusu", "analysis": "Olası Borsa etkisinin detaylı analizi..."},
    {"topic": "5. Gündem Konusu", "analysis": "Olası Borsa etkisinin detaylı analizi..."}
  ],
  "company_news": [
    {"ticker": "THYAO", "title": "1. En Önemli Şirket Haberi/KAP Başlığı", "detail": "Operasyonel sonuçlar, doluluk oranları, marjlar, temettü, yatırımlar veya hedef fiyat detayları..."},
    {"ticker": "AKBNK", "title": "2. Şirket Haberi/KAP Başlığı", "detail": "Finansal ve operasyonel detaylar..."},
    {"ticker": "TUPRS", "title": "3. Şirket Haberi/KAP Başlığı", "detail": "Finansal ve operasyonel detaylar..."},
    {"ticker": "EREGL", "title": "4. Şirket Haberi/KAP Başlığı", "detail": "Finansal ve operasyonel detaylar..."},
    {"ticker": "ICU", "title": "5. Şirket Haberi/KAP Başlığı", "detail": "Finansal ve operasyonel detaylar..."}
  ],
  "global_news": [
    {"title": "1. En Önemli Küresel/Dünya Gündemi Haberi Başlığı", "detail": "Fed, ECB, emtialar veya Big Tech üzerindeki küresel etkileriyle detaylı açıklama..."},
    {"title": "2. Küresel Gündem Haberi Başlığı", "detail": "Detaylı açıklama..."},
    {"title": "3. Küresel Gündem Haberi Başlığı", "detail": "Detaylı açıklama..."},
    {"title": "4. Küresel Gündem Haberi Başlığı", "detail": "Detaylı açıklama..."},
    {"title": "5. Küresel Gündem Haberi Başlığı", "detail": "Detaylı açıklama..."}
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
          const result = await model.generateContent(`${systemPrompt}\n\nVERİLER:\n${contextText}`);
          text = result.response.text().trim();
          if (text) {
            console.log(`[Gemini] Success with model: ${mName}`);
            break;
          }
        } catch (e) {
          console.warn(`[Gemini] Model ${mName} failed: ${e.message}`);
        }
      }

      if (text) {
        if (text.startsWith('```')) {
          text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
        }
        return JSON.parse(text);
      }
    } catch (err) {
      console.warn(`[Gemini Warn] ${err.message}. Using Live RSS Synthesizer.`);
    }
  }

  console.log('[Live Synthesizer] Gemini unavailable. Generating 100% fresh live bulletin from RSS news feeds...');
  return generateLiveRSSBulletin(bistNews, usNews, macroNews, todayStr);
}

function generateLiveRSSBulletin(bistNews, usNews, macroNews, todayStr) {
  const NO_DATA_MSG = 'Bu bölümde güncel veri bulunamadı.';
  const defaultTickers = ['THYAO', 'AKBNK', 'TUPRS', 'EREGL', 'KCHOL'];

  // --- turkey_news: bistNews 0-4 (first 5) ---
  const turkeySlice = bistNews.slice(0, 5);
  const turkeyItems = [];
  for (let i = 0; i < 5; i++) {
    if (i < turkeySlice.length) {
      const item = turkeySlice[i];
      turkeyItems.push({
        title: `${i + 1}. ${item.title}`,
        detail: `${item.summary} [Kaynak: ${item.source} - ${todayStr}]`
      });
    } else {
      turkeyItems.push({
        title: `${i + 1}. —`,
        detail: NO_DATA_MSG
      });
    }
  }

  // --- bist_impact_analysis: bistNews 5-9 (indices 5-10) ---
  const bistSlice = bistNews.slice(5, 10);
  const bistImpactItems = [];
  for (let i = 0; i < 5; i++) {
    if (i < bistSlice.length) {
      const item = bistSlice[i];
      bistImpactItems.push({
        topic: `${i + 1}. ${item.title}`,
        analysis: `Borsa İstanbul seansında ilgili sektör ve BIST 100 endeksi üzerindeki etkisi: ${item.summary}`
      });
    } else {
      bistImpactItems.push({
        topic: `${i + 1}. —`,
        analysis: NO_DATA_MSG
      });
    }
  }

  // --- company_news: bistNews 10-14 (indices 10-15) ---
  const companySlice = bistNews.slice(10, 15);
  const companyItems = [];
  for (let i = 0; i < 5; i++) {
    if (i < companySlice.length) {
      const item = companySlice[i];
      companyItems.push({
        ticker: defaultTickers[i % defaultTickers.length],
        title: `${i + 1}. ${item.title}`,
        detail: `${item.summary} Şirket finansalları ve KAP açıklamaları yakından takip edilmektedir.`
      });
    } else {
      companyItems.push({
        ticker: defaultTickers[i % defaultTickers.length],
        title: `${i + 1}. —`,
        detail: NO_DATA_MSG
      });
    }
  }

  // --- global_news: macroNews first 5, fill from usNews if needed ---
  const globalPool = [...macroNews, ...usNews];
  const globalSlice = globalPool.slice(0, 5);
  const globalItems = [];
  for (let i = 0; i < 5; i++) {
    if (i < globalSlice.length) {
      const item = globalSlice[i];
      globalItems.push({
        title: `${i + 1}. ${item.title}`,
        detail: `${item.summary} [Kaynak: ${item.source} - Küresel Piyasalar]`
      });
    } else {
      globalItems.push({
        title: `${i + 1}. —`,
        detail: NO_DATA_MSG
      });
    }
  }

  return {
    title: `🇹🇷 Türkiye Finans Bülteni - ${todayStr}`,
    turkey_news: turkeyItems,
    bist_impact_analysis: bistImpactItems,
    company_news: companyItems,
    global_news: globalItems
  };
}

function renderHtml(bulletin, indicators) {
  const templatePath = path.join(__dirname, 'notifier', 'templates', 'bulletin.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  html = html.replaceAll('{{ BULLETIN_TITLE }}', () => bulletin.title || '🇹🇷 Türkiye Finans Bülteni');
  html = html.replaceAll('{{ NOW_YEAR }}', () => new Date().getFullYear());

  const turkeyHtml = (bulletin.turkey_news || []).map(i => `
    <div class="news-item">
      <div class="news-item-title">📌 ${i.title}</div>
      <div class="news-item-detail">${i.detail}</div>
    </div>
  `).join('\n');
  html = html.replaceAll('<!-- TURKEY_NEWS_PLACEHOLDER -->', () => turkeyHtml);

  const impactHtml = (bulletin.bist_impact_analysis || []).map(i => `
    <div class="impact-box">
      <div class="impact-title">⚡ ${i.topic}</div>
      <div class="impact-text"><strong>Olası Borsa Etkisi:</strong> ${i.analysis}</div>
    </div>
  `).join('\n');
  html = html.replaceAll('<!-- BIST_IMPACT_PLACEHOLDER -->', () => impactHtml);

  const companyHtml = (bulletin.company_news || []).map(i => `
    <div class="news-item">
      <div class="news-item-title">
        ${i.ticker ? `<span class="company-badge">${i.ticker}</span>` : ''}${i.title}
      </div>
      <div class="news-item-detail">${i.detail}</div>
    </div>
  `).join('\n');
  html = html.replaceAll('<!-- COMPANY_NEWS_PLACEHOLDER -->', () => companyHtml);

  const globalHtml = (bulletin.global_news || []).map(i => `
    <div class="news-item">
      <div class="news-item-title">🌐 ${i.title}</div>
      <div class="news-item-detail">${i.detail}</div>
    </div>
  `).join('\n');
  html = html.replaceAll('<!-- GLOBAL_NEWS_PLACEHOLDER -->', () => globalHtml);

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
      console.log(`[Resend API] Sending email to ${recipient}...`);
      const { Resend } = require('resend');
      const resend = new Resend(resendApiKey);
      const response = await resend.emails.send({
        from: 'Finans Bülteni <onboarding@resend.dev>',
        to: [recipient],
        subject: bulletin.title,
        html: htmlContent
      });

      if (response.error) {
        console.warn(`[Resend Error] ${response.error.message || JSON.stringify(response.error)}`);
      } else if (response.data && response.data.id) {
        console.log(`🎉 [Resend Success] Email sent via Resend API! ID: ${response.data.id}`);
        return true;
      }
    } catch (err) {
      console.warn(`[Resend Exception] Resend API failed: ${err.message}`);
    }
  }

  if (!user || !pass) {
    console.log('[SMTP Warning] Credentials not set in .env. Saving HTML preview.');
    fs.writeFileSync('bulletin_preview.html', htmlContent, 'utf8');
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
        from: `"Finans Bülteni Otomasyonu" <${user}>`,
        to: recipient,
        subject: bulletin.title,
        html: htmlContent
      });

      console.log(`🎉 [SMTP Success] Email sent successfully via ${cfg.name}! MessageID: ${info.messageId}`);
      return true;
    } catch (err) {
      console.warn(`[SMTP Warning] ${cfg.name} failed: ${err.message}`);
    }
  }

  console.error('❌ All SMTP/Email configurations failed. Saving HTML preview file.');
  fs.writeFileSync('bulletin_preview.html', htmlContent, 'utf8');
  return false;
}

async function main() {
  console.log('🚀 Starting Turkey Morning Finance Bulletin Engine...');

  console.log('Step 1/4: Fetching live RSS news & real-time market indicators...');
  const [bistNews, usNews, macroNews, indicators] = await Promise.all([
    fetchFeed(BIST_RSS),
    fetchFeed(US_MARKET_RSS),
    fetchFeed(MACRO_RSS),
    fetchMarketIndicators()
  ]);

  console.log(`Fetched: ${bistNews.length} BIST items, ${usNews.length} US items, ${macroNews.length} Macro items.`);

  console.log('Step 2/4: Generating 5-Item 4-Section AI Bulletin...');
  const bulletin = await generateBulletinWithGemini(bistNews, usNews, macroNews, indicators);

  console.log('Step 3/4: Rendering Executive HTML Email Template...');
  const htmlContent = renderHtml(bulletin, indicators);

  if (process.argv.includes('--preview')) {
    fs.writeFileSync('bulletin_preview.html', htmlContent, 'utf8');
    console.log('✅ Preview mode: Output saved to bulletin_preview.html');
    return;
  }

  console.log('Step 4/4: Delivering Email via Resend / SMTP...');
  await sendMail(bulletin, htmlContent);
  console.log('🎉 Turkey Morning Bulletin Pipeline Completed!');
}

main().catch(err => {
  console.error('❌ Pipeline Error:', err);
  process.exit(1);
});
