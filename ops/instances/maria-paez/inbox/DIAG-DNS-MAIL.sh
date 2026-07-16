#!/bin/bash
echo "== MX intensa.io =="
dig +short MX intensa.io
echo "== SPF/TXT =="
dig +short TXT intensa.io | head -4
echo "== NS =="
dig +short NS intensa.io
echo "== test SMTP al MX principal (conexión) =="
MX=$(dig +short MX intensa.io | sort -n | head -1 | awk '{print $2}')
echo "MX principal: $MX"
timeout 10 bash -c "echo QUIT | nc -w 5 ${MX%.} 25" 2>&1 | head -3
