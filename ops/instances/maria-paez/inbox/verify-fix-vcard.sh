#!/bin/bash
set +e
echo "═══ pm2 status ═══"
pm2 jlist 2>/dev/null | python3 -c 'import sys,json; d=[x for x in json.load(sys.stdin) if x["name"]=="maria-paez"]; r=d[0] if d else None; print("pid:", r["pid"], "status:", r["pm2_env"]["status"], "restart:", r["pm2_env"]["restart_time"]) if r else print("no encontrado")'

echo ""
echo "═══ Código vivo tiene el fix? ═══"
grep -c "_extraerVCards" /root/secretaria/whatsapp-handler.js
grep -c "_manejarVCards" /root/secretaria/whatsapp-handler.js
grep -c "ultimos_vcards" /root/secretaria/whatsapp-handler.js /root/secretaria/prompt-builder.js

echo ""
echo "═══ DIAG log removido? ═══"
grep -c "DIAG vcard" /root/secretaria/whatsapp-handler.js

echo ""
echo "═══ Boot log ═══"
pm2 logs maria-paez --lines 15 --nostream 2>&1 | tail -10
