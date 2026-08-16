#!/bin/bash
set -e
cd /root/secretaria
CONF=config/instances/maria-paez.conf
SEC=config/secrets.conf
# valores actuales
WHS=$(grep -E '^WA_HOOK_SECRET=' "$SEC" | cut -d= -f2-)
AIS=$(grep -E '^ASISTENTE_INTERNAL_SECRET=' "$SEC" | cut -d= -f2-)
[ -z "$WHS" ] || [ -z "$AIS" ] && { echo "algo falta, abort"; exit 1; }
# backup
cp "$SEC" "${SEC}.bak-mudanza"; cp "$CONF" "${CONF}.bak-mudanza"
# ¿ya están en el conf?
grep -q "^WA_HOOK_SECRET=" "$CONF" || { echo "" >> "$CONF"; echo "# ─── Secrets per-instance (mudados de secrets.conf 2026-08-16) ───" >> "$CONF"; echo "WA_HOOK_SECRET=$WHS" >> "$CONF"; }
grep -q "^ASISTENTE_INTERNAL_SECRET=" "$CONF" || echo "ASISTENTE_INTERNAL_SECRET=$AIS" >> "$CONF"
# sacar del global
sed -i '/^WA_HOOK_SECRET=/d; /^ASISTENTE_INTERNAL_SECRET=/d' "$SEC"
echo "mudados. reload..."
pm2 reload ecosystem.config.js --update-env >/dev/null 2>&1 && echo "reload OK"
sleep 3
# smoke: hook debe seguir 200
R=$(curl -s -m 15 -X POST "https://intensa.io/hooks/wa-maria/$WHS" -H 'Content-Type: application/json' -d '{"query":{"sender":"000","message":"ping","isTestMessage":true}}')
echo "smoke hook: ${R:0:60}"
echo "$R" | grep -q "conectado" && echo "✔ TODO OK — mudanza completa" || { echo "✗ SMOKE FALLÓ — RESTAURANDO"; cp "${SEC}.bak-mudanza" "$SEC"; cp "${CONF}.bak-mudanza" "$CONF"; pm2 reload ecosystem.config.js --update-env; }
echo LISTO
