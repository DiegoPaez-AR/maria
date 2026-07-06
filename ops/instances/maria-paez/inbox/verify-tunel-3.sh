#!/bin/bash
IP=$(curl -s -m 15 --socks5-hostname 127.0.0.1:1080 https://ifconfig.me 2>/dev/null)
echo "túnel: ${IP:-CAÍDO}"
ss -tnp 2>/dev/null | grep -c ":22.*ESTAB" 
echo LISTO
