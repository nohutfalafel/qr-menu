# Nohut QR Publisher • Windows local service
# Requires Node.js 22+ and the existing GitHub App private key from Downloads.
# Generates a private random access code and stores it in Windows DPAPI for POS.
param([string]$PrivateKeyFile = "",[int]$Port = 8787)
$ErrorActionPreference = 'Stop'
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Invalid port.' }
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js 22+ bulunamadı. Node.js LTS yükleyin.' }
$version = & $node.Source -p 'Number(process.versions.node.split(".")[0])'
if ([int]$version -lt 22) { throw 'Node.js 22+ gereklidir.' }
if ([string]::IsNullOrWhiteSpace($PrivateKeyFile)) {
  $existingKey = Join-Path $env:APPDATA 'NohutFalafel\QrPublisher\github-app-private-key.pem'
  if (Test-Path -LiteralPath $existingKey -PathType Leaf) {
    $PrivateKeyFile = $existingKey
  }
}
if ([string]::IsNullOrWhiteSpace($PrivateKeyFile)) {
  $candidates = @(Get-ChildItem -LiteralPath (Join-Path $env:USERPROFILE 'Downloads') -Filter 'nohut-qr-publisher*.pem' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
  if ($candidates.Count -gt 0) { $PrivateKeyFile = $candidates[0].FullName }
}
# If the key is neither in the protected folder nor Downloads, allow a
# one-time Windows file selection. The PEM never goes into the GitHub repo.
if (-not (Test-Path -LiteralPath $PrivateKeyFile -PathType Leaf)) {
  Add-Type -AssemblyName System.Windows.Forms
  $picker = New-Object System.Windows.Forms.OpenFileDialog
  $picker.Title = 'Nohut QR Publisher - GitHub App Private Key (.pem) Seç'
  $picker.Filter = 'GitHub App Private Key (*.pem)|*.pem'
  $picker.Multiselect = $false
  $picker.CheckFileExists = $true
  if ($picker.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    $PrivateKeyFile = $picker.FileName
  }
}
if (-not (Test-Path -LiteralPath $PrivateKeyFile -PathType Leaf)) {
  throw 'Nohut QR Publisher için .pem seçilmedi. GitHub App anahtarını bir kez seçin.'
}
$keyText = Get-Content -LiteralPath $PrivateKeyFile -Raw -Encoding UTF8
if ($keyText -notmatch '-----BEGIN (RSA )?PRIVATE KEY-----') {
  throw 'Seçilen dosya GitHub App private key (.pem) değil.'
}
$base = Join-Path $env:APPDATA 'NohutFalafel'
$service = Join-Path $base 'QrPublisher'
New-Item -ItemType Directory -Path $service -Force | Out-Null
$localKey = Join-Path $service 'github-app-private-key.pem'
if ((Resolve-Path -LiteralPath $PrivateKeyFile).Path -ne $localKey) {
  Copy-Item -LiteralPath $PrivateKeyFile -Destination $localKey -Force
}
# This private directory belongs to the current Windows user, not POS source.
# The POS stores only a distinct, random DPAPI-encrypted access code.

$account = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $localKey /inheritance:r /grant:r ($account + ':(F)') | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Private key ACL ayarlanamadı.' }
Add-Type -AssemblyName 'System.Security'
$serverVault = Join-Path $service 'access-code.dpapi'
$posVault = Join-Path $base 'qr-publisher-credentials.dpapi'
if (Test-Path -LiteralPath $serverVault) {
  $protected = [Convert]::FromBase64String((Get-Content -LiteralPath $serverVault -Raw -Encoding UTF8).Trim())
  $plain = [Security.Cryptography.ProtectedData]::Unprotect($protected,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $token = [Text.Encoding]::UTF8.GetString($plain)
} else {
  $bytes = New-Object byte[] 48
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  $token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
  $plain = [Text.Encoding]::UTF8.GetBytes($token)
  $protected = [Security.Cryptography.ProtectedData]::Protect($plain,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  [IO.File]::WriteAllText($serverVault,[Convert]::ToBase64String($protected),[Text.Encoding]::UTF8)
}
$posJson = '{"token":"' + $token + '"}'
$posBytes = [Text.Encoding]::UTF8.GetBytes($posJson)
$posProtected = [Security.Cryptography.ProtectedData]::Protect($posBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
[IO.File]::WriteAllText($posVault,[Convert]::ToBase64String($posProtected),[Text.Encoding]::UTF8)
$env:GITHUB_APP_ID = '5845851'
$env:GITHUB_APP_PRIVATE_KEY_FILE = $localKey
$env:QR_PUBLISH_ADMIN_TOKEN = $token
$env:QR_PUBLISH_PORT = [string]$Port
$startup = [Environment]::GetFolderPath('Startup')
$shortcutFile = Join-Path $startup 'Nohut QR Publisher.lnk'
if (-not (Test-Path -LiteralPath $shortcutFile)) {
  $shell = New-Object -ComObject WScript.Shell
  $link = $shell.CreateShortcut($shortcutFile)
  $link.TargetPath = Join-Path $PSHOME 'powershell.exe'
  $link.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"'
  $link.WorkingDirectory = $PSScriptRoot
  $link.Description = 'Nohut QR Publisher · Windows girişinde otomatik başlat'
  $link.Save()
}
Write-Host 'Nohut QR Publisher started on localhost' $Port
Write-Host 'POS > Ayarlar > Entegrasyonlar > GitHub: Bağlantıyı Test Et'
& $node.Source (Join-Path $PSScriptRoot 'server.mjs')
