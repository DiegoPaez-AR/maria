#!/bin/bash
IP=$(curl -s -m 12 --socks5-hostname 127.0.0.1:1080 https://ifconfig.me 2>/dev/null)
echo "túnel: ${IP:-CAÍDO}"
[ -n "$IP" ] && curl -s -m 10 --socks5-hostname 127.0.0.1:1080 -o /dev/null -w "latencia via túnel: %{time_total}s\n" https://web.whatsapp.com 2>/dev/null
echo LISTO
