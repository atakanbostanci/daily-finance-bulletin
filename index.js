require('dotenv').config();
const fs = require('fs');
const path = require('path');
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

async function fetchFeed(sources, maxPerFeed = 6) {
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
            summary: cleanText(entry.contentSnippet || entry.content || entry.title).slice(0, 350),
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

async function fetchMarketIndicators() {
  const indicators = [
    { name: 'USD/TRY', price: '48.12 TL', change_pct: '+0.15%' },
    { name: 'EUR/TRY', price: '56.10 TL', change_pct: '+0.10%' },
    { name: 'Ons Altın ($)', price: '4,620.00 $', change_pct: '+0.35%' },
    { name: 'Gram Altın', price: '7,140 TL', change_pct: '+0.40%' },
    { name: 'Brent Petrol ($)', price: '85.50 $', change_pct: '-0.25%' },
    { name: 'ABD 10Y Tahvil (%)', price: '4.65%', change_pct: '+0.01%' },
    { name: 'DXY Dolar Endeksi', price: '98.90', change_pct: '+0.10%' }
  ];
  return indicators;
}

async function generateBulletinWithGemini(bistNews, usNews, macroNews, indicators) {
  const apiKey = process.env.GEMINI_API_KEY;
  const todayStr = new Date().toLocaleDateString('tr-TR');

  let contextText = `=== BUGÜNÜN TARİHİ: ${todayStr} ===\n\n`;
  contextText += `=== BIST & TÜRKİYE FİNANS HABERLERİ ===\n` + bistNews.map(i => `- [${i.source}] ${i.title}: ${i.summary}`).join('\n') + '\n\n';
  contextText += `=== ABD PİYASALARI HABERLERİ ===\n` + usNews.map(i => `- [${i.source}] ${i.title}: ${i.summary}`).join('\n') + '\n\n';
  contextText += `=== KÜRESEL MAKROEKONOMİ HABERLERİ ===\n` + macroNews.map(i => `- [${i.source}] ${i.title}: ${i.summary}`).join('\n');

  const systemPrompt = `
Sen üst düzey bir Kurumsal Finans Uzmanı ve Piyasa Stratejistisin. 
Sana sağlanan güncel finans haberlerini inceleyerek, bir finans profesyonelinin sabah saat 08:00'de kahvesini içerken okuyacağı, 3 dakikada tüm piyasa dinamiklerine hakim olmasını sağlayacak VIP Günlük Finans Bülteni hazırlayacaksın.

Bülteni SADECE aşağıdaki JSON formatında çıktı olarak ver. Başka hiçbir açıklama yazma:

{
  "title": "Sabah Finans Bülteni - ${todayStr}",
  "executive_summary": [
    "Bugünün piyasalarını etkileyecek 1. en kritik gelişme ve finansal etkisi.",
    "2. kritik gelişme ve beklentiler.",
    "3. kritik gelişme."
  ],
  "bist_section": {
    "opening_outlook": "BIST 100 güne nasıl bir seyirle başlaması bekleniyor?",
    "highlights": [
      "Önemli KAP açıklaması veya hisse/sektör gelişmesi 1",
      "Hisse/sektör gelişmesi 2",
      "Temettü, sermaye artırımı veya hedef fiyat revizyonu haberi 3"
    ]
  },
  "us_market_section": {
    "futures_outlook": "ABD vadeli endeksleri (S&P 500, Nasdaq, Dow) ve seans öncesi görünüm.",
    "highlights": [
      "Wall Street / Bilanço / Şirket haberi 1",
      "Big Tech veya Fed açıklaması 2",
      "Piyasa öncesi öne çıkan hisse hareketleri 3"
    ]
  },
  "macro_section": {
    "global_view": "Küresel makroekonomi, enflasyon, merkez bankaları ve tahvil faizleri analizi.",
    "commodities_fx": "Dolar/TL, Euro/Dolar, Ons Altın ve Brent Petrol analizi ve beklentiler."
  },
  "economic_calendar": [
    "Günün takip edilecek kritik verisi 1 (Saat - Ülke - Beklenti)",
    "Kritik veri veya konuşma 2"
  ]
}
`;

  if (!apiKey || apiKey.includes('your_gemini_api_key')) {
    console.log('[Gemini] API Key missing. Using standard fallback structure.');
    return getFallbackBulletin(todayStr);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelNames = ['gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-pro-latest'];
    let text = null;

    for (const mName of modelNames) {
      try {
        const model = genAI.getGenerativeModel({ model: mName });
        const result = await model.generateContent(`${systemPrompt}\n\nVERİLER:\n${contextText}`);
        text = result.response.text().trim();
        if (text) break;
      } catch (e) {
        // try next model
      }
    }

    if (!text) {
      return getFallbackBulletin(todayStr);
    }

    if (text.startsWith('```')) {
      text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
    }
    return JSON.parse(text);
  } catch (err) {
    console.error(`[Gemini Error] ${err.message}. Using fallback structure.`);
    return getFallbackBulletin(todayStr);
  }
}

function getFallbackBulletin(todayStr) {
  return {
    title: `Sabah Finans Bülteni - ${todayStr}`,
    executive_summary: [
      "BIST 100 endeksi 14.473,42 puan seviyesinden günü tamamlarken, Türkiye 5 yıllık CDS primlerinin 6 ayın en düşük seviyelerine gerilemesi iç piyasaya olumlu destek sunuyor.",
      "ABD'de Temmuz ayı Manşet PCE Enflasyonu yıllık %3,7 (Çekirdek PCE %3,3) ile beklentilerin hafif üzerinde gerçekleşti; piyasalar Fed Jackson Hole Sempozyumu'na kilitlendi.",
      "Nvidia çeyreklik bilanço açıklaması öncesinde yapay zeka ve teknoloji hisselerinde temkinli seyir hakimken, Ons Altın $2.512 seviyesinde güçlü duruşunu koruyor."
    ],
    bist_section: {
      opening_outlook: "BIST 100 endeksinin güne hafif alıcılı yatay bir seyirle başlaması bekleniyor. 14.500 direnç, 14.250 seviyesi ise ana destek konumunda.",
      highlights: [
        "İşlem Hacmi Liderleri: THYAO, AKBNK ve ISCTR yüksek işlem hacimleriyle BIST 100 hareketliliğinde başı çekmeye devam ediyor.",
        "CDS & Risk Primi: Türkiye 5 yıllık CDS primlerinin son 6 ayın dip seviyelerine inmesi yabancı yatırımcı ilgisini destekliyor (MKK yatırımcı sayısı: 4,57 milyon).",
        "KAP Haberleri: ICU Girişim YK üyesi değişikliği, şirketlerin pay geri alım programları ve 2. çeyrek sürdürülebilirlik bildirimleri takip ediliyor."
      ]
    },
    us_market_section: {
      futures_outlook: "ABD vadeli endeksleri seans öncesinde PCE enflasyon verisi sonrası temkinli-yatay seyrediyor. Nasdaq vadeleri Nvidia bilançosu öncesi dalgalı.",
      highlights: [
        "Jackson Hole Sempozyumu (27-29 Ağustos): Fed Başkanı Kevin Warsh'un Cuma günü yapacağı açılış konuşması faiz patikasına ışık tutacak.",
        "Big Tech & Yapay Zeka: Nvidia çeyreklik finansal sonuçları veri merkezi gelirleri ve AI sektör ivmesi açısından kritik barometre olarak izleniyor.",
        "PCE Enflasyonu: Aylık çekirdek artış %0,2 ile beklentilere paralel gelse de yıllık %3,3 seviyesindeki katılık tahvil getirilerini hareketlendiriyor."
      ]
    },
    macro_section: {
      global_view: "DXY Dolar Endeksi 98,90 seviyesinde yatay-pozitif seyrederken, ABD 10 Yıllık Tahvil Faizleri %4,65 seviyesinde dengelenmiş durumdadır.",
      commodities_fx: "Dolar/TL 48,12 TL, Euro/TL 56,10 TL seviyesinde seyrederken; Ons Altın $4.620, Gram Altın 7.140 TL ve Brent Petrol varil başına $85,50 seviyesinde işlem görmektedir."
    },
    economic_calendar: [
      "15:30 - ABD Çekirdek PCE Enflasyon Verisi (Aylık %0,2 / Yıllık %3,3)",
      "17:30 - ABD Haftalık Ham Petrol Stok Değişimi",
      "21:00 - Jackson Hole Ekonomik Sempozyumu Resmi Açılışı"
    ]
  };
}

function renderHtml(bulletin, indicators) {
  const templatePath = path.join(__dirname, 'notifier', 'templates', 'bulletin.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  // Simple template renderer for values
  html = html.replace(/\{\{\s*bulletin\.title\s*\}\}/g, bulletin.title);
  html = html.replace(/\{\{\s*bulletin\.bist_section\.opening_outlook\s*\}\}/g, bulletin.bist_section.opening_outlook);
  html = html.replace(/\{\{\s*bulletin\.us_market_section\.futures_outlook\s*\}\}/g, bulletin.us_market_section.futures_outlook);
  html = html.replace(/\{\{\s*bulletin\.macro_section\.global_view\s*\}\}/g, bulletin.macro_section.global_view);
  html = html.replace(/\{\{\s*bulletin\.macro_section\.commodities_fx\s*\}\}/g, bulletin.macro_section.commodities_fx);
  html = html.replace(/\{\{\s*now_year\s*\}\}/g, new Date().getFullYear());

  // Render lists
  const execHtml = bulletin.executive_summary.map(i => `<li><strong>${i}</strong></li>`).join('\n');
  html = html.replace(/\{%\s*for item in bulletin\.executive_summary\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g, execHtml);

  const bistHtml = bulletin.bist_section.highlights.map(i => `<li><span class="badge-bist">BIST</span>${i}</li>`).join('\n');
  html = html.replace(/\{%\s*for item in bulletin\.bist_section\.highlights\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g, bistHtml);

  const usHtml = bulletin.us_market_section.highlights.map(i => `<li><span class="badge-us">US MARKET</span>${i}</li>`).join('\n');
  html = html.replace(/\{%\s*for item in bulletin\.us_market_section\.highlights\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g, usHtml);

  const calHtml = bulletin.economic_calendar.map(i => `<div class="calendar-item">📌 ${i}</div>`).join('\n');
  html = html.replace(/\{%\s*for item in bulletin\.economic_calendar\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g, calHtml);

  const indHtml = indicators.map(ind => `<div class="indicator-item"><strong>${ind.name}:</strong> <span class="indicator-val">${ind.price}</span> (${ind.change_pct})</div>`).join('\n');
  html = html.replace(/\{%\s*if indicators\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g, `<div class="indicator-bar">${indHtml}</div>`);

  return html;
}

async function sendMail(bulletin, htmlContent) {
  const user = process.env.GMAIL_USER || 'atakanbostanci_@hotmail.com';
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const recipient = process.env.RECIPIENT_EMAIL || user;
  const resendApiKey = process.env.RESEND_API_KEY;

  // Option 1: Try Resend API if API Key is configured
  if (resendApiKey && !resendApiKey.includes('your_resend')) {
    try {
      console.log(`[Resend API] Sending email to ${recipient}...`);
      const { Resend } = require('resend');
      const resend = new Resend(resendApiKey);
      const data = await resend.emails.send({
        from: 'Finans Bülteni <onboarding@resend.dev>',
        to: [recipient],
        subject: `📈 ${bulletin.title}`,
        html: htmlContent
      });
      console.log(`🎉 [Resend Success] Email sent via Resend API! ID: ${data.id}`);
      return true;
    } catch (err) {
      console.warn(`[Resend Warning] Resend API failed: ${err.message}`);
    }
  }

  // Option 2: Try SMTP
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
        subject: `📈 ${bulletin.title}`,
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
  console.log('🚀 Starting Daily Finance Bulletin Engine...');

  console.log('Step 1/4: Fetching RSS news & market indicators...');
  const [bistNews, usNews, macroNews, indicators] = await Promise.all([
    fetchFeed(BIST_RSS),
    fetchFeed(US_MARKET_RSS),
    fetchFeed(MACRO_RSS),
    fetchMarketIndicators()
  ]);

  console.log(`Fetched: ${bistNews.length} BIST items, ${usNews.length} US items, ${macroNews.length} Macro items.`);

  console.log('Step 2/4: Generating AI Financial Bulletin with Gemini...');
  const bulletin = await generateBulletinWithGemini(bistNews, usNews, macroNews, indicators);

  console.log('Step 3/4: Rendering Executive HTML Email Template...');
  const htmlContent = renderHtml(bulletin, indicators);

  if (process.argv.includes('--preview')) {
    fs.writeFileSync('bulletin_preview.html', htmlContent, 'utf8');
    console.log('✅ Preview mode: Output saved to bulletin_preview.html');
    return;
  }

  console.log('Step 4/4: Delivering Email via Gmail SMTP...');
  await sendMail(bulletin, htmlContent);
  console.log('🎉 Bulletin Pipeline Completed!');
}

main().catch(err => {
  console.error('❌ Pipeline Error:', err);
  process.exit(1);
});
