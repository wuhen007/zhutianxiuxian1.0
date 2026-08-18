param(
  [Parameter(Mandatory = $true)]
  [string]$Token
)

$ErrorActionPreference = 'Stop'
$serviceName = 'Cloudflared'
$installDir = 'C:\Cloudflared\bin'
$dataDir = 'C:\ProgramData\cloudflared'
$exePath = Join-Path $installDir 'cloudflared.exe'
$tokenPath = Join-Path $dataDir 'token'
$downloadUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'

New-Item -ItemType Directory -Force -Path $installDir, $dataDir | Out-Null
Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -OutFile $exePath
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
