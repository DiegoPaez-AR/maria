#!/bin/bash
echo "── hits a wa-maria (todas las líneas de hoy) ──"
grep "wa-maria" /var/log/nginx/access.log 2>/dev/null | tail -10 | sed -E 's/^([0-9.]+) .*\[([^]]+)\] "([A-Z]+) ([^"]{0,55})[^"]*" ([0-9]+).*/\2 | \1 | \3 → \5/'
echo "── total pendiente.txt en todo el log ──"
grep -c "pendiente.txt" /var/log/nginx/access.log 2>/dev/null
echo "── ¿hay OTRO access log? (a veces intensa.io tiene el suyo) ──"
ls -la /var/log/nginx/*.log 2>/dev/null | head
grep -rl "wa-maria" /var/log/nginx/ 2>/dev/null | head
echo LISTO
