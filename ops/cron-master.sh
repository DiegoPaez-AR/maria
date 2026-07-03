#!/bin/bash
# ops/cron-master.sh — corre cada minuto desde crontab. Reemplaza ops/cron.sh.
#
# Responsabilidades:
#   1. Pull del repo. Si cambió código (excluyendo ops/ y config/), restartea
#      todas las instancias pm2 que matcheen los .conf.
#   2. Para cada instancia (config/instances/*.conf):
#       a. Carga su env del .conf.
#       b. Ejecuta scripts pendientes en ops/instances/<slug>/inbox/ → output
#          a ops/instances/<slug>/outbox/.
#       c. Dumpea estado (logs pm2 de la instancia, snapshot de su DB) a
#          ops/instances/<slug>/snapshots/.
#   3. Commit + push de los cambios en ops/.
#
# Instalación (una vez, pisando el cron viejo):
#   chmod +x ops/cron-master.sh
#   (crontab -l 2>/dev/null | grep -v 'ops/cron' ; echo '* * * * * cd /root/secretaria && bash ops/cron-master.sh >> /root/secretaria/ops/.cron.log 2>&1') | crontab -

set -u
shopt -s nullglob

cd /root/secretaria || exit 1

# PATH y env que cron necesita.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/root/.nvm/versions/node/$(ls /root/.nvm/versions/node 2>/dev/null | tail -1)/bin:$PATH"
export HOME=/root

# Lock global del cron — un solo tick a la vez.
exec 9>/tmp/maria-cron-master.lock
flock -n 9 || exit 0

STAMP=$(date -Iseconds)
echo "═══ $STAMP ═══"

# ───── 1. Pull código ─────
git fetch -q origin main || { echo "fetch failed"; exit 1; }

CODE_CHANGED=0
if ! git diff --quiet HEAD origin/main -- . ':!ops' ':!config' ':!docs' ':!*.md' ':!.gitignore' ':!LICENSE' ':!.github'; then
  CODE_CHANGED=1
  echo "código cambió → restart pendiente"
fi
git reset --hard origin/main -q

