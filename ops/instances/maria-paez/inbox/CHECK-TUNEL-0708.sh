#!/bin/bash
echo "== puerto 1080 =="
ss -tlnp | grep 1080 || echo "NO ESCUCHA"
echo "== conexión ssh del túnel (edad) =="
ps -o pid,etime,cmd -C sshd | grep "sshd: root$" | tail -2
IP=$(curl -s -m 10 --socks5 127.0.0.1:1080 https://api.ipify.org || echo FALLO)
echo "egreso socks5: $IP"
echo "wa-apagado: $(ls /root/secretaria/state/maria-paez/wa-apagado 2>/dev/null || echo 'no está')"
