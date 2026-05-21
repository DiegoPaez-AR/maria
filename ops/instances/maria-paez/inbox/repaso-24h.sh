#!/bin/bash
# Repaso de las ultimas 24h: logs pm2 + estado DB.
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"
NOW=$(date '+%Y-%m-%d %H:%M:%S')
CUTOFF=$(date -d '24 hours ago' '+%Y-%m-%d %H:%M:%S')
echo "AHORA=$NOW   VENTANA desde=$CUTOFF"
echo

# --- ubicar log de pm2 ---
OUT=$(pm2 jlist 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);const m=j.find(p=>p.name==="maria-paez");console.log((m&&m.pm2_env&&m.pm2_env.pm_out_log_path)||"")}catch(e){console.log("")}})')
[ -z "$OUT" ] || [ ! -f "$OUT" ] && OUT="/root/.pm2/logs/maria-paez-out.log"
ERR="${OUT/-out.log/-error.log}"
echo "log out: $OUT  ($(wc -l < "$OUT" 2>/dev/null) lineas totales)"
echo

# --- recortar a 24h ---
TMP24=/tmp/repaso-log24.txt
awk -v c="$CUTOFF" 'match($0,/[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}/){t=substr($0,RSTART,RLENGTH); if(t>=c) print}' "$OUT" > "$TMP24"
echo "=== lineas de log en la ventana 24h: $(wc -l < "$TMP24") ==="
echo

echo "--- BOOTS / RESTARTS / SIGINT ---"
grep -E "iniciando|SIGINT|SIGTERM" "$TMP24" | sed 's/^[0-9|]*|maria-pa | //' || echo "(ninguno)"
echo
echo "--- ERRORES / WARNINGS ---"
grep -iE "error|fallo|fail|exception|throw|undefined|cannot|unhandled|rejected|crash" "$TMP24" | sed 's/^[0-9|]*|maria-pa | //' | head -40
echo "(total errores/warn: $(grep -icE "error|fallo|fail|exception|throw|undefined|cannot|unhandled|rejected|crash" "$TMP24"))"
echo
echo "--- WA: desconexiones / auth / change_state ---"
grep -E "disconnected|auth_failure|\[WA boot\]|change_state|WA ready" "$TMP24" | sed 's/^[0-9|]*|maria-pa | //' | head -30
echo
echo "--- [WA lid-resolve] (fix de identidad de ayer) ---"
grep -E "WA lid-resolve" "$TMP24" | sed 's/^[0-9|]*|maria-pa | //' || echo "(ningun mensaje @lid entrante en 24h)"
echo
echo "--- MORNING-BRIEF (envios de hoy) ---"
grep -E "morning-brief" "$TMP24" | sed 's/^[0-9|]*|maria-pa | //' | head -30
echo
echo "--- VOLUMEN DE MENSAJES ---"
echo "WA entrantes:  $(grep -cE "\[WA <-\]|\[WA .-\]" "$TMP24")"
grep -cE "\[WA " "$TMP24" | xargs echo "lineas [WA *]:"
echo "  (in)  [WA <-]:  $(grep -cF '[WA ←]' "$TMP24")"
echo "  (out) [WA ->]:  $(grep -cF '[WA →' "$TMP24")"
echo "  GMAIL lineas:   $(grep -cF '[GMAIL' "$TMP24")"
echo "  meeting-prep:   $(grep -c 'meeting-prep' "$TMP24")"
echo "  programados despachados: $(grep -cE 'programados\].*despachando|programados\] .' "$TMP24")"
echo
echo "=== DB: eventos ultimas 24h ==="
sqlite3 -header -column "$DB" "SELECT canal, direccion, COUNT(*) n FROM eventos WHERE timestamp >= datetime('now','-24 hours') GROUP BY canal,direccion ORDER BY n DESC;"
echo
echo "total eventos 24h: $(sqlite3 "$DB" "SELECT COUNT(*) FROM eventos WHERE timestamp >= datetime('now','-24 hours');")"
echo "rango: $(sqlite3 "$DB" "SELECT MIN(timestamp)||' .. '||MAX(timestamp) FROM eventos WHERE timestamp >= datetime('now','-24 hours');")"
echo
echo "=== claude_call: latencia (ms) en 24h ==="
sqlite3 "$DB" "SELECT 'n='||COUNT(*)||'  prom='||CAST(AVG(CAST(substr(cuerpo,instr(cuerpo,': ')+2) AS INTEGER)) AS INT)||'ms  max='||MAX(CAST(substr(cuerpo,instr(cuerpo,': ')+2) AS INTEGER))||'ms' FROM eventos WHERE timestamp >= datetime('now','-24 hours') AND cuerpo LIKE 'claude_call%';"
echo
echo "=== usuarios: brief_activo (confirmar Santiago=0) ==="
sqlite3 -header -column "$DB" "SELECT id,nombre,brief_activo FROM usuarios WHERE activo=1 ORDER BY id;"
echo
echo "=== eventos de seguridad 24h (si hay) ==="
sqlite3 "$DB" "SELECT COUNT(*) FROM eventos WHERE timestamp >= datetime('now','-24 hours') AND (cuerpo LIKE '%injection%' OR cuerpo LIKE '%rate_limit%' OR cuerpo LIKE '%seguridad%');" 2>/dev/null
