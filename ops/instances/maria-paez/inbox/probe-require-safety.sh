#!/bin/bash
# ¿Qué módulos raíz se pueden requerir sin side effects peligrosos?
# Env 100% aislado (DB temp, keys de test). Timeout por si alguno cuelga.
cd /root/secretaria
TDB=/tmp/canary-probe.sqlite; rm -f "$TDB"
for m in memory usuarios seguridad executor prompt-builder claude-client \
         whatsapp-handler gmail-handler internal-api morning-brief meeting-prep \
         follow-ups recordatorios programados maria-worker turn-state \
         action-schemas moderacion loop-guard wa-validate vault i18n \
         calendar-watch cumple-avisos diferidos-drainer poda-eventos \
         memoria-curada clima providers google context-fetcher net-retry wa-send; do
  R=$(timeout 15 env MARIA_DB="$TDB" MARIA_VAULT_KEY=$(printf 'c%.0s' $(seq 64)) \
      OWNER_NOMBRE='Canary' OWNER_WA='5491100000009' OWNER_EMAIL='canary@test.local' \
      GOOGLE_TOKEN_PATH=/tmp/canary-token.json GOOGLE_CRED_PATH=/tmp/canary-cred.json \
      node -e "require('./$m'); console.log('ok')" 2>&1 | tail -1)
  printf "%-22s %s\n" "$m" "$(echo "$R" | head -c 100)"
done
rm -f "$TDB"
echo FIN
