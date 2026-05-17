#!/bin/bash
set +e
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"

echo "═══ pm2 status ═══"
pm2 jlist 2>/dev/null | python3 -c 'import sys,json; d=[x for x in json.load(sys.stdin) if x["name"]=="maria-paez"]; r=d[0] if d else None; print("pid:", r["pid"], "restart:", r["pm2_env"]["restart_time"], "uptime_ms:", r["pm2_env"]["pm_uptime"]) if r else print("no")'

echo ""
echo "═══ ¿código vivo tiene el fix? ═══"
grep -n "_extraerVCards\|_manejarVCards" /root/secretaria/whatsapp-handler.js | head -5
grep -n "DIAG vcard" /root/secretaria/whatsapp-handler.js | head -3

echo ""
echo "═══ pm2 logs últimas 300 — Acerbo / Acero / Acevedo ═══"
pm2 logs maria-paez --lines 600 --nostream 2>&1 | grep -iE "acerbo|acero|acevedo|vcard|multi_vcard" | tail -50

echo ""
echo "═══ Eventos sistema 'contacto vcard' últimos 10 min ═══"
sqlite3 -header -column "$DB" "SELECT datetime(timestamp), substr(cuerpo,1,200) AS msg FROM eventos WHERE canal='sistema' AND cuerpo LIKE '%contacto vcard%' AND timestamp >= datetime('now','-10 minutes') ORDER BY timestamp ASC;"

echo ""
echo "═══ Eventos canal=whatsapp últimas 10 min (a Maria) ═══"
sqlite3 -header -column "$DB" "SELECT datetime(timestamp), direccion, tipo_original, substr(de,1,25) AS de, LENGTH(cuerpo) AS body_len, substr(cuerpo,1,80) AS body FROM eventos WHERE canal='whatsapp' AND timestamp >= datetime('now','-10 minutes') ORDER BY timestamp ASC LIMIT 20;"
