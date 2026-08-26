import os
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

def generate_bulletin_with_gemini(bist_news, us_news, macro_news, indicators, api_key=None):
    """
    Use Gemini API to synthesize raw news into a structured financial bulletin tailored for a Corporate Finance Specialist.
    Returns a dictionary with structured bulletin sections.
    """
    if not api_key:
        api_key = os.getenv("GEMINI_API_KEY", "")

    today_str = datetime.now().strftime("%d.%m.%Y")

    # Combine raw news into context string
    context_text = f"=== BUGÜNÜN TARİHİ: {today_str} ===\n\n"

    if indicators:
        context_text += "=== CANLI PİYASA GÖSTERGELERİ ===\n"
        for ind in indicators:
            context_text += f"- {ind['name']}: {ind['price']} ({ind['change_pct']})\n"
        context_text += "\n"

    context_text += "=== BIST & TÜRKİYE FİNANS HABERLERİ ===\n"
    for item in bist_news[:12]:
        context_text += f"- [{item['source']}] {item['title']}: {item['summary']}\n"

    context_text += "\n=== ABD PİYASALARI HABERLERİ ===\n"
    for item in us_news[:12]:
        context_text += f"- [{item['source']}] {item['title']}: {item['summary']}\n"

    context_text += "\n=== KÜRESEL MAKROEKONOMİ HABERLERİ ===\n"
    for item in macro_news[:10]:
        context_text += f"- [{item['source']}] {item['title']}: {item['summary']}\n"

    system_prompt = """
Sen üst düzey bir Kurumsal Finans Uzmanı ve Piyasa Stratejistisin. 
Sana sağlanan güncel finans haberlerini ve göstergeleri inceleyerek, bir finans profesyonelinin sabah saat 08:00'de kahvesini içerken okuyacağı, 3 dakikada tüm piyasa dinamiklerine hakim olmasını sağlayacak VIP Günlük Finans Bülteni hazırlayacaksın.

Bülteni SADECE aşağıdaki JSON formatında çıktı olarak ver. JSON dışında hiçbir giriş/çıkış metni yazma:

{
  "title": "Sabah Finans Bülteni - DD.MM.YYYY",
  "executive_summary": [
    "Bugünün piyasalarını etkileyecek 1. en kritik gelişme ve finansal etkisi.",
    "2. kritik gelişme ve beklentiler.",
    "3. kritik gelişme."
  ],
  "bist_section": {
    "opening_outlook": "BIST 100 güne nasıl bir seyirle başlaması bekleniyor? (Destek/Direnç, genel hava)",
    "highlights": [
      "Önemli KAP açıklamaları, hisse haberleri veya sektör gelişmesi 1",
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
    "global_view": "Küresel makroekonomi, enflasyon, merkez bankaları, DXY ve tahvil faizleri analizi.",
    "commodities_fx": "Dolar/TL, Euro/Dolar, Ons Altın ve Brent Petrol analizi ve beklentiler."
  },
  "economic_calendar": [
    "Günün takip edilecek kritik verisi 1 (Saat - Ülke - Beklenti)",
    "Kritik veri veya konuşma 2"
  ]
}
"""

    if not api_key or api_key == "your_gemini_api_key_here":
        logger.warning("GEMINI_API_KEY is missing or invalid. Returning mockup structured bulletin for test.")
        return generate_mock_bulletin(today_str, indicators)

    try:
        # Try google.genai SDK first
        try:
            from google import genai
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=f"{system_prompt}\n\nVERİLER:\n{context_text}",
                config={'response_mime_type': 'application/json'}
            )
            raw_json = response.text
        except Exception as e1:
            logger.info(f"google.genai SDK fallback to google.generativeai: {e1}")
            import google.generativeai as genai_legacy
            genai_legacy.configure(api_key=api_key)
            model = genai_legacy.GenerativeModel('gemini-1.5-flash')
            response = model.generate_content(
                f"{system_prompt}\n\nVERİLER:\n{context_text}",
                generation_config={"response_mime_type": "application/json"}
            )
            raw_json = response.text

        # Clean codeblocks if present
        cleaned_json = raw_json.strip()
        if cleaned_json.startswith("```"):
            cleaned_json = cleaned_json.split("\n", 1)[1]
            if cleaned_json.endswith("```"):
                cleaned_json = cleaned_json.rsplit("\n", 1)[0]
        cleaned_json = cleaned_json.strip()

        data = json.loads(cleaned_json)
        return data

    except Exception as e:
        logger.error(f"Error calling Gemini API: {e}. Falling back to standard summary.")
        return generate_mock_bulletin(today_str, indicators)


def generate_mock_bulletin(today_str, indicators):
    """Fallback bulletin data structure for testing or API error cases."""
    return {
        "title": f"Sabah Finans Bülteni - {today_str}",
        "executive_summary": [
            "Küresel piyasalarda gözler ABD enflasyon verileri ve Fed yetkililerinin sözlü yönlendirmelerine çevrilmiş durumda.",
            "BIST 100 endeksinde tepki alımlarının devamı takip edilirken, sanayi ve bankacılık hisselerindeki seyrin belirleyici olması bekleniyor.",
            "Petrol fiyatları küresel arz endişeleriyle dengelenirken, ons altın güvenli liman talebiyle güçlü duruşunu koruyor."
        ],
        "bist_section": {
            "opening_outlook": "BIST 100 endeksinin güne hafif alıcılı yatay bir başlangıç yapması bekleniyor. 10.000 seviyesi psikolojik direnç konumunda.",
            "highlights": [
                "Borsa İstanbul'da bilanço dönemi sonrasında şirketlerin hedef fiyat güncellemeleri ön planda kalmaya devam ediyor.",
                "KAP Bildirimleri: Öne çıkan şirket haberleri ve özel durum açıklamaları seans öncesi takip ediliyor.",
                "Yabancı yatırımcı takas oranındaki değişimler ve bankacılık endeksi hisselerindeki işlem hacimleri izleniyor."
            ]
        },
        "us_market_section": {
            "futures_outlook": "ABD vadeli endeksleri seans öncesinde yeşil bölgede pozitif seyrediyor. Nasdaq vadeleri teknoloji hisselerindeki alımlarla önde.",
            "highlights": [
                "Big Tech Şirketleri: Yapay zeka yatırımları ve çeyreklik gelir beklentileri piyasaları desteklemeye devam ediyor.",
                "Wall Street analistleri, S&P 500 şirketlerinin kar marjlarındaki iyileşmeye dikkat çekiyor.",
                "Tahvil Getirileri: ABD 10 yıllık tahvil faizlerindeki geri çekilme büyüme hisselerine nefes aldırıyor."
            ]
        },
        "macro_section": {
            "global_view": "DXY Dolar Endeksi 103-104 bandında dengelenirken, küresel merkez bankalarının faiz indirim patikaları yakından izleniyor.",
            "commodities_fx": "Dolar/TL 34,20 civarında yatay seyrederken, Ons Altın $2.500 seviyesinin üzerinde tutunmaya çalışıyor. Brent petrol $78 varil fiyatında."
        },
        "economic_calendar": [
            "15:30 - ABD Çekirdek TÜFE / ÜFE Verisi (Aylık/Yıllık)",
            "17:30 - ABD Ham Petrol Stokları",
            "21:00 - Fed FOMC Toplantı Tutanakları"
        ]
    }
