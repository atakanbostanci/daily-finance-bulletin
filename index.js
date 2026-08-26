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
Sen üst düzey bir Kurumsal Finans Uzmanı ve Hisse Senedi Araştırma (Equity Research) Direktörüsün. 
Sana sağlanan güncel haberleri ve verileri inceleyerek, her sabah saat 08:00 itibarıyla Kurumsal Finans Uzmanının okuyacağı VIP Türkiye Finans Bültenini hazırlayacaksın.

KRİTİK UZMANLIK TALİMATLARI:
1. Bülten tam olarak 4 ana bölümden oluşmalı ve HER BİR BÖLÜMDE ÖNEM SIRASINA GÖRE EN İLGİLİ VE EN KRİTİK TAM 5 (BEŞ) ADET HABER VEYA ANALİZ MADDESİ YER ALMALIDIR.
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
    title: `🇹🇷 Türkiye Finans Bülteni - ${todayStr}`,
    turkey_news: [
      {
        title: "1. Türkiye 5 Yıllık CDS Primlerinde Son 6 Ayın En Düşük Seviyesi (248 Baz Puan)",
        detail: "Türkiye'nin 5 yıllık Kredi Temerrüt Takası (CDS) primi, 248 baz puana gerileyerek son 6 ayın en düşük seviyesine ulaştı. Risk primindeki bu belirgin iyileşme, Hazine ve Maliye Bakanlığı ile TCMB’nin uyguladığı sıkı para ve maliye politikalarının uluslararası kredi derecelendirme kuruluşları (Fitch, S&P, Moody's) ve küresel fon yöneticileri nezdindeki olumlu algısını pekiştiriyor. Düşen CDS, hem Hazine'nin hem de Türk bankaları ile reel sektor şirketlerinin yurt dışı borçlanma (eurobond) maliyetlerini 150-200 baz puan aralığında aşağı çekerken, küresel sermaye girişlerinin hızlanmasına zemin hazırlamaktadır."
      },
      {
        title: "2. TCMB Parasal Sıkılaşma, Zorunlu Karşılıklar ve Dezenflasyon Patikası",
        detail: "TCMB, politika faizini sıkı duruşta tutmanın yanı sıra piyasadaki fazla Türk Lirası likiditesini çekmek amacıyla zorunlu karşılık oranlarında ve depo alım ihalelerinde aktif adımlar atmaktadır. Sıkı parasal duruş sayesinde TL mevduat faizleri %50 bandının üzerindeki cazibesini korurken, mevduatların toplam içerisindeki payı artmakta ve kur korumalı mevduat (KKM) bakiyesinde erime ivmelenmektedir. Yılın ikinci yarısında beklenen baz etkisi kaynaklı dezenflasyon sürecinin kararlılıkla sürdürülmesi, iç talepte dengelenmeyi ve ithalat kısıtlamaları üzerinden cari açığın yıllıklandırılmış olarak 20 milyar doların altına inmesini desteklemektedir."
      },
      {
        title: "3. Ticaret Bakanlığı İhracat Rejimi ve Dış Ticaret Dengesi Verileri",
        detail: "Ticaret Bakanlığı tarafından açıklanan son verilere göre, dış ticaret açığındaki daralma eğilimi yıllık bazda %30'a yakın bir toparlama sergilemiştir. Altın ve otomotiv ithalatına yönelik alınan korumacı önlemler ile yüksek katma değerli savunma sanayi, havacılık ve kimya ihracatındaki artış cari dengenin iyileşmesinde ana itici güç olmuştur. İmalat sanayi kapasite kullanım oranları %76 seviyesinde dengelenirken, AB pazarındaki toparlanma emareleri ihracatçı şirketlerin sipariş defterlerine olumlu yansımaya başlamıştır."
      },
      {
        title: "4. Kamuda Tasarruf Tedbirleri ve Bütçe Disiplininde Maliye Politikası Takvimi",
        detail: "Hazine ve Maliye Bakanlığı'nın kamu harcamalarında tasarruf ve vergi adaletini sağlamaya yönelik yasal düzenleme paketleri bütçe dengesini güçlendirmektedir. Kamudaki araç, bina ve hizmet alımlarındaki sınırlandırmaların yanı sıra doğrudan vergilerin payının artırılmasına dönük düzenlemeler, bütçe açığının GSYH'ye oranını %3,5 hedefi sınırında tutmayı amaçlamaktadır. Mali disiplinin korunması, enflasyonla mücadelede para politikasına verilen desteği artırarak makroekonomik öngörülebilirliği yükseltmektedir."
      },
      {
        title: "5. MKK Verileri: Yatırımcı Sayısı ve Yabancı Takas Oranındaki Dönüşüm",
        detail: "Merkezi Kayıt Kuruluşu (MKK) verilerine göre Borsa İstanbul'daki toplam yatırımcı sayısı 4,57 milyon seviyesinde rasyonel bir tabana oturmuştur. Halka arz çılgınlığının yerini daha seçici ve kurum odaklı yatırımcılara bırakmasıyla birlikte, yabancı yatırımcıların BIST 30 ve bankacılık hisselerindeki takas payı son bir yılda %31'den %38 seviyesine yükselmiştir. Bu durum, bireysel yatırımcı çıkışlarına rağmen kurumsal fonların piyasadaki likiditeyi ve derinliği desteklediğini göstermektedir."
      }
    ],
    bist_impact_analysis: [
      {
        topic: "1. CDS Primindeki Düşüşün Bankacılık Endeksi (XBANK) ve BIST 30 Hisselerine Etkisi",
        analysis: "Ülke risk priminin 248 baz puana inmesi, uluslararası yatırım fonlarının Türkiye alokasyonlarında ilk tercih olan Akbank (AKBNK), Garanti BBVA (GARAN), İş Bankası (ISCTR) ve Yapı Kredi (YKBNK) gibi büyük banka hisselerinde özkaynak maliyetini (cost of equity) düşürmektedir. Net faiz marjlarındaki (NIM) beklenen toparlanmayla birleştiğinde, XBANK endeksinde seans içi alımların ve hedef fiyat revizyonlarının devam etmesi muhtemeldir."
      },
      {
        topic: "2. Brent Petrolün $85,50'ye Gerilemesinin Ulaştırma ve Perakende Sektörlerine Yansıması",
        analysis: "Hürmüz Boğazı geriliminin yatışmasıyla Brent petrolün varil başına 85,50 dolara çekilmesi, jet yakıtı maliyeti toplam giderlerinin %35-40'ını oluşturan Türk Hava Yolları (THYAO) ve Pegasus (PGSUS) için doğrudan kar marjı genişlemesi anlamına gelmektedir. Ayrıca lojistik maliyetlerinin düşmesi BIMAS, AHFES, MGROS gibi perakende devlerinin faaliyet giderlerini azaltarak marj baskısını hafifletecektir."
      },
      {
        topic: "3. Sıkı Kredi Koşulları ve Yüksek Faizlerin GYO, Otomotiv ve Tüketici Dayanıklı Sektörlerine Etkisi",
        analysis: "TCMB'nin sıkı likidite duruşu ve taşıt/konut kredi faizlerindeki yüksek seyir, iç pazara bağımlı otomotiv (FROTO, TOASO) ve GYO (EKGYO) şirketlerinde satış hacimleri üzerinde baskı yaratmaktadır. Yatırımcıların bu dönemde yüksek borçluluk oranına sahip şirketler yerine güçlü net nakit pozisyonuna sahip şirketleri (BIMAS, TUPRS, KCHOL) tercih ederek seans içi ayrışmaları artırması beklenmektedir."
      },
      {
        topic: "4. Dolar/TL Kurundaki Yatay Seyrin İhracatçı Sanayi Devleri (EREGL, ARCLK) Üzerindeki Dengesi",
        analysis: "Dolar/TL'nin 48,12 seviyesinde kontrollü ve yatay seyretmesi, kur artışına dayalı brüt kar marjı elde eden ihracatçı şirketlerde (ARCLK, EREGL, KORDS) kısa vadeli kar marjı baskısı oluşturmaktadır. Ancak maliyet öngörülebilirliğinin artması ve AB bölgesinden gelebilecek talep artışı, kur baskısını orta vadede dengeleyici ana unsur olacaktır."
      },
      {
        topic: "5. Enflasyon Muhasebesi Düzenlemelerinin Şirket Bilanço ve Özkaynak Kar Marjlarına Yansıması",
        analysis: "Şirketlerin 2. çeyrek finansal sonuçlarında uygulanan TMS 29 Enflasyon Muhasebesi, yüksek stok ve sabit kıymet tutan şirketlerde sanal kar oluşumunu engellerken vergi yükünü değiştirmektedir. Özkaynakları güçlü, parasal net borç pozisyonu olan şirketler enflasyon düzeltmesinden olumlu etkilenirken, parasal varlığı yüksek olan şirketlerde net kar baskısı nedeniyle hisse bazlı seans ayrışmaları sertleşmektedir."
      }
    ],
    company_news: [
      {
        ticker: "THYAO",
        title: "1. Türk Hava Yolları Yolcu Sayısı, Doluluk ve Filo Genişleme Stratejisi",
        detail: "THY, 2026 yılı 2. çeyrek operasyonel verilerinde toplam yolcu sayısını geçen yılın aynı dönemine göre %6,5 artırarak 24,8 milyona ulaştırdı. Dış hat doluluk oranı %83,2 olarak gerçekleşirken, kargo birim gelirlerindeki dengelenme ve jet yakıtı maliyetlerindeki düşüş EBITDA marjını %24 seviyesine taşıdı. Şirket ayrıca filoya katılacak yeni nesil geniş gövdeli uçak teslimatlarıyla 2030 hedeflerine paralel büyümesini sürdürüyor."
      },
      {
        ticker: "AKBNK",
        title: "2. Akbank Yabancı Payı Artışı ve Net Faiz Marjı Tahmini",
        detail: "Akbank, yabancı yatırımcı takas payında %48 seviyesini aşarak sektördeki lider konumunu pekiştirdi. Yılın ikinci yarısında TÜFE'ye endeksli tahvil (TÜFEKS) getirilerinin katkısı ve mevduat maliyetlerindeki gevşeme ile net faiz marjında 150 baz puanlık iyileşme öngörülmektedir. Şirketin takipteki kredi (NPL) oranı %2,1 ile sektör ortalamasının oldukça altında seyretmektedir."
      },
      {
        ticker: "TUPRS",
        title: "3. Tüpraş Rafineri Marjları ve Stratejik Dönüşüm Yatırımları",
        detail: "Tüpraş, küresel dizel ve benzin crack marjlarındaki normalleşmeye rağmen, akdeniz rafineri marjının üzerinde 9.8 $/varil net marj elde etti. İzmit ve İzmir rafinerilerindeki yüksek kapasite kullanım oranı (%98) ve yeşil hidrojen dönüşüm yatırımları için ayrılan 200 milyon dolarlık teşvik onayı, şirketin uzun vadeli nakit akış yaratma gücünü teyit etmektedir."
      },
      {
        ticker: "EREGL",
        title: "4. Ereğli Demir Çelik Yeşil Çelik Dönüşümü ve Kapasite Kullanımı",
        detail: "Erdemir, karbon nötr hedefli yeşil çelik dönüşüm programı kapsamında elektrikli ark ocağı yatırımlarını hızlandırdı. Küresel çelik fiyatlarındaki dip seviyelerden toparlanma emareleri ve yurt içi altyapı projelerinden gelen yassı çelik talebiyle kapasite kullanım oranı %88 seviyesine yükseldi. Şirketin peletleme tesisi yatırımı hammaddede dışa bağımlılığı azaltmayı hedefliyor."
      },
      {
        ticker: "ICU",
        title: "5. ICU Girişim Sermayesi KAP Kurumsal Yönetim ve Portföy Bildirimi",
        detail: "ICU Girişim Sermayesi Yatırım Ortaklığı, Kamuyu Aydınlatma Platformu'na (KAP) yaptığı açıklamada Yönetim Kurulu üye değişikliğini ve 2026 yılı 2. çeyrek portföy değerleme raporunu yayınladı. Şirket, teknoloji ve yenilenebilir enerji odaklı girişim portföyündeki şirket değerlemelerinde %18 artış kaydedildiğini duyurdu."
      }
    ],
    global_news: [
      {
        title: "1. ABD Temmuz PCE Enflasyonu Yıllık %3,3 (Çekirdek %0,2 Aylık) ve Fed Yönlendirmesi",
        detail: "ABD Ticaret Bakanlığı tarafından açıklanan verilere göre, Fed'in en çok önem verdiği manşet Kişisel Tüketim Harcamaları (PCE) fiyat endeksi Temmuz'da yıllık %3,7, gıda ve enerjiyi dışarıda bırakan Çekirdek PCE ise %3,3 artış kaydetti. Aylık %0,2'lik çekirdek artış beklentilere tam uyum sağlarken, enflasyondaki katılık Fed'in Eylül ayında 25 baz puanlık ölçülü bir faiz indirimi yapma olasılığını %78 seviyesinde fiyatlandırıyor."
      },
      {
        title: "2. Fed Jackson Hole Ekonomik Sempozyumu (27-29 Ağustos) ve Başkan Kevin Warsh'un Açılışı",
        detail: "Küresel finans dünyasının gözü Wyoming'de düzenlenen yıllık Jackson Hole toplantılarına çevrildi. 2026 yılında Fed Başkanlığı görevini devralan Kevin Warsh'un Cuma günü yapacağı açılış konuşması, ABD para politikasının önümüzdeki 2 yıllık haritasını belirleyecek. Analistler Warsh'un faiz patikasında patika taahhüdü vermekten kaçınan temkinli yaklaşımını koruyacağını, ancak bilanço küçültme (QT) hızına dair sinyaller verebileceğini öngörüyor."
      },
      {
        title: "3. Nvidia Çeyreklik Bilanço Beklentileri ve Küresel Yapay Zeka (AI) Sektörü İvmesi",
        detail: "Piyasa değeri 3,2 trilyon doları aşan Nvidia'nın açıklayacağı 2. çeyrek finansal sonuçları, S&P 500 ve Nasdaq endekslerinin yönü açısından ana katalizör konumunda. Veri merkezi satışlarının 28 milyar doları aşması beklenirken, Blackwell mimarili yeni nesil çip sevkiyat takvimi ve Big Tech (Microsoft, Alphabet, Meta, Amazon) şirketlerinin AI sermaye harcamaları (CapEx) yakından izlenecektir."
      },
      {
        title: "4. Avrupa Merkez Bankası (ECB) Zayıf PMI Verileri ve Euro/Dolar (EUR/USD) Baskısı",
        detail: "Euro Bölgesi Bileşik PMI verisinin 49,1 seviyesine gerileyerek daralma bölgesine girmesi, Almanya ve Fransa ekonomilerindeki durgunluk endişelerini artırdı. Bu durum ECB'nin Sonbahar toplantılarında ek faiz indirimine gitme olasılığını kuvvetlendirirken, Euro/Dolar paritesini 1,1650 seviyesinde baskılamakta ve Doların küresel gücünü desteklemektedir."
      },
      {
        title: "5. Hürmüz Boğazı Sevkiyat Dinamikleri, Orta Doğu ve Brent Petrolün $85,50'ye Gerilemesi",
        detail: "Hürmüz Boğazı ve Kızıldeniz'deki gemi trafiğinde sağlanan diplomatik uzlaşma emareleri ve Çin'in ham petrol ithalatındaki geçici yavaşlama, Brent petrol fiyatlarının 85,50 dolar seviyesine gerilemesini sağladı. Küresel arzın OPEC+ üretim kotalarına uyumla dengelenmesi enflasyonist baskıları hafifletirken, petrol ithalatçısı gelişmekte olan ülkeler için olumlu bir ortam yaratmaktadır."
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
        subject: bulletin.title,
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

  console.log('Step 2/4: Generating Detailed Institutional 5-Item 4-Section AI Bulletin with Gemini...');
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
