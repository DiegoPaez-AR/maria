#!/bin/bash
# ops/cron.sh — se corre cada minuto desde crontab en el VPS.
#
# Responsabilidades:
#   1. Pull del repo. Si cambió algo en código → pm2 restart maria.
#   2. Ejecutar scripts pendientes en ops/inbox/ → dejar output en ops/outbox/.
#   3. Dumpear estado del VPS a ops/snapshots/ (logs, sqlite).
#   4. Commit + push de los cambios en ops/.
#
# Instalación (una vez):
#   chmod +x ops/cron.sh
#   (crontab -l 2>/dev/null | grep -v 'ops/cron.sh'; echo '* * * * * cd /root/secretaria && bash ops/cron.sh >> /root/secretaria/ops/.cron.log 2>&1') | crontab -

set -u
shopt -s nullglob

cd /root/secretaria || exit 1

# ───── PATH y env que cron necesita (cron corre con un env mínimo) ─────
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/root/.nvm/versions/node/$(ls /root/.nvm/versions/node 2>/dev/null | tail -1)/bin:$PATH"
export HOME=/root

# Lock para evitar que dos cron ticks se solapen
exec 9>/tmp/maria-cron.lock
flock -n 9 || exit 0

STAMP=$(date -Iseconds)
echo "═══ $STAMP ═══"

# ───── 1. Pull + detect de cambios de código ─────
git fetch -q origin main || { echo "fetch failed"; exit 1; }

CODE_CHANGED=0
if ! git diff --quiet HEAD origin/main -- . ':!ops'; then
  CODE_CHANGED=1
  echo "código cambió → restart pendiente"
fi

# Reset duro para bajar todo lo nuevo (código + inbox scripts nuevos)
git reset --hard origin/main -q

if [ "$CODE_CHANGED" = 1 ]; then
  pm2 restart maria --update-env || echo "pm2 restart falló"
fi

# ───── 2. Ejecutar inbox ─────
mkdir -p ops/outbox
for cmd_file in ops/inbox/*.sh; do
  [ -f "$cmd_file" ] || continue
  name=$(basename "$cmd_file" .sh)
  out=ops/outbox/${name}.out
  echo "[exec] $cmd_file → $out"
  {
    echo "# ejecutado: $(date -Iseconds)"
    echo "# host: $(hostname)"
    echo "# script:"
    sed 's/^/#   /' "$cmd_file"
    echo ""
    echo "# ───── output ─────"
    bash "$cmd_file" 2>&1
    echo ""
    echo "# exit=$?"
  } > "$out"
  # El rm lo hacemos después del primer push exitoso, ver abajo.
done

# ───── 3. Snapshots ─────
mkdir -p ops/snapshots
DB=/root/secretaria/db/maria.sqlite

pm2 jlist 2>/dev/null > /tmp/pm2-jlist.json
python3 -c "
import json, sys
try:
    ps = json.load(open('/tmp/pm2-jlist.json'))
    for p in ps:
        e = p.get('pm2_env', {})
        print(f\"{p['name']}\tpid={p.get('pid')}\tstatus={e.get('status')}\trestarts={e.get('restart_time')}\tuptime_ms={e.get('pm_uptime')}\")
except Exception as ex:
    print(f'error: {ex}')
" > ops/snapshots/pm2-status.tsv 2>&1

pm2 logs maria --lines 200 --nostream 2>&1 | tail -200 > ops/snapshots/pm2-logs.txt

if [ -f "$DB" ]; then
  sqlite3 -header -column "$DB" \
    'SELECT id, timestamp, canal, direccion, COALESCE(de,""), substr(COALESCE(cuerpo,""),1,200) AS cuerpo FROM eventos ORDER BY id DESC LIMIT 100' \
    > ops/snapshots/eventos-ultimos.txt 2>&1
  sqlite3 -header -column "$DB" \
    'SELECT id, estado, creado, desc, COALESCE(meta_json,"") FROM pendientes WHERE estado="abierto" ORDER BY id' \
    > ops/snapshots/pendientes-abiertos.txt 2>&1
  sqlite3 -header -column "$DB" \
    'SELECT clave, valor, COALESCE(fuente,""), actualizado FROM hechos ORDER BY clave' \
    > ops/snapshots/hechos.txt 2>&1
  sqlite3 -header -column "$DB" \
    'SELECT id, cuando, canal, destino, substr(COALESCE(texto,""),1,100) AS texto, COALESCE(razon,"") FROM mensajes_programados WHERE enviado=0 ORDER BY cuando LIMIT 20' \
    > ops/snapshots/programados.txt 2>&1
fi

echo "$STAMP" > ops/snapshots/.timestamp

# ───── 4. Commit + push (fase 1: publicar outputs y snapshots) ─────
git add -A ops/outbox ops/snapshots
PUSHED_OK=0
if ! git diff --cached --quiet; then
  git commit -q -m "ops: snapshot $STAMP" || true
  if git push -q origin main; then
    PUSHED_OK=1
    echo "push fase 1 OK"
  else
    # Otro push llegó primero → rebase y retry
    git pull --rebase --autostash -q origin main 2>&1 | tail -3
    if git push -q origin main; then
      PUSHED_OK=1
      echo "push fase 1 OK (post-rebase)"
    else
      echo "push fase 1 FAIL — retry próximo tick"
    fi
  fi
fi

# ───── 5. Consumir inbox (fase 2: rm de inputs, solo si fase 1 OK) ─────
# Así evitamos borrar un inbox script si el output no llegó a pushearse.
if [ "$PUSHED_OK" = 1 ] || [ -z "$(ls ops/inbox/*.sh 2>/dev/null)" ]; then
  rm -f ops/inbox/*.sh
  git add -A ops/inbox
  if ! git diff --cached --quiet; then
    git commit -q -m "ops: consumed inbox $STAMP" || true
    git push -q origin main 2>/dev/null || {
      git pull --rebase --autostash -q origin main 2>/dev/null
      git push -q origin main 2>/dev/null || echo "push fase 2 FAIL"
    }
  fi
fi

echo "tick done"
