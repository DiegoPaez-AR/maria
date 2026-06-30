#!/bin/bash
set +e
DB=/root/secretaria/state/control/control.sqlite
Q(){ sqlite3 "$DB" "$1" 2>&1; }
echo "=== NOW (server local) ==="; date +"%Y-%m-%d %H:%M:%S %z"
echo "=== CUTOFF 7d ==="; sqlite3 "$DB" "SELECT datetime('now','-7 days');"

echo; echo "### SIGNUP_PENDING (todo el historico) ###"
echo "total_rows|email_verif|wa_verif|ambos_verif|token_emitido"
Q "SELECT COUNT(*), SUM(email_verified), SUM(wa_verified), SUM(email_verified=1 AND wa_verified=1), SUM(signup_token IS NOT NULL) FROM signup_pending;"

echo; echo "### SIGNUP_PENDING ultimos 7d (por creado) ###"
echo "iniciados|email_verif|wa_verif|ambos|token|terminos"
Q "SELECT COUNT(*), SUM(email_verified), SUM(wa_verified), SUM(email_verified=1 AND wa_verified=1), SUM(signup_token IS NOT NULL), SUM(terminos_aceptados_en IS NOT NULL) FROM signup_pending WHERE creado >= datetime('now','-7 days');"

echo; echo "### SIGNUP_PENDING filas 7d (detalle sin codigos) ###"
sqlite3 -header -column "$DB" "SELECT id, substr(email,1,18) email, email_verified ev, wa_verified wv, (signup_token IS NOT NULL) tok, creado, reenviado_en, idioma FROM signup_pending WHERE creado >= datetime('now','-14 days') ORDER BY id DESC;"

echo; echo "### CLIENTES (todo) por estado ###"
Q "SELECT estado, COUNT(*) FROM clientes GROUP BY estado;"
echo "### CLIENTES creados ultimos 7d ###"
Q "SELECT COUNT(*) FROM clientes WHERE creado >= datetime('now','-7 days');"
echo "### CLIENTES detalle ###"
sqlite3 -header -column "$DB" "SELECT id, substr(nombre,1,14) nombre, estado, instancia_slug, (lemon_subscription_id IS NOT NULL) lemon, (stripe_subscription_id IS NOT NULL) stripe, creado FROM clientes ORDER BY id DESC LIMIT 30;"

echo; echo "### WEBHOOK_EVENTS por tipo (todo) ###"
sqlite3 -column "$DB" "SELECT event_name, COUNT(*) FROM webhook_events GROUP BY event_name ORDER BY 2 DESC;"
echo "### WEBHOOK_EVENTS ultimos 7d por tipo ###"
sqlite3 -column "$DB" "SELECT event_name, COUNT(*) FROM webhook_events WHERE creado >= datetime('now','-7 days') GROUP BY event_name ORDER BY 2 DESC;" 2>&1

echo; echo "### INTENSA-API LOGS: lineas totales ###"
wc -l /root/.pm2/logs/intensa-api-out.log 2>&1
echo "### grep endpoints (todo el log, conteo por tipo) ###"
LOG=/root/.pm2/logs/intensa-api-out.log
echo -n "signup/start: "; grep -aciE "signup/start" "$LOG" 2>/dev/null
echo -n "signup/verify: "; grep -aciE "signup/verify" "$LOG" 2>/dev/null
echo -n "signup/resend|reenviar: "; grep -aciE "signup/(resend|reenviar)" "$LOG" 2>/dev/null
echo -n "checkout: "; grep -aciE "checkout" "$LOG" 2>/dev/null
echo -n "webhook: "; grep -aciE "/webhook" "$LOG" 2>/dev/null
echo "### muestra de lineas de request (ultimas 40 con metodo HTTP) ###"
grep -aE "(GET|POST) /" "$LOG" 2>/dev/null | tail -40
echo "=== DONE ==="
