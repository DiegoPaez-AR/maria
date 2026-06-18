#!/bin/bash
set +e
echo "== 1. deploy.sh (sincroniza /var/www con el fix del captcha) =="
bash /root/secretaria/ops/sites/intensa.io/deploy.sh 2>&1 | grep -iE "cache-bust|signup|done|error|reload nginx|active|HTTPS 200" | head
echo "  verif script.js servido tiene esperarTurnstileToken:"
grep -c "esperarTurnstileToken" /var/www/intensa.io/maria/signup/script.js
echo ""
echo "== 2. clientes en control DB (schema + santiago bien) =="
CTRL=/root/secretaria/state/control/control.sqlite
echo "-- columnas de clientes --"; sqlite3 "$CTRL" "PRAGMA table_info(clientes);" 2>/dev/null
echo "-- filas de santiago (email o wa con/sin 9) --"
sqlite3 -line "$CTRL" "SELECT * FROM clientes WHERE email LIKE '%santiago@paez.is%' OR wa LIKE '%64393520%';" 2>/dev/null | head -40
echo "-- total clientes + últimos 3 --"
sqlite3 "$CTRL" "SELECT COUNT(*) FROM clientes;" 2>/dev/null
sqlite3 -line "$CTRL" "SELECT * FROM clientes ORDER BY rowid DESC LIMIT 3;" 2>/dev/null | head -40
