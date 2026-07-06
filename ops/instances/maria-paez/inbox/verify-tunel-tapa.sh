#!/bin/bash
for i in 1 2 3; do
  IP=$(curl -s -m 12 --socks5-hostname 127.0.0.1:1080 https://ifconfig.me 2>/dev/null)
  echo "intento $i: ${IP:-sin respuesta}"
  [ -n "$IP" ] && break
  sleep 8
done
echo LISTO
