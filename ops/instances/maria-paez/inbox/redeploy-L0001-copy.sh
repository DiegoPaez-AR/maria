#!/bin/bash
set -u
cd /root/secretaria
git fetch -q origin main
echo "═══ deploy.sh ═══"
bash ops/sites/intensa.io/deploy.sh 2>&1 | tail -25

echo ""
echo "═══ verificar nuevas frases en HTML servido ═══"
HTML=$(curl -sk "https://intensa.io/L0001/")
echo "$HTML" | grep -oE "Maria escribe por vos|escribe desde su propia cuenta|Nunca toca tu inbox|coordina con tus terceros" | sort -u
echo ""
echo "Frases viejas que deberían estar AUSENTES:"
echo "$HTML" | grep -oE "Email gestionado|contesta mails|tu mail y tus contactos|del email mientras" | sort -u || echo "  (none — limpio)"
