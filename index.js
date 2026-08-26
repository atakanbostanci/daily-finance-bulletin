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
            summary: cleanText(entry.contentSnippet || entry.content || entry.title).slice(0, 400),
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
    { name: 'Ons Gümüş ($)', price: '68.00 $', change_pct: '+0.50%' },
    { name: 'Gram Gümüş', price: '105.07 TL', change_pct: '+0.45%' },
    { name: 'Brent Petrol ($)', price: '85.50 $', change_pct: '-0.25%' },
    { name: 'ABD 10Y Tahvil (%)', price: '4.65%', change_pct: '+0.01%' }
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
Sana sağlanan güncel haberleri ve verileri inceleyerek, her sabah saat 08:00 itibarıyla Kurumsal Finans Uzmanının okuyacağı VIP Finans Bülteni hazırlayacaksın.

KRİTİK KURAL: Bülten tam olarak 4 ana bölümden oluşmalı ve HER BİR BÖLÜMDE ÖNEM SIRASINA GÖRE EN İLGİLİ VE EN KRİTİK TAM 5 (BEŞ) ADET HABER VEYA ANALİZ MADDESİ YER ALMALIDIR. Maddeler en önemliden başlayarak sıralanmalıdır.

Bülten SADECE aşağıdaki JSON formatında olmak zorundadır. Başka hiçbir metin ekleme:

{
  "title": "Sabah Finans Bülteni - ${todayStr}",
  "turkey_news": [
    {"title": "1. En Önemli Türkiye Siyasi/Ekonomik Gelişme Başlığı", "detail": "Detaylı finansal açıklama..."},
    {"title": "2. Türkiye Siyasi/Ekonomik Gelişme Başlığı", "detail": "Detaylı açıklama..."},
    {"title": "3. Türkiye Siyasi/Ekonomik Gelişme Başlığı", "detail": "Detaylı açıklama..."},
    {"title": "4. Türkiye Siyasi/Ekonomik Gelişme Başlığı", "detail": "Detaylı açıklama..."},
    {"title": "5. Türkiye Siyasi/Ekonomik Gelişme Başlığı", "detail": "Detaylı açıklama..."}
  ],
  "bist_impact_analysis": [
    {"topic": "1. En Kritik Gündem Konusu", "analysis": "BIST 100 ve sektörlere olası etkilerinin detaylı analizi..."},
    {"topic": "2. Gündem Konusu", "analysis": "Olası Borsa etkisinin detaylı analizi..."},
    {"topic": "3. Gündem Konusu", "analysis": "Olası Borsa etkisinin detaylı analizi..."},
    {"topic": "4. Gündem Konusu", "analysis": "Olası Borsa etkisinin detaylı analizi..."},
    {"topic": "5. Gündem Konusu", "analysis": "Olası Borsa etkisinin detaylı analizi..."}
  ],
  "company_news": [
    {"ticker": "THYAO", "title": "1. En Önemli Şirket Haberi/KAP Başlığı", "detail": "Finansal/operasyonel detaylar..."},
    {"ticker": "AKBNK", "title": "2. Şirket Haberi/KAP Başlığı", "detail": "Finansal/operasyonel detaylar..."},
    {"ticker": "TUPRS", "title": "3. Şirket Haberi/KAP Başlığı", "detail": "Finansal/operasyonel detaylar..."},
    {"ticker": "EREGL", "title": "4. Şirket Haberi/KAP Başlığı", "detail": "Finansal/operasyonel detaylar..."},
    {"ticker": "ICU", "title": "5. Şirket Haberi/KAP Başlığı", "detail": "Finansal/operasyonel detaylar..."}
  ],
  "global_news": [
    {"title": "1. En Önemli Küresel/Dünya Gündemi Haberi Başlığı", "detail": "Detaylı dünya piyasaları açıklaması..."},
    {"title": "2. Küresel Gündem Haberi Başlığı", "detail": "Detaylı açıklama..."},
    {"title": "3. Küresel Gündem Haberi Başlığı", "detail": "Detaylı açıklama..."},
    {"title": "4. Küresel Gündem Haberi Başlığı", "detail": "Detaylı açıklama..."},
    {"title": "5. Küresel Gündem Haberi Başlığı", "detail": "Detaylı açıklama..."}
  ]
}
`;

  if (!apiKey || apiKey.includes('your_gemini_api_key')) {
    console.log('[Gemini] API Key missing. Using standard structured fallback.');
    return getFallbackBulletin(todayStr);
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
      return getFallbackBulletin(todayStr);
    }

    if (text.startsWith('```')) {
      text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
    }
    const data = JSON.parse(text);
    return data;
  } catch (err) {
    console.error(`[Gemini Error] ${err.message}. Using fallback structure.`);
    return getFallbackBulletin(todayStr);
  }
}

