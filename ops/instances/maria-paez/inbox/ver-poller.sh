#!/bin/bash
echo "── requests al hook wa-maria en el último minuto (nginx) ──"
grep "wa-maria" /var/log/nginx/access.log 2>/dev/null | tail -8 | sed -E 's/^([0-9.]+) .*\[([^]]+)\] "([A-Z]+) ([^ ?]+)[^"]*" ([0-9]+).*/\2 | \1 | \3 \4 → \5/'
echo "── total de hits a pendiente.txt (últimas 200 líneas) ──"
grep -c "pendiente.txt" <(tail -200 /var/log/nginx/access.log 2>/dev/null)
echo LISTO