# Lista de instancias activas (slug por archivo .conf).
INSTANCES=()
for cf in config/instances/*.conf; do
  [ -f "$cf" ] || continue
  slug=$(basename "$cf" .conf)
  # Permitimos override si el .conf define ASISTENTE_SLUG
  override=$(grep -E '^ASISTENTE_SLUG=' "$cf" | head -1 | cut -d= -f2- | tr -d '"')
  if [ -n "$override" ]; then slug="$override"; fi
  INSTANCES+=("$slug:$cf")
done

if [ ${#INSTANCES[@]} -eq 0 ]; then
  echo "no hay instancias en config/instances/*.conf — corro modo legacy una sola vez"
  # Compat: caer a la lógica vieja contra ops/{inbox,outbox,snapshots} y pm2 'maria'
  INSTANCES=("maria:LEGACY")
fi

# ───── 1b. CANARY (2026-07-02): validar el código nuevo ANTES de recargar ─────
# Si los checks fallan: NO se recarga (pm2 sigue corriendo la versión buena en
# memoria), se avisa por WA, y se marca el commit malo para no re-checkear ni
# re-avisar cada minuto. El disco queda en origin/main (necesario para que los
# snapshots sigan pusheando sin conflictos) — riesgo residual documentado: un
# autorestart de pm2 o un lazy-require en la ventana mala levantaría código
# roto; el WA lo dice explícito. Se sale solo: al pushear un fix, el canary
# corre de nuevo y si pasa, recarga.
CANARY_BAD_F=/root/secretaria/state/.canary-bad-commit
_wa_owner() {
  local _msg="$1"
  local _cf; _cf=$(ls /root/secretaria/config/instances/*.conf 2>/dev/null | head -1)
  [ -z "$_cf" ] && return 0
  local _port _own _sec
  _port=$(grep -E '^ASISTENTE_INTERNAL_PORT=' "$_cf" | cut -d= -f2- | tr -d '"')
  _own=$(grep -E '^OWNER_WA=' "$_cf" | cut -d= -f2- | tr -d '"')
  _sec=$(grep -E '^ASISTENTE_INTERNAL_SECRET=' /root/secretaria/config/secrets.conf 2>/dev/null | cut -d= -f2- | tr -d '"')
  [ -z "$_sec" ] && _sec=$(grep -E '^ASISTENTE_INTERNAL_SECRET=' "$_cf" | cut -d= -f2- | tr -d '"')
  [ -n "$_port" ] && [ -n "$_own" ] && [ -n "$_sec" ] && curl -s -m 10 -X POST "http://127.0.0.1:$_port/send-wa" \
    -H "x-intensa-secret: $_sec" -H 'Content-Type: application/json' \
    -d "{\"to\":\"$_own\",\"body\":\"$_msg\"}" >/dev/null 2>&1 || true
}
_canary() {
  local out=/tmp/canary-tick.log
  : > "$out"
  local f
  for f in *.js; do
    node --check "$f" >> "$out" 2>&1 || { echo "canary FALLO sintaxis: $f"; tail -4 "$out"; return 1; }
  done
  local tdb=/tmp/canary-db.sqlite
  rm -f "$tdb"
  # Env realista: sourcear el .conf de la primera instancia + secrets (google.js
  # y otros exigen vars de identidad al REQUIRE), pisando todo path con side
  # effects (DB, tokens, sesion WA) con scratch descartable (2026-07-02).
  local _cfc; _cfc=$(ls /root/secretaria/config/instances/*.conf 2>/dev/null | head -1)
  if ! ( set -a
         [ -n "$_cfc" ] && . "$_cfc"
         [ -f /root/secretaria/config/secrets.conf ] && . /root/secretaria/config/secrets.conf
         set +a
         export MARIA_DB="$tdb" \
                GOOGLE_TOKEN_PATH=/tmp/canary-token.json \
                GOOGLE_CRED_PATH=/tmp/canary-cred.json \
                WA_AUTH_DIR=/tmp/canary-wa-auth
         timeout 60 node -e "
         ['./memory','./usuarios','./seguridad','./executor','./prompt-builder',
          './claude-client','./whatsapp-handler','./gmail-handler','./internal-api',
          './morning-brief','./meeting-prep','./follow-ups','./recordatorios',
          './programados','./maria-worker','./turn-state','./action-schemas',
          './moderacion','./loop-guard','./wa-validate','./vault','./i18n',
          './calendar-watch','./cumple-avisos','./diferidos-drainer','./poda-eventos',
          './memoria-curada','./clima','./providers','./google','./context-fetcher',
          './net-retry','./wa-send','./telegram-vinculos','./telegram-handler'].forEach(m => require(m));
         console.log('requires OK');
       " >> "$out" 2>&1 ); then
    echo "canary FALLO require-smoke/migración:"; tail -8 "$out"; rm -f "$tdb"; return 1
  fi
  rm -f "$tdb"
  if ! timeout 120 env -u MARIA_DB -u MARIA_VAULT_KEY -u OWNER_NOMBRE -u OWNER_WA -u OWNER_EMAIL -u SEC_DESTINATARIO_STRICT \
       npm test >> "$out" 2>&1; then
    echo "canary FALLO npm test:"; grep -E "^not ok" "$out" | head -5; return 1
  fi
  return 0
}

if [ "$CODE_CHANGED" = 1 ]; then
  HEAD_NOW=$(git rev-parse HEAD)
  if [ -f "$CANARY_BAD_F" ] && [ "$(cat "$CANARY_BAD_F" 2>/dev/null)" = "$HEAD_NOW" ]; then
    echo "canary: commit $HEAD_NOW ya marcado malo — SIN reload, esperando fix"
    CODE_CHANGED=0
  elif _canary; then
    echo "canary OK ($HEAD_NOW) → reload"
    rm -f "$CANARY_BAD_F"
  else
    echo "canary FALLÓ ($HEAD_NOW) — NO recargo pm2, prod sigue con la versión anterior en memoria"
    echo "$HEAD_NOW" > "$CANARY_BAD_F"
    _wa_owner "🔴 canary: el deploy ${HEAD_NOW:0:10} falló los checks — pm2 NO se recargó, Maria sigue corriendo la versión anterior EN MEMORIA. OJO: no reinicies pm2 hasta pushear el fix (el disco tiene el código roto). Detalle en ops/.cron.log"
    CODE_CHANGED=0
  fi
fi

if [ "$CODE_CHANGED" = 1 ]; then
  for inst in "${INSTANCES[@]}"; do
    slug="${inst%%:*}"
    # Usamos `reload ecosystem.config.js --only` (no `restart --update-env`)
    # porque éste último recarga el env del shell del cron, que NO tiene
    # cargado el .conf de la instancia → falla a fallbacks legacy.
    pm2 reload ecosystem.config.js --only "$slug" --update-env 2>/dev/null \
      || pm2 startOrRestart ecosystem.config.js --only "$slug" 2>/dev/null \
      || echo "pm2 reload $slug falló (puede no existir todavía)"
  done
fi

# ───── 2. Por cada instancia: ejecutar inbox + dumpear snapshot ─────
for inst in "${INSTANCES[@]}"; do
  slug="${inst%%:*}"
  cf="${inst#*:}"

  if [ "$cf" = "LEGACY" ]; then
    INBOX=ops/inbox
    OUTBOX=ops/outbox
    SNAPS=ops/snapshots
    DB=/root/secretaria/db/maria.sqlite
  else
    INBOX="ops/instances/$slug/inbox"
    OUTBOX="ops/instances/$slug/outbox"
    SNAPS="ops/instances/$slug/snapshots"
    # Cargar env del .conf para extraer MARIA_DB
    DB=$(grep -E '^MARIA_DB=' "$cf" | head -1 | cut -d= -f2- | tr -d '"')
    [ -z "$DB" ] && DB=/root/secretaria/db/maria.sqlite
  fi

  mkdir -p "$INBOX" "$OUTBOX" "$SNAPS"

  # 2a) Ejecutar inbox de esta instancia
  # Cargar env del .conf en el shell ACTUAL (subshell) para que los scripts
  # ad-hoc del inbox tengan MARIA_DB, MARIA_VAULT_KEY, GOOGLE_TOKEN_PATH,
  # ASISTENTE_SLUG, etc. Sin esto, scripts que hagan `node -e "require('./memory')"`
  # leen la DB legacy en /root/secretaria/db/ en vez de state/<slug>/db/.
  for cmd_file in "$INBOX"/*.sh; do
    [ -f "$cmd_file" ] || continue
    name=$(basename "$cmd_file" .sh)
    out="$OUTBOX/${name}.out"
    echo "[$slug exec] $cmd_file → $out"
    {
      echo "# ejecutado: $(date -Iseconds)"
      echo "# host: $(hostname)"
      echo "# instancia: $slug"
      echo "# script:"
      sed 's/^/#   /' "$cmd_file"
      echo ""
      echo "# ───── output ─────"
      (
        if [ "$cf" != "LEGACY" ] && [ -f "$cf" ]; then
          set -a
          . "$cf"
          # secrets consolidados: ganan sobre el .conf (mismo criterio que ecosystem)
          [ -f /root/secretaria/config/secrets.conf ] && . /root/secretaria/config/secrets.conf
          set +a
        fi
        bash "$cmd_file" 2>&1
      )
      echo ""
      echo "# exit=$?"
    } > "$out"
  done

  # 2b) Snapshots
  pm2 jlist 2>/dev/null > /tmp/pm2-jlist-$slug.json
  python3 -c "
import json, sys
try:
    ps = json.load(open('/tmp/pm2-jlist-$slug.json'))
    for p in ps:
        if p.get('name') != '$slug': continue
        e = p.get('pm2_env', {})
        print(f\"{p['name']}\tpid={p.get('pid')}\tstatus={e.get('status')}\trestarts={e.get('restart_time')}\tuptime_ms={e.get('pm_uptime')}\")
except Exception as ex:
    print(f'error: {ex}')
" > "$SNAPS/pm2-status.tsv" 2>&1

  pm2 logs "$slug" --lines 200 --nostream 2>&1 | tail -200 > "$SNAPS/pm2-logs.txt"

  if [ -f "$DB" ]; then
    sqlite3 -header -column "$DB" \
      'SELECT id, timestamp, canal, direccion, COALESCE(de,""), substr(COALESCE(cuerpo,""),1,200) AS cuerpo FROM eventos ORDER BY id DESC LIMIT 100' \
      > "$SNAPS/eventos-ultimos.txt" 2>&1
    sqlite3 -header -column "$DB" \
      'SELECT id, estado, creado, dueno, disparador, COALESCE(recordar_desde,"") AS recordar_desde, desc, COALESCE(meta_json,"") FROM pendientes WHERE estado="abierto" ORDER BY id' \
      > "$SNAPS/pendientes-abiertos.txt" 2>&1
    sqlite3 -header -column "$DB" \
      'SELECT clave, valor, COALESCE(fuente,""), actualizado FROM hechos ORDER BY clave' \
      > "$SNAPS/hechos.txt" 2>&1
    sqlite3 -header -column "$DB" \
      'SELECT id, cuando, canal, destino, substr(COALESCE(texto,""),1,100) AS texto, COALESCE(razon,"") FROM programados WHERE enviado=0 ORDER BY cuando LIMIT 20' \
      > "$SNAPS/programados.txt" 2>&1
  fi

  echo "$STAMP" > "$SNAPS/.timestamp"
done

# ───── 3. Housekeeping global ─────
find /tmp -maxdepth 1 -name 'maria-attach-*' -mmin +60 -delete 2>/dev/null

# ───── 3b. Scrubbing de secretos (antes de CUALQUIER git add) ─────
# Causa raíz del leak 2026-07-01: un .out del outbox con ASISTENTE_INTERNAL_SECRET
# y whsec_ en claro terminó en git history. Redactamos patrones de secretos en
# todo lo que el cron va a commitear (outbox + snapshots).
_scrub_secretos() {
  local f="$1"
  [ -f "$f" ] || return 0
  sed -E -i \
    -e 's/([A-Za-z0-9_]*(SECRET|_KEY|PASS|TOKEN)[A-Za-z0-9_]*=)[^[:space:]"'"'"']+/\1<REDACTED>/g' \
    -e 's/whsec_[A-Za-z0-9]+/whsec_<REDACTED>/g' \
    -e 's/[srp]k_(live|test)_[A-Za-z0-9]+/kk_\1_<REDACTED>/g' \
    -e 's/gh[ps]_[A-Za-z0-9]{20,}/ghX_<REDACTED>/g' \
    -e 's/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/<REDACTED_JWT>/g' \
    "$f" 2>/dev/null || true
}
for _sf in ops/instances/*/outbox/*.out ops/instances/*/snapshots/*.txt ops/instances/*/snapshots/*.tsv; do
  [ -f "$_sf" ] || continue
  _scrub_secretos "$_sf"
done

# ───── 4. Commit + push ─────
git add -A ops/
PUSHED_OK=0
if ! git diff --cached --quiet; then
  git commit -q -m "ops: snapshot $STAMP" || true
  if git push -q origin main; then
    PUSHED_OK=1
    echo "push fase 1 OK"
  else
    git pull --rebase --autostash -q origin main 2>&1 | tail -3
    if git push -q origin main; then
      PUSHED_OK=1
      echo "push fase 1 OK (post-rebase)"
    else
      echo "push fase 1 FAIL — retry próximo tick"
    fi
  fi
fi

# ───── 4b. Alerta de pushes fallidos (2026-07-02) ─────
# El fallo conocido (token del remote perdido → "could not read Username") deja
# de subir snapshots EN SILENCIO por días; fetch+deploy siguen andando así que
# nada grita. Contador persistente + aviso WA al owner UNA vez al cruzar el
# umbral (archivo .alerted evita spam; se limpia solo cuando vuelve a andar).
PUSHFAIL_F=/root/secretaria/state/.cron-push-fails
if [ "$PUSHED_OK" = 1 ]; then
  if [ -f "$PUSHFAIL_F.alerted" ]; then
    echo "push recuperado tras racha de fallos"
  fi
  rm -f "$PUSHFAIL_F" "$PUSHFAIL_F.alerted"
elif ! git diff --quiet HEAD 2>/dev/null || [ -n "$(git log origin/main..HEAD --oneline 2>/dev/null | head -1)" ]; then
  # solo cuenta si de verdad había algo para pushear y no salió
  N=$(( $(cat "$PUSHFAIL_F" 2>/dev/null || echo 0) + 1 ))
  echo "$N" > "$PUSHFAIL_F"
  if [ "$N" -ge 10 ] && [ ! -f "$PUSHFAIL_F.alerted" ]; then
    # 10 ticks = ~10min sin poder pushear. Aviso por la internal-api de la
    # primera instancia (el .conf + secrets.conf ya están cargados si estamos
    # dentro del loop; acá afuera los cargamos a mano de la primera instancia).
    _cf=$(ls /root/secretaria/config/instances/*.conf 2>/dev/null | head -1)
    if [ -n "$_cf" ]; then
      _port=$(grep -E '^ASISTENTE_INTERNAL_PORT=' "$_cf" | cut -d= -f2- | tr -d '"')
      _own=$(grep -E '^OWNER_WA=' "$_cf" | cut -d= -f2- | tr -d '"')
      _sec=$(grep -E '^ASISTENTE_INTERNAL_SECRET=' /root/secretaria/config/secrets.conf 2>/dev/null | cut -d= -f2- | tr -d '"')
      [ -z "$_sec" ] && _sec=$(grep -E '^ASISTENTE_INTERNAL_SECRET=' "$_cf" | cut -d= -f2- | tr -d '"')
      if [ -n "$_port" ] && [ -n "$_own" ] && [ -n "$_sec" ]; then
        curl -s -m 10 -X POST "http://127.0.0.1:$_port/send-wa" \
          -H "x-intensa-secret: $_sec" -H 'Content-Type: application/json' \
          -d "{\"to\":\"$_own\",\"body\":\"⚠️ cron: git push lleva $N ticks fallando — los snapshots/outbox NO están subiendo (¿token del remote?). fetch+deploy siguen OK. Fix: git remote set-url con el PAT.\"}" \
          >/dev/null 2>&1 && touch "$PUSHFAIL_F.alerted"
      fi
    fi
  fi
fi

# ───── 5. Consumir inbox: rm de inputs solo si fase 1 OK ─────
for inst in "${INSTANCES[@]}"; do
  slug="${inst%%:*}"
  cf="${inst#*:}"
  if [ "$cf" = "LEGACY" ]; then
    INBOX=ops/inbox
  else
    INBOX="ops/instances/$slug/inbox"
  fi
  if [ "$PUSHED_OK" = 1 ] || [ -z "$(ls "$INBOX"/*.sh 2>/dev/null)" ]; then
    rm -f "$INBOX"/*.sh
  fi
done
git add -A ops/
if ! git diff --cached --quiet; then
  git commit -q -m "ops: consumed inbox $STAMP" || true
  git push -q origin main 2>/dev/null || {
    git pull --rebase --autostash -q origin main 2>/dev/null
    git push -q origin main 2>/dev/null || echo "push fase 2 FAIL"
  }
fi

echo "tick done"
