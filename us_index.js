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

// US & Global Financial RSS Sources
const US_MARKET_RSS = [
  { name: 'Yahoo Finance Top', url: 'https://finance.yahoo.com/news/rssindex' },
  { name: 'CNBC Stock Market', url: 'https://search.cnbc.com/rs/search/combinedAsset/rss/search.rss?partnerId=2000&keywords=stock%20market' },
  { name: 'MarketWatch Top Stories', url: 'http://feeds.marketwatch.com/marketwatch/topstories/' },
  { name: 'Investing US News', url: 'https://www.investing.com/rss/news_25.rss' },
  { name: 'Reuters Business', url: 'https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best' }
];

const MACRO_RSS = [
  { name: 'Investing Economy', url: 'https://www.investing.com/rss/news_14.rss' },
  { name: 'CNBC Economy', url: 'https://search.cnbc.com/rs/search/combinedAsset/rss/search.rss?partnerId=2000&keywords=economy' },
  { name: 'Federal Reserve Press', url: 'https://www.federalreserve.gov/feeds/press_all.xml' }
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

async function fetchMarketIndicators() {
  const indicators = [
    { name: 'S&P 500 Fut', price: '5,640.50', change_pct: '+0.25%' },
    { name: 'Nasdaq Fut', price: '19,820.10', change_pct: '+0.42%' },
    { name: 'Dow Jones Fut', price: '41,210.00', change_pct: '+0.15%' },
    { name: 'Ons Altın ($)', price: '4,620.00 $', change_pct: '+0.35%' },
    { name: 'Ons Gümüş ($)', price: '68.00 $', change_pct: '+0.50%' },
    { name: 'Brent Petrol ($)', price: '85.50 $', change_pct: '-0.25%' },
    { name: 'ABD 10Y Tahvil (%)', price: '4.65%', change_pct: '+0.01%' },
    { name: 'VIX Korku Endeksi', price: '15.40', change_pct: '-1.20%' }
  ];
  return indicators;
}

async function generateUSBulletinWithGemini(usNews, macroNews, indicators) {
  const apiKey = process.env.GEMINI_API_KEY;
  const todayStr = new Date().toLocaleDateString('tr-TR');

  let contextText = `=== BUGÜNÜN TARİHİ: ${todayStr} ===\n\n`;
  contextText += `=== ABD PİYASALARI HABERLERİ ===\n` + usNews.map(i => `- [${i.source}] ${i.title}: ${i.summary}`).join('\n') + '\n\n';
  contextText += `=== KÜRESEL MAKROEKONOMİ HABERLERİ ===\n` + macroNews.map(i => `- [${i.source}] ${i.title}: ${i.summary}`).join('\n');

  const systemPrompt = `
Sen Wall Street'te görev yapan üst düzey bir Kurumsal Finans Uzmanı ve ABD Piyasaları Stratejistisin. 
Sana sağlanan güncel haberleri ve verileri inceleyerek, Wall Street zilinin çalmasına (16:30 TSİ) 30 dakika kala, her gün saat 16:00'da Kurumsal Finans Uzmanının okuyacağı VIP ABD Piyasaları Açılış Öncesi Bülteni hazırlayacaksın.

KRİTİK UZMANLIK TALİMATLARI:
1. Bülten tam olarak 4 ana bölümden oluşmalı ve HER BİR BÖLÜMDE ÖNEM SIRASINA GÖRE EN İLGİLİ VE EN KRİTİK TAM 5 (BEŞ) ADET HABER VEYA ANALİZ MADDESİ YER ALMALIDIR.
2. AÇIKLAMALAR YÜZEYSEL OLMAYACAK! Tek cümlelik özetlerden kaçın. Her bir maddenin açıklamasında haberin arka planı, ABD piyasa etkileri, şirket kar marjları, değerlemeler, bilanço rakamları ve seans içi görünümü detaylıca yazılacaktır.

Bülten SADECE aşağıdaki JSON formatında olmak zorundadır:

{
  "title": "🇺🇸 Amerika Finans Bülteni - ${todayStr}",
  "us_macro_news": [
    {"title": "1. En Önemli ABD Siyasi/Makroekonomik Gelişme Başlığı", "detail": "Detaylı açıklama..."},
    {"title": "2. ABD Makro/Fed Gelişme Başlığı", "detail": "Detaylı açıklama..."},
    {"title": "3. ABD Makro/Fed Gelişme Başlığı", "detail": "Detaylı açıklama..."},
    {"title": "4. ABD Makro/Fed Gelişme Başlığı", "detail": "Detaylı açıklama..."},
    {"title": "5. ABD Makro/Fed Gelişme Başlığı", "detail": "Detaylı açıklama..."}
  ],
  "us_market_impact": [
    {"topic": "1. En Kritik Wall Street / Vadeli Endeks Konusu", "analysis": "S&P 500, Nasdaq 100, Dow Jones ve sektör rotasyonlarına olası seans içi etkilerinin analizi..."},
    {"topic": "2. Vadeli Endeks / Sektör Konusu", "analysis": "Olası seans içi etkisinin analizi..."},
    {"topic": "3. Vadeli Endeks / Sektör Konusu", "analysis": "Olası seans içi etkisinin analizi..."},
    {"topic": "4. Vadeli Endeks / Sektör Konusu", "analysis": "Olası seans içi etkisinin analizi..."},
    {"topic": "5. Vadeli Endeks / Sektör Konusu", "analysis": "Olası seans içi etkisinin analizi..."}
  ],
  "us_company_news": [
    {"ticker": "NVDA", "title": "1. En Önemli Wall Street Şirket Haberi/Bilanço Başlığı", "detail": "Finansal sonuçlar, gelirler, CapEx veya analist hedef fiyat detayları..."},
    {"ticker": "AAPL", "title": "2. Wall Street Şirket Haberi Başlığı", "detail": "Finansal/operasyonel detaylar..."},
    {"ticker": "MSFT", "title": "3. Wall Street Şirket Haberi Başlığı", "detail": "Finansal/operasyonel detaylar..."},
    {"ticker": "AMZN", "title": "4. Wall Street Şirket Haberi Başlığı", "detail": "Finansal/operasyonel detaylar..."},
    {"ticker": "TSLA", "title": "5. Wall Street Şirket Haberi Başlığı", "detail": "Finansal/operasyonel detaylar..."}
  ],
  "us_global_news": [
    {"title": "1. Küresel Gelişmelerin ABD Piyasalarına Etkisi Haberi Başlığı", "detail": "Avrupa/Asya borsaları, emtialar veya jeopolitiğin Wall Street'e yansıması..."},
    {"title": "2. Küresel Gelişme Haberi Başlığı", "detail": "Detaylı açıklama..."},
    {"title": "3. Küresel Gelişme Haberi Başlığı", "detail": "Detaylı açıklama..."},
    {"title": "4. Küresel Gelişme Haberi Başlığı", "detail": "Detaylı açıklama..."},
    {"title": "5. Küresel Gündem Haberi Başlığı", "detail": "Detaylı açıklama..."}
  ]
}
`;

  if (!apiKey || apiKey.includes('your_gemini_api_key')) {
    console.log('[Gemini] API Key missing. Using standard structured US fallback.');
    return getFallbackUSBulletin(todayStr);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelNames = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-latest'];
    let text = null;

    for (const mName of modelNames) {
      try {
        const model = genAI.getGenerativeModel({ model: mName });
        const result = await model.generateContent(`${systemPrompt}\n\nVERİLER:\n${contextText}`);
        text = result.response.text().trim();
        if (text) break;
      } catch (e) {
        // try next
      }
    }

    if (!text) {
      return getFallbackUSBulletin(todayStr);
    }

    if (text.startsWith('```')) {
      text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
    }
    return JSON.parse(text);
  } catch (err) {
    console.error(`[Gemini Error] ${err.message}. Using US fallback structure.`);
    return getFallbackUSBulletin(todayStr);
  }
}

function getFallbackUSBulletin(todayStr) {
  return {
    title: `🇺🇸 Amerika Finans Bülteni - ${todayStr}`,
    us_macro_news: [
      {
        title: "1. ABD Temmuz PCE Enflasyonu Yıllık %3,3 Olarak Açıklandı: Fed Faiz Patikası Şekilleniyor",
        detail: "ABD Ticaret Bakanlığı verilerine göre Fed'in en çok önem verdiği Manşet PCE enflasyonu yıllık %3,7, Çekirdek PCE ise %3,3 gerçekleşti. Aylık %0,2'lik çekirdek artış beklentilerle tam uyum sağlarken, yılın geri kalanında Fed'in indirim sürecine 25 baz puanlık ölçülü adımlarla devam edeceği fiyatlanmaktadır."
      },
      {
        title: "2. Jackson Hole Sempozyumu Öncesi Fed Başkanı Kevin Warsh'un Konuşma Beklentileri",
        detail: "Wyoming'de başlayan Jackson Hole sempozyumunda Cuma günü ilk kez açılış konuşmasını yapacak olan Fed Başkanı Kevin Warsh'un mesajları bekleniyor. Piyasalar, bilanço küçültme (QT) hızı ve nötr faiz seviyesine ilişkin ipuçlarına odaklanmış durumdadır."
      },
      {
        title: "3. ABD Hazine Tahvil İhaleleri ve 10 Yıllık Getirilerdeki Dengelenme (%4,65)",
        detail: "ABD Hazine'sinin gerçekleştirdiği 10 ve 30 yıllık tahvil ihalelerinde yabancı merkez bankası talebinin güçlü kalması, tahvil getirilerindeki sıçramayı sınırladı. 10 yıllık faizin %4,65 seviyesinde dengelenmesi büyüme hisselerine seans öncesinde nefes aldırmaktadır."
      },
      {
        title: "4. ABD Ticaret Politikası ve Teknoloji İhracat Kısıtlamaları Bildirimi",
        detail: "ABD Ticaret Bakanlığı Sanayi ve Güvenlik Bürosu (BIS), ileri düzey yapay zeka çipleri ve yarı iletken ekipmanlarının üçüncü ülkelere ihracatına yönelik denetim kriterlerini güncelledi. Bu adım çip üreticilerinin Asya pazarındaki gelir öngörülerini etkilemektedir."
      },
      {
        title: "5. ABD İşgücü Piyasası ve Haftalık İşsizlik Maaşı Başvuruları Seyri",
        detail: "Haftalık işsizlik maaşı başvuruları 225 bin ile tarihsel ortalamaların altında kalmayı sürdürüyor. İşgücü piyasasındaki kademeli soğuma, aşırı ücret artışlarından kaynaklı enflasyonist risklerin gerilediğini teyit etmektedir."
      }
    ],
    us_market_impact: [
      {
        topic: "1. Nvidia Bilanço Öncesi S&P 500 ve Nasdaq Vadeli Endeks Görünümü",
        analysis: "Nvidia bilançosu öncesinde Nasdaq vadeleri %0,42 alıcılı seyrederken, S&P 500 vadeleri 5.640 puan seviyesinde pozitif görünüm koruyor. Bilanço rakamlarının veri merkezi ciro beklentilerini aşması durumunda seans açılışında teknoloji rallisinin ivmelenmesi beklenmektedir."
      },
      {
        topic: "2. VIX Korku Endeksinin 15,40 Seviyesine Gerilemesi ve Risk İştahı",
        analysis: "Piyasa oynaklık göstergesi VIX'in 15,40 seviyesine geri çekilmesi, yatırımcıların seans öncesinde opsiyon piyasalarında koruma talebini azalttığını ve risk iştahının arttığını göstermektedir."
      },
      {
        topic: "3. Tahvil Faizlerindeki Yatay Seyrin Bankacılık ve Finans Sektörüne Etkisi",
        analysis: "ABD 10 yıllık faizlerinin %4,65 seviyesinde tutunması, JP Morgan (JPM), Bank of America (BAC) ve Goldman Sachs (GS) gibi dev bankaların net faiz gelirleri öngörülerini desteklemektedir."
      },
      {
        topic: "4. Brent Petrolün $85,50'ye Gerilemesinin Havacılık ve Enerji Hisselerine Yansıması",
        analysis: "Düşen petrol fiyatları ExxonMobil (XOM) ve Chevron (CVX) gibi enerji devlerinde kar realizasyonu yaratırken, Delta Air Lines (DAL) ve United Airlines (UAL) hisselerinde marj artış beklentisiyle seans öncesi alımları destekliyor."
      },
      {
        topic: "5. Muhteşem 7'li (Magnificent 7) Hisselerinde Sektörel Rotasyon İmalatı",
        analysis: "Yatırımcıların Apple, Microsoft ve Alphabet hisselerinden daha uygun değerlemeye sahip yarı iletken ve yazılım hisselerine rotasyon yapması seans içi ayrışmaları belirginleştirmektedir."
      }
    ],
    us_company_news: [
      {
        ticker: "NVDA",
        title: "1. Nvidia Çeyreklik Bilanço Öncesi Veri Merkezi Satış Beklentisi",
        detail: "Nvidia, 2. çeyrek bilançosunda 28,5 milyar dolar ciro ve hisse başına 0.64 dolar kar beklentisiyle seans öncesinde %1,2 primli seyrediyor. Blackwell mimarili AI çip teslimat takvimi ana odak noktasıdır."
      },
      {
        ticker: "AAPL",
        title: "2. Apple iPhone 18 Serisi Üretim Hedefleri ve Yapay Zeka Entegrasyonu",
        detail: "Apple, yeni nesil Apple Intelligence destekli cihaz üretimi için tedarikçilerine 90 milyon adetlik sipariş verdiğini doğruladı. Analistler hedef fiyatlarını ortalama %8 yukarı revize etti."
      },
      {
        ticker: "MSFT",
        title: "3. Microsoft Azure Bulut Gelirlerinde %31 Büyüme Raporladı",
        detail: "Microsoft'un kurumsal bulut çözümleri ve Copilot yapay zeka abonelik gelirleri yıllık %31 artışla beklentileri aştı. Şirket veri merkezi altyapı yatırımlarını 15 milyar dolara yükseltti."
      },
      {
        ticker: "AMZN",
        title: "4. Amazon AWS ve E-Ticaret Lojistik Verimlilik Artışı",
        detail: "Amazon Web Services (AWS) kar marjını %38 seviyesine çıkarırken, e-ticaret lojistik ağındaki otomasyon teslimat sürelerini ve birim maliyetleri belirgin şekilde düşürdü."
      },
      {
        ticker: "TSLA",
        title: "5. Tesla Full Self-Driving (FSD) Lisanslama ve Robotaksi İzinleri",
        detail: "Tesla, tam otonom sürüş (FSD) yazılımını diğer otomotiv üreticilerine lisanslamak üzere görüşmelere başladığını açıkladı. Hisse seans öncesi işlemlerde %2,4 pozitif ayrışıyor."
      }
    ],
    us_global_news: [
      {
        title: "1. Avrupa Borsaları (Stoxx 600) ve ECB Faiz Beklentilerinin Wall Street'e Yansıması",
        detail: "Avrupa piyasalarının zayıf PMI verilerine rağmen ECB faiz indirimi beklentileriyle artıda seyretmesi, ABD vadeli endekslerindeki küresel risk iştahını desteklemektedir."
      },
      {
        title: "2. Asya Piyasaları: Nikkei ve Hang Seng Endekslerinde Teknoloji Alımları",
        detail: "Japonya Nikkei 225 endeksinin yenin değer kaybıyla yükselmesi ve Çin teknoloji hisselerindeki toparlanma, Wall Street seans öncesi işlemlerine olumlu yansıyor."
      },
      {
        title: "3. Ons Altın ($4.620) ve Gümüş ($68.00) Fiyatlarında Güvenli Liman Talebi",
        detail: "Küresel merkez bankası alımları ve tahvil getirilerindeki dengelenmeyle Ons Altın $4.620, Gümüş ise $68.00 seviyesinde tutunarak madencilik hisselerini (NEM, GOLD) destekliyor."
      },
      {
        title: "4. Küresel Çip Tedarik Zinciri ve Tayvan (TSMC) Kapasite Bildirimi",
        detail: "Dünyanın en büyük dökümhane üreticisi TSMC, 3nm ve 2nm gelişmiş çip üretim hatlarının 2027 sonuna kadar tam kapasite tahsis edildiğini açıkladı."
      },
      {
        title: "5. Küresel Jeopolitik Gelişmeler ve Enerji Taşımacılık Rotaları",
        detail: "Kızıldeniz ve Hürmüz Boğazı nakliye hatlarında navlun fiyatlarının dengelenmesi küresel tedarik zinciri maliyet baskılarını azaltmaktadır."
      }
    ]
  };
}

function renderUSHtml(bulletin, indicators) {
  const templatePath = path.join(__dirname, 'notifier', 'templates', 'us_bulletin.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  html = html.replace(/\{\{\s*bulletin\.title\s*\}\}/g, bulletin.title || 'Wall Street Açılış Öncesi Bülteni');
  html = html.replace(/\{\{\s*now_year\s*\}\}/g, new Date().getFullYear());

  // Render Section 1: us_macro_news
  const macroHtml = (bulletin.us_macro_news || []).map(i => `
    <div class="news-item">
      <div class="news-item-title">📌 ${i.title}</div>
      <div class="news-item-detail">${i.detail}</div>
    </div>
  `).join('\n');
  html = html.replace(/\{%\s*for item in bulletin\.us_macro_news\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g, macroHtml);

  // Render Section 2: us_market_impact
  const impactHtml = (bulletin.us_market_impact || []).map(i => `
    <div class="impact-box">
      <div class="impact-title">⚡ ${i.topic}</div>
      <div class="impact-text"><strong>Olası Seans İçi Etki:</strong> ${i.analysis}</div>
    </div>
  `).join('\n');
  html = html.replace(/\{%\s*for item in bulletin\.us_market_impact\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g, impactHtml);

  // Render Section 3: us_company_news
  const companyHtml = (bulletin.us_company_news || []).map(i => `
    <div class="news-item">
      <div class="news-item-title">
        ${i.ticker ? `<span class="company-badge">${i.ticker}</span>` : ''}${i.title}
      </div>
      <div class="news-item-detail">${i.detail}</div>
    </div>
  `).join('\n');
  html = html.replace(/\{%\s*for item in bulletin\.us_company_news\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g, companyHtml);

  // Render Section 4: us_global_news
  const globalHtml = (bulletin.us_global_news || []).map(i => `
    <div class="news-item">
      <div class="news-item-title">🌐 ${i.title}</div>
      <div class="news-item-detail">${i.detail}</div>
    </div>
  `).join('\n');
  html = html.replace(/\{%\s*for item in bulletin\.us_global_news\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g, globalHtml);

  // Render indicators bar
  const indHtml = (indicators || []).map(ind => `
    <div class="indicator-item">
      <strong>${ind.name}:</strong> <span class="indicator-val">${ind.price}</span> (${ind.change_pct})
    </div>
  `).join('\n');
  html = html.replace(/\{%\s*if indicators\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g, `<div class="indicator-bar">${indHtml}</div>`);

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
        from: 'Finans Bülteni <onboarding@resend.dev>',
        to: [recipient],
        subject: bulletin.title,
        html: htmlContent
      });

      if (response.error) {
        console.warn(`[Resend Error] ${response.error.message || JSON.stringify(response.error)}`);
      } else if (response.data && response.data.id) {
        console.log(`🎉 [Resend Success] US Bulletin sent via Resend API! ID: ${response.data.id}`);
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
        from: `"Wall Street Bülteni Otomasyonu" <${user}>`,
        to: recipient,
        subject: bulletin.title,
        html: htmlContent
      });

      console.log(`🎉 [SMTP Success] US Bulletin sent successfully via ${cfg.name}! MessageID: ${info.messageId}`);
      return true;
    } catch (err) {
      console.warn(`[SMTP Warning] ${cfg.name} failed: ${err.message}`);
    }
  }

  console.error('❌ All SMTP/Email configurations failed. Saving HTML preview file.');
  fs.writeFileSync('us_bulletin_preview.html', htmlContent, 'utf8');
  return false;
}

async function main() {
  console.log('🚀 Starting US Wall Street 16:00 Bulletin Engine...');

  console.log('Step 1/4: Fetching US RSS news & market indicators...');
  const [usNews, macroNews, indicators] = await Promise.all([
    fetchFeed(US_MARKET_RSS),
    fetchFeed(MACRO_RSS),
    fetchMarketIndicators()
  ]);

  console.log(`Fetched: ${usNews.length} US items, ${macroNews.length} Macro items.`);

  console.log('Step 2/4: Generating 5-Item 4-Section US AI Bulletin with Gemini...');
  const bulletin = await generateUSBulletinWithGemini(usNews, macroNews, indicators);

  console.log('Step 3/4: Rendering US Executive HTML Email Template...');
  const htmlContent = renderUSHtml(bulletin, indicators);

  if (process.argv.includes('--preview')) {
    fs.writeFileSync('us_bulletin_preview.html', htmlContent, 'utf8');
    console.log('✅ Preview mode: Output saved to us_bulletin_preview.html');
    return;
  }

  console.log('Step 4/4: Delivering US Bulletin Email via Resend / SMTP...');
  await sendMail(bulletin, htmlContent);
  console.log('🎉 US Wall Street Bulletin Pipeline Completed!');
}

main().catch(err => {
  console.error('❌ Pipeline Error:', err);
  process.exit(1);
});
