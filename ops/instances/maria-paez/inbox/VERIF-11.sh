#!/bin/bash
echo "== logs de nginx existentes =="
ls /var/log/nginx/ | head -10
echo "== access_log configurado para intensa.io =="
grep -n "access_log" /etc/nginx/sites-available/intensa.io.conf || echo "(usa el default)"
echo "== buscar requests wa-maria en TODOS los logs =="
grep -h "wa-maria" /var/log/nginx/*.log 2>/dev/null | tail -8 | awk '{print $4, $6, $7, "->", $9}' | sed 's|/hooks/wa-maria/[A-Za-z0-9]*|...|'
