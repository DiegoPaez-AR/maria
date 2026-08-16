#!/bin/bash
L=/var/log/nginx/intensa.io.access.log
echo "── hits a wa-maria en intensa.io.access.log ──"
grep "wa-maria" "$L" 2>/dev/null | tail -12 | sed -E 's/^([0-9.a-f:]+) .*\[([^]]+)\] "([A-Z]+) ([^"]{0,50})[^"]*" ([0-9]+).*/\2 | ip:\1 | \3 → \5/'
echo "── total pendiente.txt ──"; grep -c "pendiente.txt" "$L"
echo "── total POST al hook (recepción) ──"; grep -cE "POST /hooks/wa-maria" "$L"
echo LISTO
