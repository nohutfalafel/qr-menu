# Nohut QR Publisher • Windows local service
# Requires Node.js 22+ and the existing GitHub App private key from Downloads.
# Generates a private random access code and stores it in Windows DPAPI for POS.
param([string]$PrivateKeyFile = "",[int]$Port = 8787)
$ErrorActionPreference = 'Stop'
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Invalid port.' }
# POS uses -NoProfile, so fnm may not be active in PATH.
# Query node --version rather than node -p to avoid PowerShell quoting issues.
$nodeCandidates = New-Object 'System.Collections.Generic.List[string]'
$onPath = Get-Command node.exe -ErrorAction SilentlyContinue
if ($onPath) { $nodeCandidates.Add($onPath.Source) }
$programFilesNode = Join-Path $env:ProgramFiles 'nodejs\node.exe'
if (Test-Path -LiteralPath $programFilesNode -PathType Leaf) {
  $nodeCandidates.Add($programFilesNode)
}
$fnmRoots = @(
  $env:FNM_DIR,
  (Join-Path $env:APPDATA 'fnm'),
  (Join-Path $env:LOCALAPPDATA 'fnm'),
  (Join-Path $env:USERPROFILE '.fnm')
) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique
foreach ($root in $fnmRoots) {
  $versionsDir = Join-Path $root 'node-versions'
  if (-not (Test-Path -LiteralPath $versionsDir -PathType Container)) { continue }
  foreach ($versionDir in Get-ChildItem -LiteralPath $versionsDir -Directory -ErrorAction SilentlyContinue) {
    $exe = Join-Path $versionDir.FullName 'installation\node.exe'
    if (Test-Path -LiteralPath $exe -PathType Leaf) { $nodeCandidates.Add($exe) }
  }
}
$availableNodes = @()
foreach ($candidate in ($nodeCandidates | Select-Object -Unique)) {
  try {
    $nodeVersion = (& $candidate --version 2>$null | Select-Object -First 1)
    $match = [regex]::Match([string]$nodeVersion,'^v([0-9]+)\.([0-9]+)\.([0-9]+)')
    if ($LASTEXITCODE -eq 0 -and $match.Success) {
      $availableNodes += [pscustomobject]@{
        Path = $candidate
        Version = [version]($match.Groups[1].Value + '.' + $match.Groups[2].Value + '.' + $match.Groups[3].Value)
      }
    }
  } catch { continue }
}
$selectedNode = $availableNodes | Where-Object { $_.Version.Major -ge 22 } |
  Sort-Object Version -Descending | Select-Object -First 1
if (-not $selectedNode) {
  throw 'Node.js 22+ bulunamadı. POS PowerShell -NoProfile ile acilir; Node 26 icin Windows kurulumunu veya fnm kurulum klasorunu kontrol edin.'
}
$nodePath = $selectedNode.Path
Write-Host ('QR Publisher Node: ' + $selectedNode.Version.ToString() + ' (' + $nodePath + ')')
if ([string]::IsNullOrWhiteSpace($PrivateKeyFile)) {
  $existingKey = Join-Path $env:APPDATA 'NohutFalafel\QrPublisher\github-app-private-key.pem'
  if (Test-Path -LiteralPath $existingKey -PathType Leaf) {
    $PrivateKeyFile = $existingKey
  }
}
if ([string]::IsNullOrWhiteSpace($PrivateKeyFile)) {
  # Accept GitHub's original generated filename in the protected folder,
  # including the user's existing nohut-qr-publisher.2026-11-20.private-key.pem.
  # Prefer a protected local key, then Downloads, and finally the file picker.
  $protectedFolder = Join-Path $env:APPDATA 'NohutFalafel\QrPublisher'
  $candidateFiles = @()
  foreach ($folder in @($protectedFolder,(Join-Path $env:USERPROFILE 'Downloads'))) {
    if (Test-Path -LiteralPath $folder -PathType Container) {
      $candidateFiles += @(Get-ChildItem -LiteralPath $folder -Filter 'nohut-qr-publisher*.pem' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
    }
  }
  if ($candidateFiles.Count -gt 0) { $PrivateKeyFile = $candidateFiles[0].FullName }
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
& $nodePath (Join-Path $PSScriptRoot 'server.mjs')
