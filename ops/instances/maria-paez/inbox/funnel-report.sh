#!/bin/bash
# Funnel report: control.sqlite + intensa-api logs, ultimos 7 dias
set +e
DB=/root/secretaria/state/control/control.sqlite
echo "=== DB PATH ==="
ls -la "$DB" 2>&1

echo; echo "=== TABLES ==="
sqlite3 "$DB" ".tables" 2>&1

echo; echo "=== SCHEMA signup_pending ==="
sqlite3 "$DB" ".schema signup_pending" 2>&1
echo; echo "=== SCHEMA clientes ==="
sqlite3 "$DB" ".schema clientes" 2>&1
echo; echo "=== SCHEMA webhook_events ==="
sqlite3 "$DB" ".schema webhook_events" 2>&1

echo; echo "=== NOW ==="
date -u +"%Y-%m-%dT%H:%M:%SZ"

echo; echo "=== signup_pending ALL ROWS (raw, last 14d worth) ==="
sqlite3 -header -column "$DB" "SELECT * FROM signup_pending ORDER BY rowid DESC LIMIT 200;" 2>&1

echo; echo "=== clientes ALL ROWS ==="
sqlite3 -header -column "$DB" "SELECT * FROM clientes ORDER BY rowid DESC LIMIT 200;" 2>&1

echo; echo "=== webhook_events recent ==="
sqlite3 -header -column "$DB" "SELECT * FROM webhook_events ORDER BY rowid DESC LIMIT 200;" 2>&1

echo; echo "=== COUNTS signup_pending total ==="
sqlite3 "$DB" "SELECT COUNT(*) FROM signup_pending;" 2>&1

echo; echo "=== INTENSA-API LOG FILES ==="
ls -la /root/.pm2/logs/ 2>&1 | grep -i intensa

echo; echo "=== LOG: signup endpoint hits last 7d (out+err) ==="
for f in /root/.pm2/logs/intensa-api-out.log /root/.pm2/logs/intensa-api-error.log; do
  echo "--- $f ---"
  [ -f "$f" ] && wc -l "$f"
done

echo; echo "=== LOG grep: POST /signup paths (counts) ==="
cat /root/.pm2/logs/intensa-api-out.log 2>/dev/null | grep -aiE "signup/(start|verify)|/checkout|webhook" | tail -300

echo; echo "=== DONE ==="
