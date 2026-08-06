#!/bin/bash
set -e
KEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHrldsrsguWXehWCDUfojfxid42EbI6R1vWcDxLdU3ty maria-tunel-oficina'
mkdir -p /root/.ssh && chmod 700 /root/.ssh
touch /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys
if grep -qF "AAAAC3NzaC1lZDI1NTE5AAAAIHrldsrsguWXehWCDUfojfxid42EbI6R1vWcDxLdU3ty" /root/.ssh/authorized_keys; then
  echo "clave ya autorizada"
else
  echo "$KEY" >> /root/.ssh/authorized_keys
  echo "clave AGREGADA"
fi
echo "== esperando que el túnel de la oficina conecte (30s) =="
sleep 30
echo "== puertos =="
ss -tlnp | grep -E ':1080|:2222' || echo "todavía no escuchan"
echo "== egreso por el SOCKS nuevo =="
curl -s -m 10 --socks5 127.0.0.1:1080 https://api.ipify.org || echo "SOCKS no responde aún"
echo
echo "== prueba SSH inverso al server de la oficina =="
timeout 8 bash -c 'echo | nc -w 5 127.0.0.1 2222' | head -1 || echo "puerto 2222 sin banner (¿túnel arriba?)"
