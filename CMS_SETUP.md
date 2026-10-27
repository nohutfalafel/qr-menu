# Nohut Falafel — Canlı Fiyat ve Kampanya Yönetimi

Bu depoda ücretli veri tabanı yoktur. **GitHub** içerikleri saklar; **GitHub Pages** QR menüyü yayımlar; **Pages CMS** GitHub yetkileriyle düzenleme ekranı sağlar.

## İlk kurulum (Ömer / repo yetkilisi)

1. https://app.pagescms.org/ adresine gidin.
2. **Sign in with GitHub** seçin. Depoya yazma izni olan `nohutfalafel` hesabıyla veya depoya yazma yetkisi verilmiş kendi GitHub hesabınızla giriş yapın.
3. İstenirse **Pages CMS GitHub App** uygulamasını yükleyin. Yetki verirken **Only select repositories → nohutfalafel/qr-menu** seçeneğini tercih edin.
4. CMS'de `nohutfalafel / qr-menu` deposunu ve **main** dalını seçin.
5. Sol menüden **Menü Fiyatları** veya **Kampanyalar** bölümünü açın.
6. Değişikliği yapıp **Save / Kaydet** ile GitHub'a yazın. GitHub Pages yayımladıktan sonra aynı QR menü adresinde güncel veriler görünür.

Pages CMS'nin `.pages.yml` yapılandırması depodadır. Ömer için ayrı şifre bu projede tutulmaz. GitHub şifresi, OAuth belirteci veya kişisel erişim belirteci GitHub Pages HTML/JS içine **asla** yazılmaz.

## Fiyatlar

`cms/menu-prices.json` içindeki sekiz kategori, toplam 51 mevcut ürünün fiyatını içerir. Sadece `price` değerlerini değiştirin; `name` isimleri QR menüdeki mevcut ürünlere bağlıdır ve editörde salt okunurdur. CMS yeni ürün yaratma / ürün silme sistemi **değildir**. Ad ve fotoğraf değişimleri mevcut menü dosyalarında ayrıca geliştirme gerektirir.

Fiyatlar müşteriye ait `menu-data.js` listesini sayfa açılışında günceller. JSON yüklenemezse var olan menü değerleri kullanılır, CMS verisi değişmez. Hataları tarayıcı Console ekranında görebilirsiniz.

## Kampanyalar

`cms/campaigns.json` bir kampanya listesidir. Yeni bir kampanya için yeni bir kayıt açın:

- `id`: benzersiz, küçük harfli kampanya kodu
- `active`: true yayımla, false gizle
- `price`: TL cinsinden sayı
- `title`, `description`, `items`: Türkçe, İngilizce, Arapça
- `poster` ve `thumbnail`: `assets/campaigns/` klasöründeki afişler (CMS medya alanını kullanın)
- `startsAt`, `endsAt`: isteğe bağlı, örneğin `2026-11-01T11:00:00+03:00`

Eski tek kampanya ve görseller başlangıçta **aynen korunmuştur**. Müşteri menüsünün `campaigns.js` kodu sadece etkin/tarih aralığındaki kampanyaları gösterir.

## Yönetim bağlantısı

- Yönetim başlangıcı: https://nohutfalafel.github.io/qr-menu/adminfalafel/
- Düzenleme platformu: https://app.pagescms.org/
- Müşterinin gördüğü menü: https://nohutfalafel.github.io/qr-menu/

**Önemli:** Eski `adminfalafel` ürün tablosu halen sadece tarayıcı taslağıdır. Canlı yayın için Pages CMS'de `Kaydet` kullanılmalıdır. CMS oturumu için ilk GitHub uygulama yetkilendirmesini kullanıcı kendisi yapmalıdır.
