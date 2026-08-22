#!/bin/bash
echo "hora VPS: $(date '+%H:%M %Z')"
echo "── polls del teléfono (últimos 3) ──"
grep "pendiente.txt" /var/log/nginx/intensa.io.access.log | tail -3 | sed -E 's/.*\[([^]]+)\].*/  \1/'
echo "── últimos logs MB ──"
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | tail -4
