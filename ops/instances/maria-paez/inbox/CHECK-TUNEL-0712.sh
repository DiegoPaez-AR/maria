#!/bin/bash
ss -tlnp | grep -q 1080 && echo "puerto 1080: escucha" || echo "puerto 1080: NO ESCUCHA"
IP=$(curl -s -m 10 --socks5 127.0.0.1:1080 https://api.ipify.org || echo FALLO)
echo "egreso socks5: $IP"
ps -o pid,etime -C sshd | tail -2
echo "wa-apagado: $(ls /root/secretaria/state/maria-paez/wa-apagado 2>/dev/null || echo 'no está')"
