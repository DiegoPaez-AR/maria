#!/bin/bash
# ops/healthcheck.sh — verificación standalone del estado de Maria.
#
# Pensado para correr:
#   - localmente en el VPS: `bash ops/healthcheck.sh`
#   - via cron externo / monitoring: el output JSON se puede consumir
#   - opcional, agendarlo en el cron del VPS: `*/5 * * * * cd /root/secretaria && bash ops/healthcheck.sh > /tmp/maria-healthcheck.json 2>/dev/null`
#
# Checks realizados:
#   1. pm2_online       — el proceso maria-paez está en estado "online"
#   2. snapshot_recent  — el último snapshot del cron es < 3 min atrás
#   3. db_writable      — la DB sqlite es writable y SELECT 1 anda
#   4. google_oauth     — el token de Google sigue válido (lista calendars)
#   5. vault            — si MARIA_VAULT_KEY está seteada, autoTest pasa
#
# Output: JSON a stdout. Exit code 0 si todos los checks pasaron, 1 si alguno
# falló. Cada check tiene su propio { "ok": bool, ...detalles } así podés
# diagnosticar qué falló sin parsear logs.
#
# Uso típico desde monitoring externo:
#   ssh root@vps 'cd /root/secretaria && bash ops/healthcheck.sh'
#   → exit 0 OK, exit 1 algo falló, JSON con detalles en stdout.

set +e

# ─── Cargar env de la instancia (default maria-paez si hay solo una) ──────
INSTANCE="${ASISTENTE_SLUG:-maria-paez}"
CONF="/root/secretaria/config/instances/${INSTANCE}.conf"
if [ -f "$CONF" ]; then
  set -a
  . "$CONF"
  set +a
fi

# Fallbacks por si el .conf no setea
MARIA_DB="${MARIA_DB:-/root/secretaria/state/${INSTANCE}/db/maria.sqlite}"
SNAPSHOT_DIR="/root/secretaria/ops/instances/${INSTANCE}/snapshots"

# ─── Acumulador de resultados ─────────────────────────────────────────────
OVERALL_OK=true
declare -A RESULTS_OK
declare -A RESULTS_DETAIL

_check() {
  local name="$1"
  local ok="$2"
  local detail="$3"
  RESULTS_OK[$name]="$ok"
  RESULTS_DETAIL[$name]="$detail"
  if [ "$ok" != "true" ]; then OVERALL_OK=false; fi
}

# ─── Check 1: pm2 online ──────────────────────────────────────────────────
PM2_INFO=$(pm2 jlist 2>/dev/null | python3 -c "
import json, sys
try:
    ps = json.load(sys.stdin)
    for p in ps:
        if p.get('name') != '${INSTANCE}': continue
        e = p.get('pm2_env', {})
        print(f\"{e.get('status','unknown')}|{p.get('pid','-')}|{e.get('restart_time',0)}\")
        sys.exit(0)
    print('not_found||')
except Exception as e:
    print(f'parse_error||{e}')
" 2>&1)

PM2_STATUS=$(echo "$PM2_INFO" | cut -d'|' -f1)
PM2_PID=$(echo "$PM2_INFO" | cut -d'|' -f2)
PM2_RESTARTS=$(echo "$PM2_INFO" | cut -d'|' -f3)

if [ "$PM2_STATUS" = "online" ]; then
  _check pm2_online true "{\"pid\":${PM2_PID:-0},\"restarts\":${PM2_RESTARTS:-0}}"
else
  _check pm2_online false "{\"status\":\"${PM2_STATUS}\"}"
fi

# ─── Check 2: snapshot reciente (cron del VPS escribió < 3 min atrás) ─────
SNAPSHOT_TS="${SNAPSHOT_DIR}/.timestamp"
if [ -f "$SNAPSHOT_TS" ]; then
  MTIME=$(stat -c %Y "$SNAPSHOT_TS" 2>/dev/null)
  NOW=$(date +%s)
  AGE=$((NOW - MTIME))
  if [ "$AGE" -lt 180 ]; then
    _check snapshot_recent true "{\"age_seconds\":${AGE}}"
  else
    _check snapshot_recent false "{\"age_seconds\":${AGE},\"hint\":\"cron-master.sh no está corriendo o falla\"}"
  fi
else
  _check snapshot_recent false "{\"error\":\"snapshot timestamp file missing\",\"path\":\"${SNAPSHOT_TS}\"}"
fi

# ─── Check 3: DB writable ─────────────────────────────────────────────────
if [ -f "$MARIA_DB" ] && [ -w "$MARIA_DB" ]; then
  if sqlite3 "$MARIA_DB" 'SELECT 1' >/dev/null 2>&1; then
    SIZE_KB=$(du -k "$MARIA_DB" | cut -f1)
    _check db_writable true "{\"path\":\"${MARIA_DB}\",\"size_kb\":${SIZE_KB}}"
  else
    _check db_writable false "{\"path\":\"${MARIA_DB}\",\"error\":\"SELECT 1 falló\"}"
  fi
else
  _check db_writable false "{\"path\":\"${MARIA_DB}\",\"error\":\"no existe o no writable\"}"
fi

# ─── Check 4: Google OAuth (token de Maria sigue válido) ──────────────────
GOOGLE_RESULT=$(cd /root/secretaria && timeout 20s node -e "
(async () => {
  try {
    const g = require('./google');
    const cals = await g.listarCalendarios();
    console.log(JSON.stringify({ ok: true, calendars: cals.length }));
  } catch (err) {
    console.log(JSON.stringify({ ok: false, error: err.message.slice(0,200) }));
    process.exit(1);
  }
})();
" 2>&1 | tail -1)

if echo "$GOOGLE_RESULT" | grep -q '"ok":true'; then
  _check google_oauth true "$GOOGLE_RESULT"
else
  _check google_oauth false "$GOOGLE_RESULT"
fi

# ─── Check 5: vault (si está configurado) ─────────────────────────────────
if [ -n "$MARIA_VAULT_KEY" ]; then
  VAULT_RESULT=$(cd /root/secretaria && timeout 10s node -e "
  const v = require('./vault');
  console.log(JSON.stringify(v.autoTest()));
  " 2>&1 | tail -1)
  if echo "$VAULT_RESULT" | grep -q '"ok":true'; then
    _check vault true "$VAULT_RESULT"
  else
    _check vault false "$VAULT_RESULT"
  fi
else
  RESULTS_OK[vault]="skipped"
  RESULTS_DETAIL[vault]="{\"reason\":\"MARIA_VAULT_KEY no seteada (vault no usado todavía)\"}"
fi

# ─── Output JSON ──────────────────────────────────────────────────────────
NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "{"
echo "  \"ts\": \"${NOW_ISO}\","
echo "  \"instance\": \"${INSTANCE}\","
echo "  \"overall_ok\": ${OVERALL_OK},"
echo "  \"checks\": {"
COMMA=""
for name in pm2_online snapshot_recent db_writable google_oauth vault; do
  ok="${RESULTS_OK[$name]}"
  detail="${RESULTS_DETAIL[$name]}"
  if [ "$ok" = "skipped" ]; then
    echo "    ${COMMA}\"${name}\": { \"ok\": \"skipped\", \"detail\": ${detail} }"
  else
    echo "    ${COMMA}\"${name}\": { \"ok\": ${ok}, \"detail\": ${detail} }"
  fi
  COMMA=","
done
echo "  }"
echo "}"

# Exit code: 0 si todos los checks pasaron, 1 si alguno falló (skipped no falla)
if [ "$OVERALL_OK" = "true" ]; then
  exit 0
else
  exit 1
fi
