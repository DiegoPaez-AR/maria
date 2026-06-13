#!/bin/bash
echo "== SPF (intensa.io TXT)"
dig +short intensa.io TXT @8.8.8.8 2>&1
echo "== DKIM (google._domainkey.intensa.io TXT)"
dig +short google._domainkey.intensa.io TXT @8.8.8.8 2>&1
echo "== DMARC"
dig +short _dmarc.intensa.io TXT @8.8.8.8 2>&1
