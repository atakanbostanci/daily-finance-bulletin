# 📈 Otomatik Günlük Finans Bülteni (BIST + US Market + Makroekonomi)

Kurumsal finans uzmanları için her sabah saat **08:00'de** otomatik çalışan, **Borsa İstanbul (BIST 100)**, **Amerikan Borsaları (NYSE/NASDAQ)** ve **Küresel Makroekonomi** gelişmelerini Yapay Zeka (Gemini) ile analiz ederek e-posta kutunuza ulaştıran bulut otomasyon projesi.

---

## 🚀 GitHub Üzerinde Otomasyonu Etkinleştirme

1. Bu projeyi kendi GitHub hesabınıza push edin (`git push`).
2. GitHub'da reponuzun **Settings > Secrets and variables > Actions** sayfasına gidin.
3. **New repository secret** butonuna basarak aşağıdaki 3 gizli değişkeni ekleyin:

| Secret Adı | Açıklama |
| :--- | :--- |
| `GEMINI_API_KEY` | Google AI Studio'dan aldığınız Gemini API Anahtarı |
| `RESEND_API_KEY` | Resend.com'dan aldığınız e-posta gönderim API Anahtarı |
| `RECIPIENT_EMAIL` | Bültenin iletileceği alıcı e-posta adresi (`atakanbostanci_@hotmail.com`) |

4. Artık her sabah Türkiye saati ile **08:00'de (05:00 UTC)** GitHub Actions otomatik olarak çalışacak ve bülteninizi e-postanıza gönderecektir!
5. Dilerseniz GitHub'da **Actions** sekmesine gidip **Run workflow** butonuna basarak bülteni istediğiniz an manuel olarak da tetikleyebilirsiniz.

---

## 💻 Yerel (Local) Çalıştırma & Test Etme

```bash
# 1. Bağımlılıkları yükleyin
npm install

# 2. Bülteni hemen oluşturup e-posta olarak göndermek için:
node index.js

# 3. E-posta göndermeden sadece HTML önizlemesi oluşturmak için:
node index.js --preview
```

---

## 📋 Proje Yapısı

- `index.js`: Ana otomasyon akış yöneticisi.
- `notifier/templates/bulletin.html`: Kurumsal finans VIP e-posta tasarımı.
- `.github/workflows/daily_bulletin.yml`: TSİ 08:00 zamanlayıcı akışı.
