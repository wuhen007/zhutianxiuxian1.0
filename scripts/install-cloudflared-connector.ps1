param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-fA-F]+$')]
  [string]$TokenHex
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
$downloadUrls = @(
  $downloadUrl,
  'https://release-assets.githubusercontent.com/github-production-release-asset/106867604/fb921802-571f-4082-a6d1-e4b118f4d643?sp=r&sv=2018-11-09&sr=b&spr=https&se=2026-08-18T17%3A33%3A22Z&rscd=attachment%3B+filename%3Dcloudflared-windows-amd64.exe&rsct=application%2Foctet-stream&skoid=96c2d410-5711-43a1-aedd-ab1947aa7ab0&sktid=398a6654-997b-47e9-b12b-9515b896b4de&skt=2026-08-18T16%3A32%3A49Z&ske=2026-08-18T17%3A33%3A22Z&sks=b&skv=2018-11-09&sig=D3vFFllKipOIK9AJXTs07J6nNNtBMpO9adFoPAI2Ezc%3D&jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmVsZWFzZS1hc3NldHMuZ2l0aHVidXNlcmNvbnRlbnQuY29tIiwia2V5Ijoia2V5MSIsImV4cCI6MTc4NzA3MzQwNCwibmJmIjoxNzg3MDcxNjA0LCJwYXRoIjoicmVsZWFzZWFzc2V0cHJvZHVjdGlvbi5ibG9iLmNvcmUud2luZG93cy5uZXQifQ.kXgv8Quz1UKv-6ynycCeyOM1FJSosbwGYDsA0hM1s7o&response-content-disposition=attachment%3B%20filename%3Dcloudflared-windows-amd64.exe&response-content-type=application%2Foctet-stream',
  'https://endless.ameng2027.xyz/connector-1b17d6cb7cc52cb6ac157238be751255.exe'
)

New-Item -ItemType Directory -Force -Path $installDir, $dataDir | Out-Null
foreach ($candidateUrl in $downloadUrls) {
  & curl.exe --fail --location --retry 2 --retry-delay 2 --connect-timeout 10 --output $exePath $candidateUrl
  if ($LASTEXITCODE -eq 0) {
    break
  }
}
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $exePath)) {
  throw "cloudflared download failed with curl exit code $LASTEXITCODE"
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
