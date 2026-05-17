#!/bin/bash
echo "═══ DNS desde el VPS ═══"
echo "intensa.io:"
dig +short intensa.io @1.1.1.1
dig +short intensa.io @8.8.8.8
echo ""
echo "www.intensa.io:"
dig +short www.intensa.io @1.1.1.1
dig +short www.intensa.io @8.8.8.8
echo ""
echo "═══ ¿Apunta al VPS (178.104.166.91)? ═══"
IP_VPS="178.104.166.91"
for host in intensa.io www.intensa.io; do
  IP=$(dig +short $host @1.1.1.1 | head -1)
  if [ "$IP" = "$IP_VPS" ]; then
    echo "  $host → $IP ✓"
  else
    echo "  $host → ${IP:-(sin respuesta)} ✗ (esperando $IP_VPS)"
  fi
done