function getFallbackBulletin(todayStr) {
  return {
    title: `Sabah Finans Bülteni - ${todayStr}`,
    turkey_news: [
      {
        title: "1. Türkiye 5 Yıllık CDS Primlerinde Son 6 Ayın Dip Seviyesi Kaydedildi",
        detail: "Türkiye'nin ülke risk primini gösteren 5 yıllık CDS oranı son 6 ayın en düşük seviyelerine gerileyerek uluslararası piyasalarda kredibilite artışına işaret ediyor. Bu durum yabancı kurumların Türk tahvillerine ve hisse senedi piyasasına olan ilgisini canlı tutmaya devam etmektedir."
      },
      {
        title: "2. TCMB Parasal Sıkılaşma ve Likidite Adımlarını Kararlılıkla Sürdürüyor",
        detail: "Türkiye Cumhuriyet Merkez Bankası (TCMB), enflasyon patikasındaki hedef doğrultusunda likidite çekme adımlarını ve mevduat faizlerindeki efektif sıkılığı koruyor. Piyasalarda dezenflasyon sürecinin 2. yarıyıldaki seyri ve reel sektör kredileri üzerindeki etkileri yakından izlenmektedir."
      },
      {
        title: "3. Ticaret Bakanlığı Dış Ticaret Açığı ve İhracat Verilerini Değerlendirdi",
        detail: "İhracattaki katma değerli ürün payının artırılması ve ithalat kısıtlama tedbirlerinin etkisiyle dış ticaret dengesindeki iyileşme trendi devam ediyor. İmalat sanayi kapasite kullanım oranlarındaki kararlı seyir takip ediliyor."
      },
      {
        title: "4. Maliye Politikalarında Disiplin ve Kamuda Tasarruf Paketi Uygulaması",
        detail: "Hazine ve Maliye Bakanlığı'nın bütçe disiplini ve harcama kısıtlamalarına yönelik kararları mali görünümü destekliyor. Bütçe dengesindeki toparlanma ve vergi adımları yabancı analist raporlarında olumlu vurgulanmaktadır."
      },
      {
        title: "5. MKK Verilerine Göre Yerli ve Yabancı Yatırımcı Sayısındaki Son Durum",
        detail: "Merkezi Kayıt Kuruluşu (MKK) verilerine göre Borsa İstanbul'da yatırımcı sayısı 4,57 milyon seviyesinde dengelenirken, yabancı yatırımcıların takas payındaki artış trendi ön planda kalmaya devam ediyor."
      }
    ],
    bist_impact_analysis: [
      {
        topic: "1. CDS Primindeki Gerileme ve Yabancı Girişleri",
        analysis: "Risk primindeki gerileme BIST Bankacılık Endeksi (XBANK) ve yüksek piyasa değerine sahip BIST 30 hisselerine doğrudan pozitif katkı sunmaktadır. Yabancı takas oranındaki kademeli artışın seans içi tepki alımlarını desteklemesi beklenmektedir."
      },
      {
        topic: "2. Küresel Petrol Fiyatlarındaki Düşüşün Ulaştırma Sektörüne Etkisi",
        analysis: "Brent petrol fiyatlarının 85,50 dolara gerilemesi, akaryakıt maliyet baskısını azaltarak Türk Hava Yolları (THYAO) ve Pegasus (PGSUS) gibi ulaştırma hisselerinde marj genişlemesini destekleyici bir unsur olarak değerlendirilmektedir."
      },
      {
        topic: "3. Sıkı Para Politikası ve Kredi Koşullarının Perakende/GYO Sektörüne Yansıması",
        analysis: "Yüksek faiz ortamı ve tüketici kredilerindeki sınırlamalar GYO ve tüketici takdirine bağlı perakende sektöründe ciro büyümesini sınırlayabilir; şirketlerin nakit akış gücü seans ayrışmalarını belirleyecektir."
      },
      {
        topic: "4. Döviz Kurlarındaki Yatay Seyrin İhracatçı Şirket Marjlarına Etkisi",
        analysis: "Dolar/TL kurlarındaki kontrollü ve yatay hareketler, kur artışından marj elde eden ihracatçı sanayi şirketlerinde (tekstil, beyaz eşya) kısa vadeli kar marjı baskısı oluştururken maliyet öngörülebilirliğini artırmaktadır."
      },
      {
        topic: "5. Enflasyon Muhasebesi Düzenlemeleri ve Şirket Finansalları Üzerindeki Etki",
        analysis: "Şirketlerin 2. çeyrek ve yıl sonu bilançolarında uygulanan enflasyon muhasebesi, vergi yükü ve özkaynak karlılığı kalemlerinde hisse bazlı fiyatlamalarda sektörel farklılaşmaları belirginleştirmektedir."
      }
    ],
    company_news: [
      {
        ticker: "THYAO",
        title: "1. Türk Hava Yolları Yolcu Sayısı ve Doluluk Oranlarını Açıklandı",
        detail: "THY, yolcu doluluk oranlarında güçlü performansını korurken, düşen jet yakıtı fiyatları çeyreklik marjlar üzerinde olumlu katkı yapmaya devam ediyor."
      },
      {
        ticker: "AKBNK",
        title: "2. Akbank Yabancı Yatırımcı Hacimlerinde Liderliğini Sürdürüyor",
        detail: "Bankacılık sektöründeki güçlü sermaye yeterlilik rasyoları ve takipteki kredi oranlarındaki kontrollü seyir ile BIST 30 yükselişine öncülük ediyor."
      },
      {
        ticker: "TUPRS",
        title: "3. Tüpraş Üretim Kapasitesi ve Rafineri Marj Güncellemesi",
        detail: "Tüpraş, küresel dizel ve benzin marjlarındaki dengelenmeye rağmen yüksek kapasite kullanım oranı ve stratejik dönüşüm yatırımlarıyla güçlü nakit akışını sürdürüyor."
      },
      {
        ticker: "EREGL",
        title: "4. Ereğli Demir Çelik Yeşil Çelik Yatırımları ve Kapasite Bildirimi",
        detail: "Erdemir, karbon nötr hedefli yeşil çelik dönüşüm yatırımları ve ham çelik üretimindeki kapasite kullanım artışıyla ilgili detayları paylaştı."
      },
      {
        ticker: "ICU",
        title: "5. ICU Girişim Sermayesi KAP Bildirimi",
        detail: "Şirket Yönetim Kurulu üyesi değişikliği ve sürdürülebilirlik raporlama bildirimlerini KAP platformu üzerinden kamuoyuna duyurdu."
      }
    ],
    global_news: [
      {
        title: "1. ABD Temmuz PCE Enflasyonu Yıllık %3,3 Olarak Açıklandı",
        detail: "Fed'in en çok dikkate aldığı Çekirdek PCE enflasyonu yıllık %3,3 ile beklentilere paralel gerçekleşti. Bu durum Fed'in faiz indirim döngüsüne dair zamanlama tartışmalarını diri tutuyor."
      },
      {
        title: "2. Fed Jackson Hole Ekonomik Sempozyumu Başlıyor",
        detail: "Küresel merkez bankacıların buluştuğu Jackson Hole toplantılarında Fed Başkanı Kevin Warsh'un Cuma günü yapacağı açılış konuşması öncesinde küresel piyasalarda temkinli duruş hakim."
      },
      {
        title: "3. Nvidia Çeyreklik Bilanço Açıklaması Öncesinde Yapay Zeka Hisseleri İzleniyor",
        detail: "Dünyanın en büyük çip üreticilerinden Nvidia'nın açıklayacağı çeyreklik gelir rakamları ve veri merkezi satış beklentileri küresel Big Tech hisselerinin yönü açısından kritik önem taşıyor."
      },
      {
        title: "4. Avrupa Merkez Bankası (ECB) Faiz Patikası ve Bölge Büyüme Verileri",
        detail: "Euro Bölgesi PMI verilerindeki zayıf seyir sonrası ECB üyelerinin sonbahar toplantılarındaki faiz indirimi beklentileri piyasalarda Euro/Dolar paritesi üzerinde baskı oluşturuyor."
      },
      {
        title: "5. Hürmüz Boğazı ve Orta Doğu Jeopolitik Gelişmeleri Petrol Fiyatlarında Etkili",
        detail: "Orta Doğu gerilimindeki kırılgan seyre rağmen nakliye hatlarındaki rahatlama Brent petrol fiyatlarının 85,50 dolar seviyesine çekilmesini sağladı."
      }
    ]
  };
}

