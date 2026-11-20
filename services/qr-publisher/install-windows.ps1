# Installs the Nohut QR Publisher on the Windows POS computer.
# The GitHub .pem must already exist locally. NEVER upload it to GitHub.
# Run in regular Windows PowerShell as the restaurant Windows user.
param(
  [Parameter(Mandatory=$true)]
  [string]$PrivateKeyPath,
  [switch]$NoStartupShortcut
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
if(-not (Test-Path -LiteralPath $PrivateKeyPath -PathType Leaf)) {
  throw 'GitHub App private key .pem file not found.'
}
$node=Get-Command node.exe -ErrorAction SilentlyContinue
if(-not $node) {
  throw 'Node.js 22 or newer is required. Install it from nodejs.org and run this script again.'
}
$major=([string](& $node.Source --version)).TrimStart('v').Split('.')[0]
if([int]$major -lt 22)throw 'Node.js 22 or newer is required.'
$source=Join-Path $PSScriptRoot 'server.mjs'
if(-not (Test-Path -LiteralPath $source))throw 'server.mjs missing next to installer script.'
$folder=Join-Path $env:LOCALAPPDATA 'NohutFalafel\QrPublisher'
New-Item -Path $folder -ItemType Directory -Force | Out-Null
$account=[Security.Principal.WindowsIdentity]::GetCurrent().Name
# Limit the folder to current Windows account and SYSTEM, without broad inherited ACLs.
& icacls.exe $folder /inheritance:r /grant:r "$($account):(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0)throw 'Could not secure private key directory permissions.'
$targetPem=Join-Path $folder 'github-app.pem'
Copy-Item -LiteralPath $PrivateKeyPath -Destination $targetPem -Force
$head=Get-Content -LiteralPath $targetPem -TotalCount 1
if(-not $head.Contains('BEGIN') -or -not $head.Contains('PRIVATE KEY')) {
  Remove-Item -LiteralPath $targetPem -Force
  throw 'The selected file does not contain a valid PEM private key header.'
}
Copy-Item -LiteralPath $source -Destination (Join-Path $folder 'server.mjs') -Force
$secretBytes=New-Object byte[] 48
$rng=[Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($secretBytes) } finally { $rng.Dispose() }
$secret=[Convert]::ToBase64String($secretBytes)
$encrypted=[Security.Cryptography.ProtectedData]::Protect(
  [Text.Encoding]::UTF8.GetBytes($secret),
  $null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
[IO.File]::WriteAllBytes((Join-Path $folder 'publisher-token.dpapi'),$encrypted)
$launcher=@'
$ErrorActionPreference="Stop"
Add-Type -AssemblyName System.Security
$directory=Join-Path $env:LOCALAPPDATA "NohutFalafel\QrPublisher"
$bytes=[IO.File]::ReadAllBytes((Join-Path $directory "publisher-token.dpapi"))
$clear=[Security.Cryptography.ProtectedData]::Unprotect(
  $bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
try {$env:QR_PUBLISH_ADMIN_TOKEN=[Text.Encoding]::UTF8.GetString($clear)}
finally {[Array]::Clear($clear,0,$clear.Length)}
$env:GITHUB_APP_ID="5845851"
$env:GITHUB_APP_PRIVATE_KEY_FILE=Join-Path $directory "github-app.pem"
$env:QR_PUBLISH_PORT="18787"
& node.exe (Join-Path $directory "server.mjs")
'@
$launch=Join-Path $folder 'launch.ps1'
[IO.File]::WriteAllText($launch,$launcher,[Text.UTF8Encoding]::new($false))
if(-not $NoStartupShortcut){
  $shell=New-Object -ComObject WScript.Shell
  $shortcut=$shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'Nohut QR Publisher.lnk'))
  $shortcut.TargetPath=(Join-Path $PSHOME 'powershell.exe')
  $shortcut.Arguments='-NoProfile -WindowStyle Hidden -File "'+$launch+'"'
  $shortcut.WorkingDirectory=$folder
  $shortcut.Description='Starts the local Nohut QR publishing service after Windows login.'
  $shortcut.Save()
}
Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList ('-NoProfile -WindowStyle Hidden -File "'+$launch+'"') -WorkingDirectory $folder
Write-Host ''
Write-Host 'NOHUT QR PUBLISHER INSTALLED' -ForegroundColor Green
Write-Host 'Service URL: http://127.0.0.1:18787'
Write-Host 'Open POS > Ayarlar > Entegrasyonlar > Nohut QR Publisher.'
Write-Host 'Paste the following one-time publishing access code there, then click Kaydet.'
Write-Host 'This code will NOT be displayed again. Do not send it in ChatGPT or email.'
Write-Host ''
Write-Host $secret -ForegroundColor Yellow
Write-Host ''
Write-Host 'The GitHub App private key remains in the local, restricted Windows folder.'
