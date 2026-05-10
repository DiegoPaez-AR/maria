#!/bin/bash
set +e
ROOT=/root/secretaria
TRASH=/root/secretaria.trash-$(date +%Y%m%d-%H%M%S)
mkdir -p "$TRASH"
echo "TRASH dir (NO borro de verdad, solo muevo acá; podés revisar y rm -rf si todo está OK):"
echo "  $TRASH"
echo

cd "$ROOT" || exit 1

echo "=== ESTRUCTURA TOP-LEVEL ANTES ==="
ls -la "$ROOT" | grep -vE '^total|^d.* (ops|state|node_modules|config|docs|\.git)$'
echo
echo "(no listo: ops/, state/, node_modules/, config/, docs/, .git/ — esos NO se tocan)"
echo

# ─── Candidatos a huérfano ─────────────────────────────────────────────────
# 1) /root/secretaria/db/  — DB pre-multi-instance. La real está en
#    state/maria-paez/db/. Verifico que esté vacía o con datos triviales
#    antes de moverla.
if [ -d "$ROOT/db" ]; then
  echo "[1] $ROOT/db/ (pre-multi-instance):"
  ls -la "$ROOT/db" | tail -n +2
  for f in "$ROOT/db"/*.sqlite "$ROOT/db"/*.db; do
    [ -f "$f" ] || continue
    SZ=$(stat -c%s "$f")
    ROWS=$(python3 -c "
import sqlite3
try:
  d = sqlite3.connect('$f')
  ts = [r[0] for r in d.execute(\\\"SELECT name FROM sqlite_master WHERE type='table'\\\").fetchall()]
  total = sum(d.execute(f'SELECT COUNT(*) FROM \\\"{t}\\\"').fetchone()[0] for t in ts)
  print(f'tablas={len(ts)} rows_total={total}')
except Exception as e:
  print(f'NO ABRE: {e}')
" 2>&1)
    echo "    $f  ($SZ bytes) → $ROWS"
  done
  echo "    → moviendo a trash"
  mv "$ROOT/db" "$TRASH/db"
fi
echo

# 2) Archivos sueltos en la raíz de /root/secretaria/ que NO son del código
#    actual ni están referenciados en config/instances/*.conf.
echo "[2] archivos sueltos en $ROOT (raíz, no recursivo):"
# Whitelist de archivos que SÍ pertenecen al repo / son tracked.
TRACKED=$(cd "$ROOT" && git ls-files 2>/dev/null | awk -F/ '!/\//{print $1}' | sort -u)
WHITELIST_DIRS="ops state node_modules config docs .git"
WHITELIST_FILES=".gitignore"
# Patrones de archivos que el RUNTIME crea legítimamente en la raíz (logs de
# pm2 NO van acá, van a /root/.pm2/logs/; tampoco contactos.json — eso fue
# legacy y ya se importó).
RUNTIME_OK=""

for f in $(ls -A "$ROOT"); do
  full="$ROOT/$f"
  # Skip dirs whitelisteadas
  if [ -d "$full" ]; then
    skip=0
    for d in $WHITELIST_DIRS; do
      [ "$f" = "$d" ] && skip=1 && break
    done
    [ $skip -eq 1 ] && continue
  fi
  # Skip si es file tracked por git
  if echo "$TRACKED" | grep -qx "$f"; then continue; fi
  # Skip si es file whitelisteado
  for w in $WHITELIST_FILES; do [ "$f" = "$w" ] && skip=1; done
  [ "$skip" = 1 ] && continue
  # Reportar
  TIPO=$([ -d "$full" ] && echo DIR || echo FILE)
  SZ=$(du -sh "$full" 2>/dev/null | cut -f1)
  echo "    HUÉRFANO ($TIPO, $SZ): $full"
  # Para .sqlite/.db sueltos, validar que estén vacíos antes de mover.
  case "$f" in
    *.sqlite|*.db|*.sqlite-wal|*.sqlite-shm)
      if [ -f "$full" ]; then
        ROWS=$(python3 -c "
import sqlite3, sys
try:
  d = sqlite3.connect('$full')
  ts = [r[0] for r in d.execute(\\\"SELECT name FROM sqlite_master WHERE type='table'\\\").fetchall()]
  total = sum(d.execute(f'SELECT COUNT(*) FROM \\\"{t}\\\"').fetchone()[0] for t in ts)
  print(f'tablas={len(ts)} rows_total={total}')
except Exception as e:
  print(f'NO_ABRE')
" 2>&1)
        echo "        $ROWS"
      fi
      ;;
  esac
  mv "$full" "$TRASH/" 2>/dev/null
done
echo

# 3) state/maria-paez/ — chequear que NO haya .wwebjs_auth duplicado fuera
#    del path canónico.
echo "[3] estructura state/ (referencia, no se toca):"
ls -la "$ROOT/state/maria-paez/" 2>&1 | head -20
echo

echo "=== ESTRUCTURA DESPUÉS ==="
ls -la "$ROOT" | grep -vE '^total|^d.* (ops|state|node_modules|config|docs|\.git)$'
echo
echo "=== TRASH ==="
ls -la "$TRASH"
du -sh "$TRASH"
echo
echo "Si después de revisar querés borrar definitivo, en el VPS corré:  rm -rf $TRASH"
