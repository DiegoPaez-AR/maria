#!/bin/bash
echo "═══ DNS intensa.io ═══"
IP=$(dig +short intensa.io @1.1.1.1 | head -1)
echo "intensa.io → $IP"
[ "$IP" = "178.104.166.91" ] && echo "✓ propagó" || echo "✗ aún no (esperando 178.104.166.91)"

echo ""
echo "═══ pm2 maria-paez status ═══"
pm2 jlist 2>/dev/null | python3 -c 'import sys,json; d=[x for x in json.load(sys.stdin) if x["name"]=="maria-paez"]; r=d[0] if d else None; print("pid:", r["pid"], "status:", r["pm2_env"]["status"], "restart_time:", r["pm2_env"]["restart_time"]) if r else print("no encontrado")'

echo ""
echo "═══ ¿pulleó el log de diag? (grep en executor cargado) ═══"
grep -c "DIAG vcard" /root/secretaria/whatsapp-handler.js
