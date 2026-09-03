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

# ── A QUIÉN SE AVISA (decisión Diego 2026-09-03) ───────────────────────────
# Los avisos de salud son de OPERACIÓN: van SIEMPRE al operador (owner de la
# PRIMERA instancia, la "admin"), nunca al owner del cliente. Antes iban al
# owner de la DB de cada instancia: cuando Noelia pasó a owner de
# sofia-bruscoli, le llegó un "ALERTA healthcheck ... google_oauth" por mail.
OP_CF=$(ls config/instances/*.conf 2>/dev/null | head -1)
OP_OWNER=$(grep -E '^OWNER_WA=' "$OP_CF" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"')

# ── AUTO-RESCATE DEL CANAL DE DEPLOY (incidente 2026-08-22) ────────────────
# cron-master toma un flock global y, si un script del inbox se cuelga, retiene
# el lock para siempre: cero snapshots, cero inbox, cero outbox, en SILENCIO.
# Este healthcheck corre desde su propio crontab (fuera del lock), así que es
# el único que puede rescatarlo. Matamos cualquier tenedor del lock con más de
# 10 min de vida (un tick sano dura segundos). Los hijos heredan el fd, así que
# fuser los lista y caen con el padre.
for _p in $(fuser /tmp/maria-cron-master.lock 2>/dev/null); do
  _et=$(ps -o etimes= -p "$_p" 2>/dev/null | tr -d ' ')
  if [ -n "$_et" ] && [ "$_et" -gt 600 ]; then
    echo "[hc] cron-master colgado: pid $_p hace ${_et}s — lo mato para liberar el canal"
    kill -9 "$_p" 2>/dev/null
  fi
done


for cf in config/instances/*.conf; do
  slug=$(basename "$cf" .conf)
  override=$(grep -E '^ASISTENTE_SLUG=' "$cf" | head -1 | cut -d= -f2- | tr -d '"')
  [ -n "$override" ] && slug="$override"
  STAMP=/tmp/maria-hc-alert-$slug

  OUT=$(ASISTENTE_SLUG=$slug bash ops/healthcheck.sh 2>/dev/null)
  RC=$?

  SOFTSTAMP=/tmp/maria-hc-soft-$slug          # 1ª falla de plataforma (silenciosa)
  SOFTALERT=/tmp/maria-hc-soft-alerted-$slug  # ya avisamos que lleva 1h

  if [ $RC -eq 0 ]; then
    # Recuperado. Plataforma: si nunca llegó a la hora, se limpia en silencio.
    if [ -f "$SOFTSTAMP" ] && [ ! -f "$SOFTALERT" ]; then
      rm -f "$SOFTSTAMP"; rm -f "ops/instances/$slug/snapshots/HEALTHCHECK-ALERT.json" 2>/dev/null
      echo "[hc-notify] $slug falla de plataforma se curó sola antes de la hora — sin aviso"
    fi
    if [ -f "$SOFTALERT" ]; then rm -f "$SOFTSTAMP" "$SOFTALERT"; touch "$STAMP"; fi   # → cae al aviso de recuperación de abajo
    # Recuperado: si veniamos alertando, avisar y limpiar.
    if [ -f "$STAMP" ]; then
      rm -f "$STAMP"
      (
        set -a; . "$OP_CF"; . config/secrets.conf 2>/dev/null; set +a
        [ -z "${ASISTENTE_INTERNAL_PORT:-}" ] && exit 0
        OWNER="$OP_OWNER"
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

  FAILS=$(echo "$OUT" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    bad = [k for k, v in d.get("checks", {}).items() if v.get("ok") is False]
    print(", ".join(bad) if bad else "desconocido")
except Exception:
    print("healthcheck no devolvio JSON")
' 2>/dev/null)

  # ── DOS CLASES DE FALLA (decisión Diego 2026-09-03) ──────────────────────
  # PLATAFORMA (snapshot_recent = cron/GitHub; healthcheck que devuelve basura
  # una vez): fallan solas y se curan solas — NO se avisa hasta que lleve
  # SOFT_MIN minutos de corrido. PROPIAS (pm2, DB, OAuth, vault): aviso YA.
  SOFT_MIN=${MARIA_HC_PLATAFORMA_MIN:-60}
  HARD=$(echo "$FAILS" | tr ',' '\n' | sed 's/^ *//' | grep -vE '^(snapshot_recent|healthcheck no devolvio JSON|desconocido)$' | paste -sd, -)
  if [ -z "$HARD" ]; then
    # Solo plataforma. Marcar 1ª falla y esperar en silencio.
    [ -f "$SOFTSTAMP" ] || { touch "$SOFTSTAMP"; echo "[hc-notify] $slug falla de plataforma ($FAILS) — espero $SOFT_MIN min antes de avisar"; continue; }
    SOFTAGE=$(( ($(date +%s) - $(stat -c %Y "$SOFTSTAMP")) / 60 ))
    [ "$SOFTAGE" -lt "$SOFT_MIN" ] && continue
    [ -f "$SOFTALERT" ] && continue          # ya avisado, silencio hasta recuperar
    touch "$SOFTALERT"
    FAILS="$FAILS (viene fallando hace ${SOFTAGE} min — probablemente plataforma: GitHub/red; Maria puede estar perfectamente viva, pm2 está online)"
  else
    # Falla propia. Dedup por edad del stamp.
    if [ -f "$STAMP" ]; then
      AGE=$(( $(date +%s) - $(stat -c %Y "$STAMP") ))
      [ "$AGE" -lt "$DEDUP_S" ] && continue
    fi
    touch "$STAMP"
  fi
  echo "[hc-notify] $slug FALLO: $FAILS"

  # Persistir alerta donde el cron-master la pushea (visible desde el repo).
  mkdir -p "ops/instances/$slug/snapshots"
  echo "$OUT" > "ops/instances/$slug/snapshots/HEALTHCHECK-ALERT.json"

  # Aviso al OPERADOR (primera instancia → TG/email de Diego).
  (
    set -a; . "$OP_CF"; . config/secrets.conf 2>/dev/null; set +a
    [ -z "${ASISTENTE_INTERNAL_PORT:-}" ] && { echo "[hc-notify] $slug sin internal-api, solo alerta en snapshots"; exit 0; }
    OWNER="$OP_OWNER"
    [ -z "$OWNER" ] && { echo "[hc-notify] $slug sin OWNER_WA en el .conf del operador"; exit 0; }
    BODY="ALERTA healthcheck $slug: fallaron: $FAILS. Detalle en ops/instances/$slug/snapshots/HEALTHCHECK-ALERT.json"
    HTTP=$(curl -s -m 10 -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:${ASISTENTE_INTERNAL_PORT}/send-wa" \
      -H "x-intensa-secret: ${ASISTENTE_INTERNAL_SECRET:-}" \
      -H 'Content-Type: application/json' \
      -d "{\"to\":\"$OWNER\",\"body\":\"$BODY\"}")
    echo "[hc-notify] $slug aviso al operador: HTTP $HTTP"
  )
done
