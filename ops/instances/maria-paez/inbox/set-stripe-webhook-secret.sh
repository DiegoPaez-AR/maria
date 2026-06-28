#!/bin/bash
# Setea STRIPE_WEBHOOK_SECRET en el .env-intensa-api vivo (gitignored, persiste) y reloadea intensa-api.
set -u
ENV=/root/secretaria/.env-intensa-api
VAL='whsec_qYLSN1hhdvKDIxx35o8t2WapUZHSkABN'

if [ ! -f "$ENV" ]; then echo "ERROR: no existe $ENV"; exit 1; fi
cp -a "$ENV" "${ENV}.bak.$(date +%s)"

# Quitar línea previa si existía, y appendear la nueva
grep -vE '^STRIPE_WEBHOOK_SECRET=' "$ENV" > "${ENV}.tmp"
{
  echo ""
  echo "# Stripe — webhook signing secret (deploy $(date -Iseconds))"
  echo "STRIPE_WEBHOOK_SECRET=${VAL}"
} >> "${ENV}.tmp"
mv "${ENV}.tmp" "$ENV"
chmod 600 "$ENV"

echo "## .env-intensa-api keys (masked) tras el cambio:"
sed -E 's/^([A-Za-z0-9_]+)=.*/\1=<set>/' "$ENV"
echo
echo "## confirmacion STRIPE_WEBHOOK_SECRET (masked):"
grep -E '^STRIPE_WEBHOOK_SECRET=' "$ENV" | sed -E 's/=(.{6}).*/=\1…(len ='"$(grep -E '^STRIPE_WEBHOOK_SECRET=' "$ENV" | cut -d= -f2- | tr -d '\n' | wc -c)"')/'
echo

# Restart intensa-api para que tome la nueva env (cambio de env NO se hot-reloadea)
echo "## pm2 restart intensa-api --update-env"
pm2 restart intensa-api --update-env 2>&1 | tail -5
sleep 2
echo
echo "## pm2 status:"
pm2 jlist 2>/dev/null | python3 -c "import json,sys
for p in json.load(sys.stdin):
  if p.get('name')=='intensa-api':
    e=p.get('pm2_env',{}); print('intensa-api status=',e.get('status'),'restarts=',e.get('restart_time'))"
echo
echo "## escuchando en 4080:"
ss -ltnp 2>/dev/null | grep 4080 || echo "(nada en 4080!)"
echo
echo "## verificar que el proceso ve la var (sin imprimir valor):"
PID=$(pm2 jlist 2>/dev/null | python3 -c "import json,sys
for p in json.load(sys.stdin):
  if p.get('name')=='intensa-api': print(p.get('pid'))")
if [ -n "${PID:-}" ] && [ -r /proc/$PID/environ ]; then
  if tr '\0' '\n' < /proc/$PID/environ | grep -q '^STRIPE_WEBHOOK_SECRET='; then
    echo "OK: el proceso intensa-api (pid=$PID) tiene STRIPE_WEBHOOK_SECRET en su environ"
  else
    echo "WARN: pid=$PID NO tiene STRIPE_WEBHOOK_SECRET en environ (revisar como carga el .env)"
  fi
else
  echo "(no pude leer environ del pid)"
fi
