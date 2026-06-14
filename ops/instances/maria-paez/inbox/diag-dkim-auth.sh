#!/bin/bash
set +e
D="google._domainkey.intensa.io"
echo "== NS autoritativos de intensa.io =="
dig +short NS intensa.io
echo ""
echo "== DKIM segun ns73.domaincontrol.com (autoritativo, sin cache) =="
dig +short TXT "$D" @ns73.domaincontrol.com | tr -d '"' | tr -d ' '
echo ""
echo "== DKIM segun ns74.domaincontrol.com (autoritativo, sin cache) =="
dig +short TXT "$D" @ns74.domaincontrol.com | tr -d '"' | tr -d ' '
echo ""
echo "== DKIM segun Google Public DNS (8.8.8.8, con cache) =="
dig +short TXT "$D" @8.8.8.8 | tr -d '"' | tr -d ' '
echo ""
echo "== marcador esperado (Google) debe contener: CgKCAQEAuVdYUbw6yeidInht =="
echo "== marcador viejo (a descartar)         contiene: CgKCAQEAlJLhxFsbSOo7   =="
