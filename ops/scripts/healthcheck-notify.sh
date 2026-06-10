#!/bin/bash
# ops/scripts/healthcheck-notify.sh — corre cada 5 min desde crontab.
#
# Por cada instancia: ejecuta ops/healthcheck.sh y, si algun check falla,
# avisa al owner de ESA instancia por WhatsApp via internal-api local.
# Dedup: maximo un aviso cada 6h por instancia mientras siga fallando
# (stamp en /tmp). Cuando se recupera, manda un aviso de recuperacion y
# limpia el stamp. Si el WA no sale (ej. WA caido o sin internal-api),
# deja la alerta en ops/instances/<slug>/snapshots/HEALTHCHECK-ALERT.json,
# que el cron-master pushea al repo (visible desde afuera).

set -u
shopt -s nullglob
cd /root/secretaria || exit 1

DEDUP_S=21600  # 6h

for cf in config/instances/*.conf; do
  slug=$(basename "$cf" .conf)
  override=$(grep -E '^ASISTENTE_SLUG=' "$cf" | head -1 | cut -d= -f2- | tr -d '"')
  [ -n "$override" ] && slug="$override"
  STAMP=/tmp/maria-hc-alert-$slug

  OUT=$(ASISTENTE_SLUG=$slug bash ops/healthcheck.sh 2>/dev/null)
  RC=$?

  if [ $RC -eq 0 ]; then
    # Recuperado: si veniamos alertando, avisar y limpiar.
    if [ -f "$STAMP" ]; then
      rm -f "$STAMP"
      (
        set -a; . "$cf"; set +a
        [ -z "${ASISTENTE_INTERNAL_PORT:-}" ] && exit 0
        OWNER=$(python3 - "${MARIA_DB:-/root/secretaria/state/$slug/db/maria.sqlite}" <<'PYEOF'
import sqlite3, sys
try:
    db = sqlite3.connect(sys.argv[1])
    r = db.execute("SELECT COALESCE(wa_cus, wa_lid) FROM usuarios WHERE rol='owner' AND activo=1 LIMIT 1").fetchone()
    print(r[0] if r and r[0] else "")
except Exception:
    print("")
PYEOF
)
        [ -z "$OWNER" ] && exit 0
        BODY="healthcheck $slug: recuperado, todos los checks OK"
        curl -s -m 10 -X POST "http://127.0.0.1:${ASISTENTE_INTERNAL_PORT}/send-wa" \
          -H "x-intensa-secret: ${ASISTENTE_INTERNAL_SECRET:-}" \
          -H 'Content-Type: application/json' \
          -d "{\"to\":\"$OWNER\",\"body\":\"$BODY\"}" >/dev/null
      )
      rm -f "ops/instances/$slug/snapshots/HEALTHCHECK-ALERT.json" 2>/dev/null
    fi
    continue
  fi

  # Fallo. Dedup por edad del stamp.
  if [ -f "$STAMP" ]; then
    AGE=$(( $(date +%s) - $(stat -c %Y "$STAMP") ))
    [ "$AGE" -lt "$DEDUP_S" ] && continue
  fi
  touch "$STAMP"

  FAILS=$(echo "$OUT" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    bad = [k for k, v in d.get("checks", {}).items() if v.get("ok") is False]
    print(", ".join(bad) if bad else "desconocido")
except Exception:
    print("healthcheck no devolvio JSON")
' 2>/dev/null)
  echo "[hc-notify] $slug FALLO: $FAILS"

  # Persistir alerta donde el cron-master la pushea (visible desde el repo).
  mkdir -p "ops/instances/$slug/snapshots"
  echo "$OUT" > "ops/instances/$slug/snapshots/HEALTHCHECK-ALERT.json"

  # Aviso por WA al owner de la instancia.
  (
    set -a; . "$cf"; set +a
    [ -z "${ASISTENTE_INTERNAL_PORT:-}" ] && { echo "[hc-notify] $slug sin internal-api, solo alerta en snapshots"; exit 0; }
    OWNER=$(python3 - "${MARIA_DB:-/root/secretaria/state/$slug/db/maria.sqlite}" <<'PYEOF'
import sqlite3, sys
try:
    db = sqlite3.connect(sys.argv[1])
    r = db.execute("SELECT COALESCE(wa_cus, wa_lid) FROM usuarios WHERE rol='owner' AND activo=1 LIMIT 1").fetchone()
    print(r[0] if r and r[0] else "")
except Exception:
    print("")
PYEOF
)
    [ -z "$OWNER" ] && { echo "[hc-notify] $slug sin owner WA en DB"; exit 0; }
    BODY="ALERTA healthcheck $slug: fallaron: $FAILS. Detalle en ops/instances/$slug/snapshots/HEALTHCHECK-ALERT.json"
    HTTP=$(curl -s -m 10 -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:${ASISTENTE_INTERNAL_PORT}/send-wa" \
      -H "x-intensa-secret: ${ASISTENTE_INTERNAL_SECRET:-}" \
      -H 'Content-Type: application/json' \
      -d "{\"to\":\"$OWNER\",\"body\":\"$BODY\"}")
    echo "[hc-notify] $slug aviso WA al owner: HTTP $HTTP"
  )
done
