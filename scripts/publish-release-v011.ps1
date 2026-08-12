$ErrorActionPreference = "Stop"

# --- 1. Get GitHub token (from env GH_TOKEN, set by caller to avoid encoding issues) ---
$token = $env:GH_TOKEN
if (-not $token) {
  $g = "protocol=https`nhost=github.com`n`n"
  $credOut = $g | git credential fill 2>$null | Out-String
  $tokenLine = ($credOut -split "`n" | Select-String '^password=' | Select-Object -First 1).ToString()
  if ($tokenLine) { $token = $tokenLine.Substring(9).Trim() }
}
if (-not $token) { Write-Output "NO_TOKEN"; exit 1 }
if ($token.Length -lt 20) { Write-Output "TOKEN_TOO_SHORT"; exit 1 }
Write-Output "TOKEN_OK"

$headers = @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json" }

# --- 2. Create release v0.1.1 ---
$bodyPath = "D:\work\Zhizhi\scripts\release-body-v011.json"
$json = Get-Content -Raw -Encoding UTF8 $bodyPath
$createUri = "https://api.github.com/repos/Altria-aPendrag0n/Zhizhi/releases"
$response = Invoke-RestMethod -Method Post -Uri $createUri -Headers $headers `
  -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) -ContentType "application/json; charset=utf-8"
$releaseId = $response.id
$uploadUrl = ($response.upload_url -replace '\{[^}]*\}$', '')
Write-Output "RELEASE_CREATED id=$releaseId"

# --- 3. Upload assets (GitHub strips non-ASCII from asset names; pass sanitized name) ---
function Get-Sanitized([string]$name) {
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $name.ToCharArray()) {
    if ([int]$ch -ge 0x20 -and [int]$ch -le 0x7E) { [void]$sb.Append($ch) }
  }
  return $sb.ToString()
}

$bundleRoot = "D:\work\Zhizhi\study-thread\src-tauri\target\release\bundle"
$targets = @("nsis", "msi")
$uploaded = 0
foreach ($t in $targets) {
  $dir = Join-Path $bundleRoot $t
  Get-ChildItem $dir -File | Where-Object { $_.Name -match '0\.1\.1' -and $_.Extension -in '.exe', '.msi' } | ForEach-Object {
    $assetName = Get-Sanitized $_.Name
    $uploadUri = "$uploadUrl`?name=$([uri]::EscapeDataString($assetName))"
    Write-Output ("UPLOADING " + $_.Name + " -> " + $assetName)
    curl.exe -s -X POST -H "Authorization: Bearer $token" -H "Content-Type: application/octet-stream" `
      --data-binary "@$($_.FullName)" $uploadUri | Out-Null
    Write-Output "  OK $assetName ($($_.Length) bytes)"
    $uploaded++

    # upload corresponding .sig if present
    $sigPath = "$($_.FullName).sig"
    if (Test-Path $sigPath) {
      $sigName = "$assetName.sig"
      $sigUri = "$uploadUrl`?name=$([uri]::EscapeDataString($sigName))"
      Write-Output ("UPLOADING " + $sigName)
      curl.exe -s -X POST -H "Authorization: Bearer $token" -H "Content-Type: text/plain" `
        --data-binary "@$sigPath" $sigUri | Out-Null
      Write-Output "  OK $sigName"
      $uploaded++
    }
  }
}

# --- 4. Upload latest.json ---
$latestPath = "D:\work\Zhizhi\study-thread\dist\latest.json"
$latestUri = "$uploadUrl`?name=latest.json"
Write-Output "UPLOADING latest.json"
curl.exe -s -X POST -H "Authorization: Bearer $token" -H "Content-Type: application/json" `
  --data-binary "@$latestPath" $latestUri | Out-Null
Write-Output "  OK latest.json"
$uploaded++

Write-Output "DONE total_uploads=$uploaded release_url=https://github.com/Altria-aPendrag0n/Zhizhi/releases/tag/v0.1.1"
