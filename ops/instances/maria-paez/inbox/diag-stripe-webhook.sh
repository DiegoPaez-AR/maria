#!/bin/bash
# Diag: ubicar intensa-api, var del webhook Stripe, estado pm2. Secretos enmascarados.
echo "## host: $(hostname)  date: $(date -Iseconds)"
echo
echo "### Buscando source de intensa-api"
CANDS=$(find /root/secretaria -maxdepth 3 -type d -iname '*intensa*api*' 2>/dev/null)
echo "dirs intensa-api: ${CANDS:-(ninguno)}"
# Buscar archivos js que mencionen stripe/intensa-api en todo secretaria (sin node_modules)
echo
echo "### Archivos que mencionan 'stripe' (case-insensitive, sin node_modules):"
grep -rIl -i 'stripe' /root/secretaria --include='*.js' --include='*.ts' --include='*.mjs' 2>/dev/null | grep -v node_modules | head -30
echo
echo "### Refs a env vars de Stripe / webhook secret en el código:"
grep -rInE 'STRIPE[A-Z_]*|whsec|process\.env\.[A-Z_]*WEBHOOK[A-Z_]*|process\.env\.[A-Z_]*SIGN[A-Z_]*|constructEvent|stripe\.webhooks' /root/secretaria --include='*.js' --include='*.ts' --include='*.mjs' 2>/dev/null | grep -v node_modules | head -60
echo
echo "### Keys del /root/secretaria/.env-intensa-api (valores enmascarados):"
if [ -f /root/secretaria/.env-intensa-api ]; then
  sed -E 's/^([A-Za-z0-9_]+)=.*/\1=<set>/' /root/secretaria/.env-intensa-api
else
  echo "(no existe /root/secretaria/.env-intensa-api)"
fi
echo
echo "### Otros .env* en /root/secretaria (nombres):"
ls -la /root/secretaria/.env* 2>/dev/null
echo
echo "### pm2 list:"
pm2 jlist 2>/dev/null | python3 -c "import json,sys
try:
  for p in json.load(sys.stdin):
    e=p.get('pm2_env',{})
    print(p.get('name'),'status=',e.get('status'),'script=',e.get('pm_exec_path'),'cwd=',e.get('pm_cwd'))
except Exception as ex: print('err',ex)"
echo
echo "### Quien escucha en :4080"
ss -ltnp 2>/dev/null | grep 4080 || echo "(nada en 4080)"
