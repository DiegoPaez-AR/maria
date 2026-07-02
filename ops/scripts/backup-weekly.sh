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

# Aviso WA al owner vía internal-api (best-effort, para fallos del backup).
_avisar_wa() {
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

if [ ! -f "$PASS_FILE" ]; then
  # NO auto-generar (2026-07-02): una pass nueva silenciosa produce backups que
  # la copia externa de la pass no puede descifrar — inútiles en el restore de
  # emergencia, que es exactamente cuando importan.
  echo "[backup] FATAL: falta $PASS_FILE — NO hago backup con pass desconocida"
  _avisar_wa "🔴 backup semanal ABORTADO: falta /root/secretaria/.backup-pass. Restaurala de tu copia externa (NO se auto-genera más)."
  exit 1
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

  # Sesión WA (2026-07-02): SÍ se backupea el perfil de auth (sin caches
  # Chromium, que son lo pesado y regenerable). Restaurarla evita el re-scan
  # de QR = RTO sin intervención humana. Best-effort: copiar un perfil vivo
  # puede quedar inconsistente; si el restore de sesión falla, el fallback
  # sigue siendo el QR.
  if [ -d "state/$slug/.wwebjs_auth" ]; then
    rsync -a \
      --exclude 'Cache' --exclude 'Code Cache' --exclude 'GPUCache' \
      --exclude 'DawnGraphiteCache' --exclude 'DawnWebGPUCache' --exclude 'GrShaderCache' \
      --exclude 'ShaderCache' --exclude 'component_crx_cache' --exclude 'Crashpad' \
      --exclude 'Service Worker/CacheStorage' --exclude 'Service Worker/ScriptCache' \
      --exclude '*.log' --exclude 'BrowserMetrics*' \
      "state/$slug/.wwebjs_auth/" "$dest/wwebjs_auth/" 2>/dev/null || true
    echo "[backup] $slug: sesión WA $(du -sh "$dest/wwebjs_auth" 2>/dev/null | cut -f1 || echo '?')"
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

# Secrets canónicos (2026-07-02): sin esto el restore queda con keys stale
# después de cualquier rotación hecha en secrets.conf.
for f in /root/secretaria/config/secrets.conf /root/secretaria/.env-intensa-api /root/secretaria/config/instances.bootstrap.json; do
  if [ -f "$f" ]; then
    rel=${f#/root/secretaria/}
    mkdir -p "$WORK/extras/$(dirname "$rel")"
    cp "$f" "$WORK/extras/$rel"
    echo "[backup] extra: $rel"
  fi
done

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
  echo "nota: cifrado AES-256-CBC pbkdf2 iter=200000. Pass en /root/secretaria/.backup-pass del VPS (y copia en la maquina de Diego). Incluye sesion WhatsApp (best-effort, fallback QR) + config/secrets.conf + .env-intensa-api."
} > "$GITDIR/MANIFEST.txt"
git -C "$GITDIR" add -A
git -C "$GITDIR" -c user.email=backup@maria-vps -c user.name=maria-backup commit -qm "backup $TS"
if git -C "$GITDIR" push -q --force "$ORIGIN" backups:backups; then
  echo "[backup] OK — pusheado a branch backups ($SIZE)"
else
  echo "[backup] ERROR — push a branch backups FALLO (queda copia local en /root/backups/)"
  _avisar_wa "⚠️ backup semanal: el push a la branch backups FALLÓ (hay copia local en /root/backups/)."
fi

# ── Restore-test (2026-07-02): nadie testeaba que el backup se pueda abrir ──
# Descifra la copia recién hecha, desempaqueta, y corre integrity_check en cada
# sqlite. Si algo falla, WA al owner — un backup que no restaura no existe.
RT=$(mktemp -d)
RT_OK=1
if openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$ENC" -out "$RT/b.tar.gz" -pass "file:$PASS_FILE" 2>/dev/null \
   && tar -C "$RT" -xzf "$RT/b.tar.gz" 2>/dev/null; then
  while IFS= read -r dbf; do
    r=$(python3 -c "import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute('PRAGMA integrity_check').fetchone()[0])" "$dbf" 2>/dev/null)
    if [ "$r" != "ok" ]; then RT_OK=0; echo "[restore-test] FALLO integrity: $dbf → $r"; fi
  done < <(find "$RT" -name '*.sqlite' 2>/dev/null)
  [ -f "$RT/extras/config/secrets.conf" ] || { RT_OK=0; echo "[restore-test] FALTA secrets.conf en el backup"; }
  ls "$RT"/instances/*/maria.sqlite >/dev/null 2>&1 || { RT_OK=0; echo "[restore-test] FALTA maria.sqlite de instancias"; }
else
  RT_OK=0
  echo "[restore-test] FALLO descifrado/desempaquetado"
fi
rm -rf "$RT"
if [ "$RT_OK" = 1 ]; then
  echo "[restore-test] OK — el backup descifra y las DBs pasan integrity_check"
else
  _avisar_wa "🔴 backup semanal: el RESTORE-TEST falló — el backup de hoy puede no ser restaurable. Revisar log del cron."
fi
rm -rf "$GITDIR" "$ENC"
