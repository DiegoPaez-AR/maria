#!/bin/bash
echo "── ¿el teléfono está polleando? (últimos 3 hits) ──"
grep "pendiente.txt" /var/log/nginx/intensa.io.access.log | tail -3 | sed -E 's/.*\[([^]]+)\].*/  \1/'
echo "hora VPS: $(date '+%d/%b/%Y:%H:%M:%S')"
echo "── ¿hay logs de v4.1? ──"
grep "\[MB v4" ~/.pm2/logs/maria-paez-out.log | tail -5 || echo "  (ninguno)"
echo "── último log MB de cualquier versión ──"
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | tail -3
echo LISTO
