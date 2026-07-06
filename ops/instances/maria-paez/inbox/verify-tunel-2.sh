#!/bin/bash
IP=$(curl -s -m 15 --socks5-hostname 127.0.0.1:1080 https://ifconfig.me 2>/dev/null)
echo "túnel (launchd): ${IP:-FALLO}"
[ -n "$IP" ] && curl -s -m 10 --socks5-hostname 127.0.0.1:1080 "http://ip-api.com/line/?fields=country,isp" 2>/dev/null
echo LISTO
