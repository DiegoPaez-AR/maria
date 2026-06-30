#!/bin/bash
set +e
collect(){
  for f in /var/log/nginx/intensa.io.access.log /var/log/nginx/intensa.io.access.log.1; do
    [ -f "$f" ] && cat "$f"
  done
  for g in /var/log/nginx/intensa.io.access.log.*.gz; do
    [ -f "$g" ] && zcat "$g"
  done
}
echo "=== total lineas intensa.io (todos los logs) ==="; collect | wc -l

echo; echo "=== paths GET unicos que contienen 'signup' o '/maria' (top 40) ==="
collect | grep -aoE 'GET [^"? ]*' | sed 's/GET //' | grep -aiE 'signup|^/maria' | sort | uniq -c | sort -rn | head -40

echo; echo "=== muestra lineas signup (15) ==="
collect | grep -aiE 'signup' | tail -15

WIN='\[(2[3-9]|30)/Jun/2026'
PAGE='GET (/maria)?/signup/?( |[?])'

echo; echo "=== VISITAS pagina signup (HTML) ventana 23-30 Jun ==="
collect | grep -aE "$WIN" | grep -aE "$PAGE" | grep -avE '\.(css|js|png|jpg|jpeg|svg|ico|woff2?|map)' | wc -l
echo "--- IPs unicas ---"
collect | grep -aE "$WIN" | grep -aE "$PAGE" | grep -avE '\.(css|js|png|jpg|svg|ico|woff)' | awk '{print $1}' | sort -u | wc -l
echo "--- sin bots ---"
collect | grep -aE "$WIN" | grep -aE "$PAGE" | grep -avE '\.(css|js|png|jpg|svg|ico|woff)' | grep -aivE 'bot|spider|crawl|slurp|facebookexternal|headless|curl|wget|python-requests|scanner|monitor|uptime|pingdom|lighthouse|TLM-Audit' | wc -l
echo "--- por dia ---"
collect | grep -aE "$WIN" | grep -aE "$PAGE" | grep -avE '\.(css|js|png|jpg|svg|ico|woff)' | grep -aoE '\[[0-9]{2}/Jun/2026' | sort | uniq -c
echo "--- top UA ---"
collect | grep -aE "$WIN" | grep -aE "$PAGE" | grep -avE '\.(css|js|png|jpg|svg|ico|woff)' | grep -aoE '"[^"]*"$' | sort | uniq -c | sort -rn | head -8
echo "--- detalle lineas pagina signup en ventana (todas) ---"
collect | grep -aE "$WIN" | grep -aE "$PAGE" | grep -avE '\.(css|js|png|jpg|svg|ico|woff)'

echo; echo "=== Home /maria/ (landing) ventana ==="
collect | grep -aE "$WIN" | grep -aE 'GET /maria/?( |[?])' | grep -avE 'signup|cuenta|/api/|\.(css|js|png|jpg|svg|ico|woff|map)' | wc -l
echo "=== DONE ==="
