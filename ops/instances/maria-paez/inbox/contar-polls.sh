#!/bin/bash
M=$(date '+%d/%b/%Y:%H:%M' -d '2 minutes ago' 2>/dev/null || date '+%d/%b/%Y:%H:%M')
echo "polls de pendiente.txt por minuto (últimos 3 min):"
grep "pendiente.txt" /var/log/nginx/intensa.io.access.log | tail -60 | sed -E 's/.*\[([0-9]+\/[A-Za-z]+\/[0-9]+:[0-9]+:[0-9]+).*/\1/' | uniq -c | tail -4
echo "(esperado: ~12/min con POLL de 5s y un solo loop)"
echo LISTO