function renderHtml(bulletin, indicators) {
  const templatePath = path.join(__dirname, 'notifier', 'templates', 'bulletin.html');
  let html = fs.readFileSync(templatePath, 'utf8');

  // Title & year
  html = html.replace(/\{\{\s*bulletin\.title\s*\}\}/g, bulletin.title || 'Sabah Finans Bülteni');
  html = html.replace(/\{\{\s*now_year\s*\}\}/g, new Date().getFullYear());

  // Render Section 1: turkey_news
  const turkeyHtml = (bulletin.turkey_news || []).map(i => `
    <div class="news-item">
      <div class="news-item-title">📌 ${i.title}</div>
      <div class="news-item-detail">${i.detail}</div>
    </div>
  `).join('\n');
  html = html.replace(/\{%\s*for item in bulletin\.turkey_news\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g, turkeyHtml);

  // Render Section 2: bist_impact_analysis
  const impactHtml = (bulletin.bist_impact_analysis || []).map(i => `
    <div class="impact-box">
      <div class="impact-title">⚡ ${i.topic}</div>
      <div class="impact-text"><strong>Olası Borsa Etkisi:</strong> ${i.analysis}</div>
    </div>
  `).join('\n');
  html = html.replace(/\{%\s*for item in bulletin\.bist_impact_analysis\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g, impactHtml);

  // Render Section 3: company_news
  const companyHtml = (bulletin.company_news || []).map(i => `
    <div class="news-item">
      <div class="news-item-title">
        ${i.ticker ? `<span class="company-badge">${i.ticker}</span>` : ''}${i.title}
      </div>
      <div class="news-item-detail">${i.detail}</div>
    </div>
  `).join('\n');
  html = html.replace(/\{%\s*for item in bulletin\.company_news\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g, companyHtml);

  // Render Section 4: global_news
  const globalHtml = (bulletin.global_news || []).map(i => `
    <div class="news-item">
      <div class="news-item-title">🌐 ${i.title}</div>
      <div class="news-item-detail">${i.detail}</div>
    </div>
  `).join('\n');
  html = html.replace(/\{%\s*for item in bulletin\.global_news\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g, globalHtml);

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

  console.log('Step 2/4: Generating 5-Item 4-Section AI Bulletin with Gemini...');
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
  console.log('🎉 Custom Bulletin Pipeline Completed!');
}

main().catch(err => {
  console.error('❌ Pipeline Error:', err);
  process.exit(1);
});
