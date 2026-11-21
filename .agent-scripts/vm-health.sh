#!/usr/bin/env bash
# Purpose: one-shot health check for the Sacred Timeline Oracle VM (services, .env config,
#          backend + Supabase reachability, user count, public site, HTTPS cert, server load).
#          Read-only: never prints secrets, never changes anything.
# Triggered by: user request "give me a VM health check command" after fixing sign-in on the VM.
# Usage on the VM: bash ~/vm-health.sh
APP=/home/ubuntu/MCU_watchlist
DOMAIN=thesacredtimeline.duckdns.org
ENVF=$APP/backend/.env

ok()   { echo "  [ OK ] $*"; }
bad()  { echo "  [FAIL] $*"; }
warn() { echo "  [WARN] $*"; }
get()  { grep "^$1=" "$ENVF" 2>/dev/null | cut -d= -f2- | tr -d '\r'; }

echo "== Services =="
for s in mcu-backend caddy; do
  a=$(systemctl is-active "$s" 2>/dev/null); e=$(systemctl is-enabled "$s" 2>/dev/null)
  if [ "$a" = active ]; then ok "$s running (starts on boot: $e)"; else bad "$s is '$a'"; fi
  if [ "$e" != enabled ]; then warn "$s will NOT start on boot (fix: sudo systemctl enable $s)"; fi
done

echo "== Config (backend/.env) =="
SU=$(get SUPABASE_URL); SK=$(get SUPABASE_SERVICE_ROLE_KEY); GC=$(get GOOGLE_CLIENT_ID)
case "$SU" in
  ""|*YOUR_PROJECT*) bad "SUPABASE_URL missing or still a placeholder" ;;
  *) ok "SUPABASE_URL = $SU" ;;
esac
if [ "${#SK}" -gt 80 ]; then ok "service-role key present (${#SK} chars)"; else bad "service-role key missing or placeholder (${#SK} chars)"; fi
case "$GC" in
  *.apps.googleusercontent.com) ok "Google client ID set" ;;
  *) warn "Google client ID missing or placeholder (Google sign-in will not work)" ;;
esac
perm=$(stat -c %a "$ENVF" 2>/dev/null)
if [ "$perm" = 600 ]; then ok ".env permissions are 600"; else warn ".env permissions are '$perm' (fix: chmod 600 $ENVF)"; fi

echo "== Backend and database =="
code=$(curl -s -o /dev/null -w '%{http_code}' -m 10 http://127.0.0.1:4000/api/leaderboard)
if [ "$code" = 200 ]; then ok "backend + Supabase: /api/leaderboard HTTP 200"; else bad "backend /api/leaderboard HTTP $code (database or key problem)"; fi
if [ -n "$SU" ] && [ "${#SK}" -gt 80 ]; then
  n=$(curl -s -m 15 -D - -o /dev/null "$SU/rest/v1/custom_users?select=id" \
        -H "apikey: $SK" -H "Authorization: Bearer $SK" -H "Prefer: count=exact" -H "Range: 0-0" \
      | tr -d '\r' | awk -F'/' 'tolower($1) ~ /^content-range/ {print $2}')
  if [ -n "$n" ]; then ok "registered users: $n"; else warn "could not read the user count from Supabase"; fi
fi

echo "== Public site =="
for p in "/" "/api/leaderboard"; do
  c=$(curl -s -o /dev/null -w '%{http_code}' -m 15 "https://$DOMAIN$p")
  if [ "$c" = 200 ]; then ok "https://$DOMAIN$p HTTP 200"; else bad "https://$DOMAIN$p HTTP $c"; fi
done
exp=$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$exp" ]; then ok "HTTPS certificate expires: $exp"; else warn "could not read the HTTPS certificate"; fi

echo "== Server =="
echo "  uptime : $(uptime -p)"
echo "  memory : $(free -h | awk '/Mem:/ {print $3" used of "$2}')"
echo "  disk / : $(df -h / | awk 'NR==2 {print $3" used of "$2" ("$5")"}')"

echo "== Backend errors in the last 24h (last 5) =="
errs=$(sudo journalctl -u mcu-backend --since "24 hours ago" --no-pager 2>/dev/null | grep -iE 'error|fail|exception' | grep -v MODULE_TYPELESS | tail -n 5)
if [ -n "$errs" ]; then echo "$errs" | sed 's/^/  /'; else ok "none"; fi
