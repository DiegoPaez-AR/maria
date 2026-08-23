#!/bin/bash
cd /root/secretaria
tail -6 /root/mariabridge-build.log 2>/dev/null
echo "--- json ---"
cat /var/www/intensa.io/_dl/mariabridge-latest.json 2>/dev/null
echo ""
echo LISTO
