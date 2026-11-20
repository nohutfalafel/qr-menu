# Nohut QR Publisher • Windows localhost bridge

The QR website remains public and holds no GitHub credentials. Nohut POS and its
publisher run under the same Windows user account.

## Setup once (after both PRs are reviewed and merged)

1. Install Node.js 22+ from the official Node.js site.
2. Update Nohut Falafel POS through Windows Setup. The installer bundles the
   QRPublisher server and setup PowerShell script.
3. Keep your GitHub App Nohut QR Publisher private key file (.pem) in the
   Downloads folder of the restaurant Windows PC. The setup script recognizes
   filenames starting with nohut-qr-publisher and ending in .pem.
4. Open Ayarlar > Entegrasyonlar > Nohut QR Publisher and click
   Yerel Yayınlama Servisini Başlat. Or use Nohut QR Publisher Kurulum
   in the Windows Start menu. Keep its console running while publishing.
5. The startup script generates a random 48-byte access code and stores it
   encrypted using CurrentUser Windows DPAPI in BOTH the POS vault and the
   local publisher vault. No code needs to be copied into settings manually.
6. Click Bağlantıyı Test Et. The POS connects to localhost:8787.
7. Open QR Menü Yönetimi, load the menu and edit TR/EN/AR product titles,
   descriptions, price, stock, category, photo, campaigns, then save a local
   draft, preview it, and publish after confirmation.

The GitHub App is already registered: App ID 5845851, installed on
nohutfalafel/qr-menu, Contents read/write. No second App, OAuth client,
personal access token, or manual short-lived access token is needed.
An installation token is generated on the local server when needed.

## Security

- The publisher binds ONLY to 127.0.0.1, and has a random bearer key.
- The private GitHub App key is kept only on Windows, never in Flutter code
  or the GitHub repository or GitHub Pages.
- The publisher stores its key under the current user's AppData folder
  with restricted file permissions. Keep Windows account secure.
- The access code is encrypted with Windows DPAPI CurrentUser.
- The POS accepts remote services only over HTTPS, localhost over HTTP.
- Do not upload any private key, JWT, access code, PAT or secret to GitHub,
  the QR website, logs, or conversations.
- Because a private key was already uploaded to a conversation, rotate
  that GitHub App key before deploying to production.

## Publishing

The local Node server has four operations:

GET /health: process status only.
GET /catalog: authenticated catalog read and revision.
POST /publish: authenticated stable-ID validated SHA-checked update.
POST /image: authenticated PNG/JPG/WEBP upload, max 6 MB.

The public QR page reads a managed menu overlay only if present. It has no
write credentials. A successful GitHub commit is NOT proof that GitHub Pages
has already deployed; confirm the page before claiming live success.

Do not expose port 8787 to a public interface. Deploying publisher and
cashier on different computers would require a separate TLS/auth design.
