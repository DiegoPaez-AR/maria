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
if ! git diff --quiet HEAD origin/main -- . ':!ops' ':!config'; then
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

if [ "$CODE_CHANGED" = 1 ]; then
  for inst in "${INSTANCES[@]}"; do
    slug="${inst%%:*}"
    pm2 restart "$slug" --update-env 2>/dev/null || echo "pm2 restart $slug falló (puede no existir todavía)"
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
      bash "$cmd_file" 2>&1
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
      'SELECT id, estado, creado, desc, COALESCE(meta_json,"") FROM pendientes WHERE estado="abierto" ORDER BY id' \
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

# ───── 4. Commit + push ─────
git add -A ops/instances ops/outbox ops/snapshots
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
git add -A ops/instances ops/inbox
if ! git diff --cached --quiet; then
  git commit -q -m "ops: consumed inbox $STAMP" || true
  git push -q origin main 2>/dev/null || {
    git pull --rebase --autostash -q origin main 2>/dev/null
    git push -q origin main 2>/dev/null || echo "push fase 2 FAIL"
  }
fi

echo "tick done"
