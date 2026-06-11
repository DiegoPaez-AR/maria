#!/bin/bash
set -u
C=/root/secretaria/state/control/control.sqlite
echo "== signup_pending =="
sqlite3 -line "$C" "SELECT id,nombre,email,wa,signup_token IS NOT NULL AS tok,creado,expira_en FROM signup_pending;"
echo "== clientes (ultimos 3) =="
sqlite3 -line "$C" "SELECT id,nombre,email,estado,creado FROM clientes ORDER BY id DESC LIMIT 3;"
echo "== out-log intensa-api de HOY =="
grep "2026-06-11" /root/.pm2/logs/intensa-api-out.log 2>/dev/null | tail -25
echo "== error-log de HOY =="
grep "2026-06-11" /root/.pm2/logs/intensa-api-error.log 2>/dev/null | tail -10
