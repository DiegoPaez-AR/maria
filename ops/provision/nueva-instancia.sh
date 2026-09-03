#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# nueva-instancia.sh — alta de una Maria white-label en el VPS.
#
# Uso:
#   bash ops/provision/nueva-instancia.sh <slug> "<Nombre Instancia>" <gmail-de-la-maria> [opciones]
#   bash ops/provision/nueva-instancia.sh maria-acme "Maria Acme" maria.acme@gmail.com
#
# Opciones:
#   --port N          puerto internal-api (default: max en uso + 1)
#   --max-usuarios N  cap de usuarios (default 10)
#   --dry-run         muestra TODO lo que haría sin tocar nada
#   --start           al final hace pm2 reload (default NO: primero OAuth)
#
# Hace (automatizable):
#   1. config/instances/<slug>.conf desde el template (secrets nuevos generados)
#   2. state/<slug>/db/ + credentials.json copiado de una instancia existente
#   3. nginx: location /hooks/wa-<slug>/ → 127.0.0.1:<port>/wa-hook/ + reload
#   4. alta en la control DB de intensa-api (signup_bot=0: dedicada, no entra
#      al round-robin de signups)
#   5. (--start) pm2 reload ecosystem
#
# Lo MANUAL queda impreso como checklist al final (Gmail, OAuth, teléfono,
# MariaBridge, warm-up del número). Ver ops/provision/README.md.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
cd /root/secretaria

SLUG="${1:?uso: nueva-instancia.sh <slug> \"<Nombre>\" <gmail> [--port N] [--dry-run] [--start]}"
NOMBRE="${2:?falta el nombre de la instancia}"
GMAIL="${3:?falta el gmail de la Maria nueva}"
shift 3
PORT=""; MAXU=10; DRY=0; START=0
while [ $# -gt 0 ]; do case "$1" in
  --port) PORT="$2"; shift 2;;
  --max-usuarios) MAXU="$2"; shift 2;;
  --dry-run) DRY=1; shift;;
  --start) START=1; shift;;
  *) echo "opción desconocida: $1"; exit 1;;
esac; done

[[ "$SLUG" =~ ^[a-z0-9-]{3,30}$ ]] || { echo "✗ slug inválido (a-z 0-9 -): $SLUG"; exit 1; }
CONF="config/instances/${SLUG}.conf"
[ -f "$CONF" ] && { echo "✗ ya existe $CONF"; exit 1; }
grep -q "location /hooks/wa-${SLUG}/" /etc/nginx/sites-available/intensa.io.conf 2>/dev/null && { echo "✗ nginx ya tiene /hooks/wa-${SLUG}"; exit 1; }

# puerto: max en uso + 1 (arranca en 4501)
if [ -z "$PORT" ]; then
  MAXP=$(grep -h "ASISTENTE_INTERNAL_PORT" config/instances/*.conf 2>/dev/null | grep -oE '[0-9]+' | sort -n | tail -1)
  PORT=$(( ${MAXP:-4500} + 1 ))
fi

# secrets nuevos (por instancia)
WA_HOOK_SECRET=$(openssl rand -hex 16)
VAULT_KEY=$(openssl rand -hex 32)
INTERNAL_SECRET=$(openssl rand -hex 24)

# chequeo de diseño: WA_HOOK_SECRET/ASISTENTE_INTERNAL_SECRET NO deben estar en
# secrets.conf global (pisarían a TODAS las instancias — secrets.conf gana)
for K in WA_HOOK_SECRET ASISTENTE_INTERNAL_SECRET; do
  if grep -q "^${K}=" config/secrets.conf 2>/dev/null; then
    echo "⚠️  ${K} está en secrets.conf GLOBAL — pisaría el de cada instancia."
    echo "    Movelo al .conf de maria-paez y borralo de secrets.conf antes de seguir."
    [ "$DRY" = 1 ] || exit 1
  fi
done

echo "═══ Alta de instancia: $SLUG ($NOMBRE) ═══"
echo "  gmail:    $GMAIL"
echo "  puerto:   $PORT"
echo "  max_usu:  $MAXU"
echo "  hook:     https://intensa.io/hooks/wa-${SLUG}/<secret>"
[ "$DRY" = 1 ] && echo "  (DRY-RUN: no toco nada)"

# ── 1. .conf ──
LEER_TPL=config/instances/_template.conf.example
gen_conf() {
  sed -e "s|^ASISTENTE_NOMBRE=.*|ASISTENTE_NOMBRE=\"${NOMBRE}\"|" \
      -e "s|^ASISTENTE_SLUG=.*|ASISTENTE_SLUG=${SLUG}|" \
      -e "s|^ASISTENTE_FROM_EMAIL=.*|ASISTENTE_FROM_EMAIL=${GMAIL}|" \
      -e "s|<slug>|${SLUG}|g" \
      -e "s|^# ASISTENTE_MAX_USUARIOS=.*|ASISTENTE_MAX_USUARIOS=${MAXU}|" \
      -e "s|^# MARIA_VAULT_KEY=.*|MARIA_VAULT_KEY=${VAULT_KEY}|" \
      "$LEER_TPL"
  echo ""
  echo "# ─── Internal API (per-instance, generado por nueva-instancia.sh) ───"
  echo "ASISTENTE_INTERNAL_PORT=${PORT}"
  echo "ASISTENTE_INTERNAL_SECRET=${INTERNAL_SECRET}"
  echo "WA_HOOK_SECRET=${WA_HOOK_SECRET}"
  echo "OWNER_SERVIDO=0"
}
if [ "$DRY" = 1 ]; then echo "── [dry] escribiría $CONF"; else
  gen_conf > "$CONF"; chmod 600 "$CONF"; echo "✔ $CONF"
fi

# ── 2. state + credentials ──
if [ "$DRY" = 1 ]; then echo "── [dry] crearía state/${SLUG}/db + copiaría credentials.json"; else
  mkdir -p "state/${SLUG}/db"
  SRC_CRED=$(ls state/*/credentials.json 2>/dev/null | head -1)
  [ -n "$SRC_CRED" ] && cp "$SRC_CRED" "state/${SLUG}/credentials.json" && echo "✔ credentials.json copiado de $SRC_CRED (misma app OAuth)"
