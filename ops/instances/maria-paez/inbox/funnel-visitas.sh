#!/bin/bash
set +e
echo "=== nginx log files ==="
ls -la /var/log/nginx/ 2>&1 | grep -iE "access" 

# juntar logs (current + rotados sin comprimir + gz), todo a stdout
collect(){
  for f in /var/log/nginx/access.log /var/log/nginx/access.log.1; do
    [ -f "$f" ] && cat "$f"
  done
  for g in /var/log/nginx/access.log.*.gz; do
    [ -f "$g" ] && zcat "$g"
  done
}

echo; echo "=== muestra: lineas que mencionan signup (ultimas 15) ==="
collect | grep -aiE "signup" | tail -15

echo; echo "=== paths GET con 'signup' (conteo por path exacto, todo el log) ==="
collect | grep -aoE '"GET [^"? ]*signup[^"? ]*' | sed 's/"GET //' | sort | uniq -c | sort -rn | head -30

# ventana ultimos 7 dias: 23..30 Jun 2026
WIN='\[(2[3-9]|30)/Jun/2026'

echo; echo "=== VISITAS a la PAGINA signup (HTML) en ventana 23-30 Jun ==="
echo "--- hits a /maria/signup/ (HTML, excluye assets) ---"
collect | grep -aE "$WIN" | grep -aE 'GET /maria/signup/?( |[?])' | grep -avE '\.(css|js|png|jpg|jpeg|svg|ico|woff2?|map)' | wc -l
echo "--- IPs unicas que vieron la pagina signup ---"
collect | grep -aE "$WIN" | grep -aE 'GET /maria/signup/?( |[?])' | grep -avE '\.(css|js|png|jpg|svg|ico|woff)' | awk '{print $1}' | sort -u | wc -l

echo; echo "=== por dia (HTML signup, ventana) ==="
collect | grep -aE "$WIN" | grep -aE 'GET /maria/signup/?( |[?])' | grep -avE '\.(css|js|png|jpg|svg|ico|woff)' | grep -aoE '\[[0-9]{2}/Jun/2026' | sort | uniq -c

echo; echo "=== VISITAS sin bots (UA conocidos) en ventana ==="
collect | grep -aE "$WIN" | grep -aE 'GET /maria/signup/?( |[?])' | grep -avE '\.(css|js|png|jpg|svg|ico|woff)' | grep -aivE 'bot|spider|crawl|slurp|bingpreview|facebookexternal|headless|curl|wget|python-requests|monitor|uptime|pingdom|gtmetrix|lighthouse' | wc -l

echo; echo "=== top User-Agents que vieron signup (ventana) ==="
collect | grep -aE "$WIN" | grep -aE 'GET /maria/signup/?( |[?])' | grep -avE '\.(css|js|png|jpg|svg|ico|woff)' | grep -aoE '"[^"]*"$' | sort | uniq -c | sort -rn | head -10

echo; echo "=== tambien: landing intensa.io/maria/ (home) en ventana ==="
collect | grep -aE "$WIN" | grep -aE 'GET /maria/?( |[?])' | grep -avE 'signup|cuenta|/api/|\.(css|js|png|jpg|svg|ico|woff|map)' | wc -l
echo "=== DONE ==="
