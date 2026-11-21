# Purpose: end-to-end sign-in check against a deployed backend (health, leaderboard status,
#          register a throwaway account, login, wrong-PassKey login). Cleanup of the test
#          account is done separately in Supabase.
# Triggered by: user request "Check the signin for both and tell me whats wrong and fix it asap"
#               (Render + Oracle VM backends moved to the shared Supabase project).
# Usage: powershell -File verify-signin.ps1 -Base https://mcu-watchlist.onrender.com -User QARNDR -Pass 482916 [-SkipRegister]
param(
  [Parameter(Mandatory = $true)][string]$Base,
  [string]$User = "QATEST",
  [string]$Pass = "482916",
  [switch]$SkipRegister
)

function Call($method, $path, $bodyObj) {
  $uri = "$Base$path"
  try {
    if ($bodyObj) {
      $r = Invoke-WebRequest -Uri $uri -Method $method -ContentType "application/json" -Body ($bodyObj | ConvertTo-Json -Compress) -UseBasicParsing -TimeoutSec 60
    } else {
      $r = Invoke-WebRequest -Uri $uri -Method $method -UseBasicParsing -TimeoutSec 60
    }
    return @{ status = [int]$r.StatusCode; body = $r.Content }
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
      return @{ status = [int]$resp.StatusCode; body = $sr.ReadToEnd() }
    }
    return @{ status = 0; body = $_.Exception.Message }
  }
}

function Redact($body) {
  # never print session tokens
  return ($body -replace '"token"\s*:\s*"[^"]+"', '"token":"<redacted>"')
}

Write-Output "== $Base =="
$h = Call "GET" "/health" $null;          "health        : $($h.status) $($h.body)"
$l = Call "GET" "/api/leaderboard" $null; "leaderboard   : $($l.status) $($l.body)"

if (-not $SkipRegister) {
  $reg = Call "POST" "/api/auth/register" @{ username = $User; password = $Pass }
  "register      : $($reg.status) $(Redact $reg.body)"
}
$ok = Call "POST" "/api/auth/login" @{ username = $User; password = $Pass }
"login (right) : $($ok.status) $(Redact $ok.body)"
$bad = Call "POST" "/api/auth/login" @{ username = $User; password = "000000" }
"login (wrong) : $($bad.status) $($bad.body)"
