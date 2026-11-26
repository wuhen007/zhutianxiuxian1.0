param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-fA-F]+$')]
  [string]$TokenHex,

  [switch]$SkipDownload
)

$ErrorActionPreference = 'Stop'
if ($TokenHex.Length % 2 -ne 0) {
  throw 'TokenHex must contain an even number of characters.'
}
$tokenBytes = for ($index = 0; $index -lt $TokenHex.Length; $index += 2) {
  [Convert]::ToByte($TokenHex.Substring($index, 2), 16)
}
$Token = [Text.Encoding]::ASCII.GetString($tokenBytes)
$serviceName = 'Cloudflared'
$installDir = 'C:\Cloudflared\bin'
$dataDir = 'C:\ProgramData\cloudflared'
$exePath = Join-Path $installDir 'cloudflared.exe'
$tokenPath = Join-Path $dataDir 'token'
$downloadUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'

New-Item -ItemType Directory -Force -Path $installDir, $dataDir | Out-Null
if (-not $SkipDownload) {
  & curl.exe --fail --location --retry 5 --retry-delay 2 --connect-timeout 20 --output $exePath $downloadUrl
  if ($LASTEXITCODE -ne 0) {
    throw "cloudflared download failed with curl exit code $LASTEXITCODE"
  }
}
if (-not (Test-Path -LiteralPath $exePath)) {
  throw "cloudflared executable is missing at $exePath"
}
Set-Content -LiteralPath $tokenPath -Value $Token.Trim() -NoNewline -Encoding ascii

& icacls.exe $tokenPath /inheritance:r /grant:r 'SYSTEM:F' 'Administrators:F' | Out-Null

$existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existingService) {
  if ($existingService.Status -ne 'Stopped') {
    Stop-Service -Name $serviceName -Force
  }
  & sc.exe delete $serviceName | Out-Null
  Start-Sleep -Seconds 1
}

$binaryPath = ('"{0}" tunnel run --token-file "{1}"' -f $exePath, $tokenPath)
& sc.exe create $serviceName binPath= $binaryPath start= auto | Out-Null
& sc.exe description $serviceName 'Cloudflare Tunnel connector for the endless web service' | Out-Null
Start-Service -Name $serviceName

$service = Get-Service -Name $serviceName
$process = Get-Process cloudflared -ErrorAction SilentlyContinue
if ($service.Status -ne 'Running' -or -not $process) {
  throw 'cloudflared service did not start successfully'
}

Write-Output "Cloudflared is running as service $serviceName."
