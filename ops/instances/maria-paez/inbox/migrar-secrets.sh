#!/bin/bash
# Crea /root/secretaria/config/secrets.conf (canónico, gana sobre todo),
# limpia LEMON_* de .env-intensa-api, fija permisos, reload + verificación.
# REGLA: este script NO imprime valores de secrets (el outbox va a git).

SEC=/root/secretaria/config/secrets.conf
CF=/root/secretaria/config/instances/maria-paez.conf
EF=/root/secretaria/.env-intensa-api

if [ -f "$SEC" ]; then echo "secrets.conf ya existe — no piso nada, salgo"; exit 0; fi

need() { # $1=file $2=key → línea verbatim a stdout, aborta si falta
  local l; l=$(grep -E "^$2=" "$1" | head -1)
  if [ -z "$l" ]; then echo "FALTA $2 en $1 — ABORTO" >&2; exit 1; fi
  printf '%s\n' "$l"
}

set -e
umask 077
{
cat <<'HDR'
# ══════════════════════════════════════════════════════════════════════
# SECRETS CONSOLIDADOS — único lugar canónico (creado 2026-07-01)
# ══════════════════════════════════════════════════════════════════════
# - Este archivo GANA sobre config/instances/*.conf y .env-intensa-api
#   (ecosystem.config.js y ops/cron-master.sh lo mergean al final).
# - Valores viejos que queden en esos archivos son INERTES.
# - Para aplicar cualquier cambio:
#     cd /root/secretaria && pm2 reload ecosystem.config.js --update-env
# - chmod 600. NUNCA a git (.gitignore: config/secrets.conf).
# - Trampa conocida: con multi-instance real (2+ slugs) los secrets
#   por-instancia de acá colisionan — habrá que partir por slug.

# ── ASISTENTE_INTERNAL_SECRET (instancia maria-paez) ──────────────────
# Autoriza la internal-api en loopback: /send-wa /send-email /accion (MCP).
# 🔴 COMPROMETIDO (quedó en git history en un .out) — rotar ya.
# ROTAR: openssl rand -hex 32 → reemplazar acá → pm2 reload (comando arriba).
#   Verificar: curl -s -X POST localhost:$ASISTENTE_INTERNAL_PORT/reload-usuarios \
#     -H "x-intensa-secret: <nuevo>"  → {"ok":true,...}
# Sin dependencias externas, rotable en cualquier momento.
HDR
need "$CF" ASISTENTE_INTERNAL_SECRET
cat <<'B2'

# ── MARIA_VAULT_KEY (instancia maria-paez) ────────────────────────────
# ⚠️ NO editar a mano: cifra token.json.enc + calendar_auth_json en la DB.
# Cambiarla sin re-cifrar = Maria pierde Google/CalDAV de todos los usuarios.
# ROTAR: el script completo está comentado en
#   ops/instances/maria-paez/outbox/rotate-vault-key.out — copiarlo al inbox.
B2
need "$CF" MARIA_VAULT_KEY
cat <<'B3'

# ── INTENSA_API_SECRET (intensa-api) ──────────────────────────────────
# Auth interna del stack de suscripción (RPC intensa-api ↔ instancias).
# ROTAR: openssl rand -hex 32 → reemplazar acá → pm2 reload.
B3
need "$EF" INTENSA_API_SECRET
cat <<'B4'

# ── TURNSTILE_SECRET_KEY (intensa-api, anti-bot signup) ───────────────
# ROTAR: dash.cloudflare.com → Turnstile → widget intensa.io → rotate.
B4
need "$EF" TURNSTILE_SECRET_KEY
cat <<'B5'

# ── STRIPE_SECRET_KEY (intensa-api) ───────────────────────────────────
# ROTAR: dashboard.stripe.com → Developers → API keys → Roll key
# (al rolear elegís cuánto sigue viva la vieja: usar "now").
B5
need "$EF" STRIPE_SECRET_KEY
cat <<'B6'

# ── STRIPE_WEBHOOK_SECRET (intensa-api) ───────────────────────────────
# 🔴 COMPROMETIDO (quedó en git history en un .out) — rotar ya.
# ROTAR: dashboard.stripe.com → Developers → Webhooks → endpoint intensa.io
#   → Roll secret → pegar el whsec_ nuevo acá → pm2 reload.
B6
need "$EF" STRIPE_WEBHOOK_SECRET
} > "$SEC.tmp"
mv "$SEC.tmp" "$SEC"
chmod 600 "$SEC"
echo "secrets.conf creado: $(grep -cE '^[A-Za-z_]+=' "$SEC") secrets migrados"

# ── limpiar LEMON de .env-intensa-api ──
cp -a "$EF" "$EF.pre-lemon-cleanup"
NLEMON=$(grep -c '^LEMON_' "$EF" || true)
sed -i '/^LEMON_/d' "$EF"
echo "LEMON_*: $NLEMON líneas borradas de .env-intensa-api (backup en .pre-lemon-cleanup)"

# ── permisos ──
chmod 600 "$CF" /root/secretaria/.backup-pass
echo "perms: 600 en maria-paez.conf y .backup-pass"

# ── reload ──
cd /root/secretaria
set +e
pm2 reload ecosystem.config.js --update-env
RC=$?
echo "pm2 reload exit=$RC"
sleep 4

# ── verificación SIN imprimir valores ──
pm2 jlist > /tmp/jl-secrets.json 2>/dev/null
python3 - <<'PY'
import json
sec = {}
for l in open('/root/secretaria/config/secrets.conf'):
    l = l.strip()
    if not l or l.startswith('#') or '=' not in l: continue
    k, v = l.split('=', 1)
    v = v.strip().strip('"').strip("'")
    sec[k.strip()] = v
ps = json.load(open('/tmp/jl-secrets.json'))
checks = {'maria-paez': ['ASISTENTE_INTERNAL_SECRET', 'MARIA_VAULT_KEY'],
          'intensa-api': ['STRIPE_WEBHOOK_SECRET', 'INTENSA_API_SECRET']}
for p in ps:
    n = p.get('name')
    if n not in checks: continue
    e = p.get('pm2_env', {})
    env = {**e, **(e.get('env') or {})}
    print(f"{n}: status={e.get('status')} restarts={e.get('restart_time')}")
    for k in checks[n]:
        got = env.get(k)
        ok = 'MATCH' if (got and got == sec.get(k)) else ('AUSENTE' if not got else 'MISMATCH')
        print(f"  {k}: {ok}")
    if n == 'intensa-api':
        lem = [k for k in env if k.startswith('LEMON_')]
        print(f"  LEMON_* en env vivo: {len(lem)} (inertes hasta cold restart)" if lem else "  LEMON_* en env vivo: 0")
PY
rm -f /tmp/jl-secrets.json

# ── deploy del sitio (landing sin data-lemon) ──
bash ops/sites/intensa.io/deploy.sh 2>&1 | tail -15
echo "── check landing servida:"
grep -o 'data-product="maria"' /var/www/intensa.io/maria/index.html || echo "data-product NO encontrado"
grep -c 'data-lemon' /var/www/intensa.io/maria/index.html /var/www/intensa.io/maria/script.js 2>/dev/null || true
echo "LISTO"
