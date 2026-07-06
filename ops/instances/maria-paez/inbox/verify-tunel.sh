#!/bin/bash
echo "── ¿SOCKS vivo en 1080? ──"
ss -ltnp 2>/dev/null | grep 1080 || echo "puerto 1080 NO está escuchando"
echo "── IP de salida por el túnel ──"
IP_TUNEL=$(curl -s -m 15 --socks5-hostname 127.0.0.1:1080 https://ifconfig.me 2>/dev/null)
echo "por el túnel: ${IP_TUNEL:-FALLO}"
IP_VPS=$(curl -s -m 10 https://ifconfig.me)
echo "directa VPS:  $IP_VPS"
echo "── geo del túnel ──"
[ -n "$IP_TUNEL" ] && curl -s -m 10 --socks5-hostname 127.0.0.1:1080 "http://ip-api.com/line/?fields=country,regionName,city,isp" 2>/dev/null
# si el túnel anda y muestra Argentina → dejar WA_PROXY configurado
if [ -n "$IP_TUNEL" ] && [ "$IP_TUNEL" != "$IP_VPS" ]; then
  if ! grep -q '^WA_PROXY=' /root/secretaria/config/secrets.conf; then
    printf '\n# ── WA_PROXY (túnel SSH inverso desde la Mac de Diego — IP argentina p/ Chromium de WA) ──\n# Si el túnel muere, el guard del boot NO conecta WA (no sale por Alemania).\nWA_PROXY=socks5://127.0.0.1:1080\n' >> /root/secretaria/config/secrets.conf
    echo "WA_PROXY agregado a secrets.conf"
  else
    echo "WA_PROXY ya estaba en secrets.conf"
  fi
fi
echo LISTO