fi

# ── 3. nginx ──
NGX=/etc/nginx/sites-available/intensa.io.conf
BLOQUE="    location /hooks/wa-${SLUG}/ {\n        proxy_pass http://127.0.0.1:${PORT}/wa-hook/;\n        proxy_read_timeout 90s;\n        proxy_http_version 1.1;\n    }"
if [ "$DRY" = 1 ]; then echo "── [dry] insertaría en nginx:"; echo -e "$BLOQUE"; else
  cp "$NGX" "${NGX}.bak-$(date +%s)"
  awk -v bloque="$(echo -e "$BLOQUE")" '
    /location \/hooks\/wa-maria\// && !hecho { print bloque; hecho=1 }
    { print }' "$NGX" > "${NGX}.tmp" && mv "${NGX}.tmp" "$NGX"
  nginx -t 2>/dev/null && systemctl reload nginx && echo "✔ nginx: /hooks/wa-${SLUG} → :${PORT}" || { echo "✗ nginx -t FALLÓ — restaurando backup"; cp "${NGX}.bak-"* "$NGX" 2>/dev/null | tail -1; exit 1; }
fi

# ── 4. control DB (intensa-api) ──
if [ "$DRY" = 1 ]; then echo "── [dry] INSERT en instances (signup_bot=0)"; else
  node -e "
  const db=require('/root/secretaria/node_modules/better-sqlite3')('/root/secretaria/state/control/control.sqlite');
  db.prepare(\"INSERT INTO instances (slug, nombre, host, internal_port, internal_secret, max_usuarios, signup_bot, estado) VALUES (?,?,?,?,?,?,0,'active')\")
    .run('${SLUG}','${NOMBRE}','127.0.0.1',${PORT},'${INTERNAL_SECRET}',${MAXU});
  console.log('✔ control DB: instancia registrada (signup_bot=0 — dedicada)');
  db.close();"
fi

# ── 5. pm2 ──
if [ "$START" = 1 ] && [ "$DRY" = 0 ]; then
  pm2 reload ecosystem.config.js --update-env >/dev/null 2>&1 && echo "✔ pm2: ${SLUG} arrancada"
else
  echo "── pm2 NO recargado (correr tras el OAuth: pm2 reload ecosystem.config.js --update-env)"
fi

cat <<CHECKLIST

═══ CHECKLIST MANUAL (ver ops/provision/README.md) ═══
 1. GMAIL: crear/usar ${GMAIL} (Workspace del cliente o Gmail dedicado)
 2. OAUTH: correr el flow de Google en el VPS →
      cd /root/secretaria && set -a && . config/instances/${SLUG}.conf && set +a && node auth-gmail.js url
      → abrir la URL logueado como ${GMAIL}, copiar el code, y: node auth-gmail.js exchange <code>
    → genera state/${SLUG}/token.json (cifrar con la vault key si aplica)
 3. TELÉFONO dedicado: chip + WhatsApp con el número de la Maria nueva
    ⚠️  WARM-UP: usar el número A MANO 2-3 días antes de conectar nada (lección Meta)
 4. MARIABRIDGE en ese teléfono:
      APK:    https://intensa.io/_dl/ (ver mariabridge-latest.json para el último)
      CONFIG 1-TAP (v2.6+): abrí este link EN EL TELÉFONO (mandalo por el canal que sea):
        mariabridge://config?url=https%3A%2F%2Fintensa.io%2Fhooks%2Fwa-${SLUG}&secret=${WA_HOOK_SECRET}
      (o a mano: URL https://intensa.io/hooks/wa-${SLUG} + secret ${WA_HOOK_SECRET})
      Permisos: ①notificaciones ②batería ③accesibilidad (+ permitir instalar apps para el auto-update)
 5. TELEGRAM (opcional pero recomendado): crear bot en @BotFather →
      TELEGRAM_BOT_TOKEN/USERNAME en ${CONF} (NO en secrets.conf global)
 6. OWNER/CLIENTE: OWNER_* en ${CONF} ya apunta a Diego (admin). Cargar al
    cliente como USUARIO: desde el chat del owner → "sumá a <nombre> como usuario"
 7. pm2 reload ecosystem.config.js --update-env  (si no usaste --start)
 8. SMOKE: curl -X POST "https://intensa.io/hooks/wa-${SLUG}/${WA_HOOK_SECRET}" \\
      -H 'Content-Type: application/json' -d '{"query":{"sender":"000","message":"ping","isTestMessage":true}}'
    → debe devolver "✅ Webhook de Maria conectado."
═══════════════════════════════════════════════════════
CHECKLIST
