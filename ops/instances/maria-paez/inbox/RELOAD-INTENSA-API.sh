#!/bin/bash
cd /root/secretaria
echo "== TURNSTILE_SECRET_KEY configurado? (sin imprimir valor) =="
grep -q "^TURNSTILE_SECRET_KEY=" /root/secretaria/.env-intensa-api && echo "SÍ está seteado" || echo "⚠️ NO está en .env-intensa-api — el captcha se SALTEA (dev mode)"
echo ""
echo "== reload intensa-api (aplica migración reenviado_en) =="
pm2 reload ecosystem.config.js --only intensa-api --update-env 2>&1 | tail -3
sleep 6
echo ""
echo "== migración corrió? (log) =="
pm2 logs intensa-api --lines 40 --nostream 2>/dev/null | grep -iE "migración|reenviado_en|escuchando|instancias activas|error" | tail -10
echo ""
echo "== health =="
curl -s http://127.0.0.1:4080/health 2>&1 | head -c 200
echo ""
echo "== columna reenviado_en en la DB? =="
CDB="${CONTROL_DB:-/root/secretaria/state/control/control.sqlite}"
sqlite3 "$CDB" "PRAGMA table_info(signup_pending);" 2>&1 | grep -i reenviado || echo "(no aparece)"
