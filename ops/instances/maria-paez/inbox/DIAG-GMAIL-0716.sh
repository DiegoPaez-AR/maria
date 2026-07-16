#!/bin/bash
DB="${MARIA_DB:?falta MARIA_DB}"
echo "== gmail por día/dirección últimos 8 días =="
sqlite3 "$DB" "SELECT date(timestamp), direccion, COUNT(*) FROM eventos WHERE canal='gmail' AND timestamp > datetime('now','-8 days') GROUP BY 1,2 ORDER BY 1 DESC;"
echo "== último gmail entrante =="
sqlite3 "$DB" "SELECT timestamp, de, substr(cuerpo,1,60) FROM eventos WHERE canal='gmail' AND direccion='entrante' ORDER BY id DESC LIMIT 3;"
echo "== healthcheck oauth ahora =="
cd /root/secretaria && set -a; . config/instances/maria-paez.conf 2>/dev/null; . config/secrets.conf 2>/dev/null; set +a
node -e "require('/root/secretaria/google').autenticar().then(()=>console.log('OAuth OK')).catch(e=>console.log('OAuth FALLO:', e.message))" 2>&1 | tail -2
echo "== logs gmail-handler hoy =="
grep -a "$(date +%Y-%m-%d)" /root/.pm2/logs/maria-paez-*.log 2>/dev/null | grep -aiE "gmail|inbox|poll" | tail -6
