#!/bin/bash
# inbox: limita el thinking de la CLI. Sonnet 4.6 usa adaptive thinking que
# IGNORA MAX_THINKING_TOKENS salvo que se desactive el modo adaptativo.
# No imprime el .conf entero (secrets) — solo las lineas de thinking.
set -u
CONF=/root/secretaria/config/instances/maria-paez.conf
[ -f "$CONF" ] || { echo "no existe $CONF"; exit 1; }

cp "$CONF" "$CONF.bak-thinking"

grep -v -E '^(CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING|MAX_THINKING_TOKENS)=' "$CONF" > "$CONF.tmp"
{
  echo 'CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1'
  echo 'MAX_THINKING_TOKENS=1024'
} >> "$CONF.tmp"
mv "$CONF.tmp" "$CONF"

echo "lineas de thinking en el conf:"
grep -E 'THINKING' "$CONF"

echo "reload de la instancia via ecosystem:"
cd /root/secretaria
pm2 reload ecosystem.config.js --only maria-paez --update-env 2>&1 | tail -3
sleep 3
pm2 jlist | python3 -c "
import json, sys
for p in json.load(sys.stdin):
    if p.get('name') == 'maria-paez':
        env = p.get('pm2_env', {})
        print('status:', env.get('status'))
        print('DISABLE_ADAPTIVE:', env.get('env', {}).get('CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING') or env.get('CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING', '(no visible en jlist)'))
"
echo "listo"
