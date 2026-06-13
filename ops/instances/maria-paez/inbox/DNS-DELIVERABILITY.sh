#!/bin/bash
# Diagnóstico deliverability intensa.io — SPF/DKIM/DMARC/MX
for q in "intensa.io TXT" "_dmarc.intensa.io TXT" "google._domainkey.intensa.io TXT" "intensa.io MX"; do
  set -- $q
  echo "== $1 $2"
  dig +short "$1" "$2" 2>&1
done
echo "== selector default._domainkey"
dig +short default._domainkey.intensa.io TXT 2>&1
echo "== headers de un mail reciente enviado (si hay logs)"
echo "(n/a - revisar en gmail)"
