#!/bin/bash
# Rotación de MARIA_VAULT_KEY:
#   1. Genera nueva key con openssl rand.
#   2. Lee la key actual del .conf de la instancia.
#   3. Re-cifra token.json.enc + cualquier calendar_auth_json de DB.
#   4. Updatea el .conf con la nueva key.
#   5. Reload pm2 con --update-env.
#   6. Healthcheck.
# Solo imprime "OK + first4chars" como prueba — la key completa NO sale en logs.
set +e

CONF="/root/secretaria/config/instances/maria-paez.conf"
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"
TOKEN_ENC="/root/secretaria/state/maria-paez/token.json.enc"

if [ ! -f "$CONF" ]; then
  echo "ERROR: $CONF no existe"; exit 1
fi

OLD_KEY=$(grep -E '^MARIA_VAULT_KEY=' "$CONF" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
if [ -z "$OLD_KEY" ]; then
  echo "ERROR: no encuentro MARIA_VAULT_KEY en el .conf"; exit 1
fi

NEW_KEY=$(openssl rand -hex 32)
if [ -z "$NEW_KEY" ] || [ ${#NEW_KEY} -ne 64 ]; then
  echo "ERROR: openssl rand falló o key inválida"; exit 1
fi

echo "═══ Rotación MARIA_VAULT_KEY ═══"
echo "Old key prefix: ${OLD_KEY:0:4}..."
echo "New key prefix: ${NEW_KEY:0:4}..."

# Paso 1 — re-cifrar token.json.enc
if [ -f "$TOKEN_ENC" ]; then
  echo ""
  echo "═══ Re-cifrando token.json.enc ═══"
  BACKUP="${TOKEN_ENC}.bak.rotate-$(date +%Y%m%d-%H%M%S)"
  cp "$TOKEN_ENC" "$BACKUP"
  echo "  backup: $BACKUP"
  cd /root/secretaria && MARIA_VAULT_KEY="$OLD_KEY" NEW_KEY="$NEW_KEY" node -e "
    const fs = require('fs');
    process.env.MARIA_VAULT_KEY = process.env.MARIA_VAULT_KEY;
    const vault = require('./vault');
    const tokenBlob = fs.readFileSync('$TOKEN_ENC', 'utf8').trim();
    const token = vault.descifrar(tokenBlob);
    process.env.MARIA_VAULT_KEY = process.env.NEW_KEY;
    delete require.cache[require.resolve('./vault')];
    const vaultNew = require('./vault');
    vaultNew.cifrarArchivo('$TOKEN_ENC', token);
    console.log('  ✓ token re-cifrado');
  " 2>&1
fi

# Paso 2 — re-cifrar cualquier calendar_auth_json de la DB
echo ""
echo "═══ Re-cifrando calendar_auth_json (users CalDAV/MS) ═══"
cd /root/secretaria && MARIA_VAULT_KEY="$OLD_KEY" NEW_KEY="$NEW_KEY" MARIA_DB="$DB" node -e "
  const better = require('better-sqlite3');
  const db = better(process.env.MARIA_DB);
  const filas = db.prepare(\"SELECT id, nombre, calendar_auth_json FROM usuarios WHERE calendar_auth_json IS NOT NULL\").all();
  console.log('  usuarios con auth cifrada:', filas.length);
  if (filas.length === 0) { console.log('  (nada que re-cifrar)'); process.exit(0); }
  const vaultOld = require('./vault');
  for (const f of filas) {
    const obj = vaultOld.descifrar(f.calendar_auth_json);
    // swap key in env to re-encrypt
    process.env.MARIA_VAULT_KEY = process.env.NEW_KEY;
    delete require.cache[require.resolve('./vault')];
    const vaultNew = require('./vault');
    const nuevo = vaultNew.cifrar(obj);
    db.prepare('UPDATE usuarios SET calendar_auth_json = ? WHERE id = ?').run(nuevo, f.id);
    console.log('  ✓', f.nombre, '(id=' + f.id + ')');
    // reset for next iteration
    process.env.MARIA_VAULT_KEY = '$OLD_KEY';
    delete require.cache[require.resolve('./vault')];
  }
" 2>&1

# Paso 3 — updatear .conf
echo ""
echo "═══ Actualizando .conf con nueva key ═══"
BACKUP_CONF="${CONF}.bak.rotate-$(date +%Y%m%d-%H%M%S)"
cp "$CONF" "$BACKUP_CONF"
echo "  backup: $BACKUP_CONF"
# sed con / como delimitador no funciona porque la key puede contener barras (no en hex pero por las dudas)
sed -i "s|^MARIA_VAULT_KEY=.*|MARIA_VAULT_KEY=$NEW_KEY|" "$CONF"
NEW_IN_CONF=$(grep -E '^MARIA_VAULT_KEY=' "$CONF" | head -1 | cut -d= -f2-)
if [ "$NEW_IN_CONF" != "$NEW_KEY" ]; then
  echo "ERROR: sed no actualizó el .conf correctamente — abortando"; exit 1
fi
echo "  ✓ .conf updated (prefix ${NEW_KEY:0:4}...)"

# Paso 4 — reload pm2 con --update-env
echo ""
echo "═══ Reload pm2 con env nuevo ═══"
cd /root/secretaria && pm2 reload ecosystem.config.js --only maria-paez --update-env 2>&1 | tail -5

sleep 5

# Paso 5 — healthcheck
echo ""
echo "═══ Healthcheck post-rotación ═══"
bash /root/secretaria/ops/healthcheck.sh

# Paso 6 — cleanup del dir /root/secretaria/db si quedó vacío
echo ""
echo "═══ Cleanup /root/secretaria/db ═══"
if [ -d /root/secretaria/db ]; then
  if [ -z "$(ls -A /root/secretaria/db 2>/dev/null)" ]; then
    rmdir /root/secretaria/db && echo "  ✓ dir vacío eliminado"
  else
    echo "  ⚠ tiene archivos, no toco — ls:"
    ls -la /root/secretaria/db
  fi
else
  echo "  ya no existe"
fi
