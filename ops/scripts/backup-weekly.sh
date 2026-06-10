#!/bin/bash
# ops/scripts/backup-weekly.sh — backup cifrado de TODAS las instancias.
#
# Corre semanal desde crontab (domingo 03:00). Por cada config/instances/*.conf:
#   - copia el .conf (tiene MARIA_VAULT_KEY y secrets, imprescindible p/ restore)
#   - backup CONSISTENTE de su sqlite (python3 sqlite3.backup, banca WAL en vivo)
#   - el resto de state/<slug>/ EXCEPTO sesión/caché de WhatsApp (pesadas y
#     regenerables con un scan de QR) y los wal/shm
# Además: cualquier *.sqlite fuera de state/ (ej. control DB de intensa-api)
# y los .env de ops/backend.
#
# Empaqueta todo en un tar.gz, lo cifra con AES-256 (passphrase en
# /root/secretaria/.backup-pass, NUNCA en git) y lo publica en la branch
# huérfana `backups` del repo con push --force: la branch tiene SIEMPRE un
# solo commit, así el repo no engorda semana a semana. Una tarea programada
# del lado de Diego lo baja a su máquina los domingos.
#
# Restore: openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
#            -in maria-backup-YYYYMMDD.tar.gz.enc -out backup.tar.gz \
#            -pass file:.backup-pass
#
# Retención local: últimas 4 copias en /root/backups/.

set -u
shopt -s nullglob

cd /root/secretaria || exit 1
PASS_FILE=/root/secretaria/.backup-pass
if [ ! -f "$PASS_FILE" ]; then
  ( umask 077; openssl rand -hex 32 > "$PASS_FILE" )
  echo "[backup] passphrase nueva generada en $PASS_FILE — guardala FUERA del VPS"
fi

TS=$(date +%Y%m%d-%H%M)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "[backup] $TS — armando backup multi-instancia"

# ── Por instancia ──────────────────────────────────────────────────────────
SLUGS=()
for cf in config/instances/*.conf; do
  slug=$(basename "$cf" .conf)
  override=$(grep -E '^ASISTENTE_SLUG=' "$cf" | head -1 | cut -d= -f2- | tr -d '"')
  [ -n "$override" ] && slug="$override"
  SLUGS+=("$slug")
  dest="$WORK/instances/$slug"
  mkdir -p "$dest"
  cp "$cf" "$dest/"

  # DB de la instancia (path del .conf, en subshell para no contaminar env)
  db=$( ( set -a; . "$cf"; set +a; echo "${MARIA_DB:-/root/secretaria/state/$slug/db/maria.sqlite}" ) )
  if [ -f "$db" ]; then
    python3 - "$db" "$dest/maria.sqlite" <<'PYEOF'
import sqlite3, sys
src = sqlite3.connect(sys.argv[1])
dst = sqlite3.connect(sys.argv[2])
src.backup(dst)
dst.close(); src.close()
PYEOF
    echo "[backup] $slug: DB $(du -h "$dest/maria.sqlite" | cut -f1)"
  else
    echo "[backup] $slug: WARN — DB no encontrada en $db"
  fi

  # Resto del state (tokens cifrados, etc.) sin WA session/cache ni sqlite vivos
  if [ -d "state/$slug" ]; then
    rsync -a \
      --exclude '.wwebjs_auth' --exclude '.wwebjs_cache' \
      --exclude '*.sqlite' --exclude '*.sqlite-wal' --exclude '*.sqlite-shm' \
      "state/$slug/" "$dest/state/" 2>/dev/null \
      || cp -r "state/$slug" "$dest/state" 2>/dev/null || true
  fi
done

# ── Extras fuera de state/: control DB de intensa-api, .env, etc. ─────────
mkdir -p "$WORK/extras"
while IFS= read -r f; do
  rel=${f#/root/secretaria/}
  mkdir -p "$WORK/extras/$(dirname "$rel")"
  python3 - "$f" "$WORK/extras/$rel" <<'PYEOF'
import sqlite3, sys
src = sqlite3.connect(sys.argv[1])
dst = sqlite3.connect(sys.argv[2])
src.backup(dst)
dst.close(); src.close()
PYEOF
  echo "[backup] extra DB: $rel"
done < <(find /root/secretaria -name '*.sqlite' -not -path '*/state/*' -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null)

while IFS= read -r f; do
  rel=${f#/root/secretaria/}
  mkdir -p "$WORK/extras/$(dirname "$rel")"
  cp "$f" "$WORK/extras/$rel"
done < <(find /root/secretaria/ops/backend -maxdepth 3 -name '.env*' -not -path '*/node_modules/*' 2>/dev/null)

# ── Empaquetar + cifrar ────────────────────────────────────────────────────
TAR=/tmp/maria-backup-$TS.tar.gz
ENC=/tmp/maria-backup-$TS.tar.gz.enc
tar -C "$WORK" -czf "$TAR" .
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in "$TAR" -out "$ENC" -pass "file:$PASS_FILE"
SHA=$(sha256sum "$ENC" | cut -d' ' -f1)
SIZE=$(du -h "$ENC" | cut -f1)
rm -f "$TAR"
echo "[backup] cifrado: $SIZE sha256=$SHA"

# ── Retención local ────────────────────────────────────────────────────────
mkdir -p /root/backups
cp "$ENC" /root/backups/
ls -1t /root/backups/maria-backup-*.tar.gz.enc 2>/dev/null | tail -n +5 | xargs -r rm -f

# ── Publicar en branch huérfana `backups` (un solo commit, force push) ─────
ORIGIN=$(git remote get-url origin)
GITDIR=$(mktemp -d)
git -C "$GITDIR" init -q -b backups
cp "$ENC" "$GITDIR/"
{
  echo "fecha: $TS"
  echo "archivo: $(basename "$ENC")"
  echo "size: $SIZE"
  echo "sha256: $SHA"
  echo "instancias: ${SLUGS[*]:-ninguna}"
  echo "nota: cifrado AES-256-CBC pbkdf2 iter=200000. Pass en /root/secretaria/.backup-pass del VPS (y copia en la maquina de Diego). NO incluye sesion de WhatsApp (re-scan QR al restaurar)."
} > "$GITDIR/MANIFEST.txt"
git -C "$GITDIR" add -A
git -C "$GITDIR" -c user.email=backup@maria-vps -c user.name=maria-backup commit -qm "backup $TS"
if git -C "$GITDIR" push -q --force "$ORIGIN" backups:backups; then
  echo "[backup] OK — pusheado a branch backups ($SIZE)"
else
  echo "[backup] ERROR — push a branch backups FALLO (queda copia local en /root/backups/)"
fi
rm -rf "$GITDIR" "$ENC"
