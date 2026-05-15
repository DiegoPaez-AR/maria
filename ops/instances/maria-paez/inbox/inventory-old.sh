#!/bin/bash
# Inventario de candidatos a limpieza. SOLO LEE. No mueve ni borra nada.
set +e
cd /root/secretaria || exit 1

echo "═══ Tamaño total /root/secretaria ═══"
du -sh /root/secretaria 2>/dev/null

echo ""
echo "═══ Legacy paths fuera de state/ que YA NO se usan (ahora todo vive en state/maria-paez/) ═══"
echo "--- /root/secretaria/db/ (DB huérfana del refactor) ---"
ls -la /root/secretaria/db/ 2>/dev/null
echo ""
echo "--- /root/secretaria/.wwebjs_auth/ (sesión WA legacy expirada) ---"
du -sh /root/secretaria/.wwebjs_auth 2>/dev/null
echo ""
echo "--- /root/secretaria/.wwebjs_cache/ (cache legacy) ---"
du -sh /root/secretaria/.wwebjs_cache 2>/dev/null
echo ""
echo "--- /root/secretaria/credentials.json o token.json en raíz (legacy) ---"
ls -la /root/secretaria/credentials.json /root/secretaria/token.json 2>/dev/null

echo ""
echo "═══ Archivos .js en la raíz del repo (para chequear referencias) ═══"
ls -la /root/secretaria/*.js 2>/dev/null | awk '{print $NF, "("$5" bytes, "$6, $7, $8")"}'

echo ""
echo "═══ Archivos sospechosos en raíz: viejos, .bak, .old, _v1, etc. ═══"
find /root/secretaria -maxdepth 2 -type f \( -name '*.bak' -o -name '*.old' -o -name '*~' -o -name '*.orig' -o -name '*-old.*' -o -name '*_old.*' -o -name '*-v[0-9]*' -o -name '*_v[0-9]*' -o -name '*-backup*' -o -name '*-deprecated*' \) ! -path '*/node_modules/*' ! -path '*/state/*' 2>/dev/null

echo ""
echo "═══ Scripts en raíz (sh) ═══"
ls -la /root/secretaria/*.sh 2>/dev/null
echo ""
echo "--- ¿cron.sh viejo? (lo reemplazó cron-master.sh) ---"
ls -la /root/secretaria/ops/cron.sh /root/secretaria/cron.sh 2>/dev/null
echo ""
echo "--- install-handlers.sh, instrucciones.txt ¿se siguen usando? ---"
ls -la /root/secretaria/install-handlers.sh /root/secretaria/instrucciones.txt 2>/dev/null

echo ""
echo "═══ Mira si los .js de la raíz están referenciados por index.js o el ecosystem ═══"
echo "--- index.js: requires/imports ---"
grep -nE "require\\(.\\./|require\\('\\./" /root/secretaria/index.js 2>/dev/null | head -30
echo ""
echo "--- whatsapp-handler vs whatsapp.js (memoria dice que el viejo whatsapp.js puede ser legacy) ---"
grep -nE "require\\(.\\./whatsapp|require\\('\\./whatsapp" /root/secretaria/*.js 2>/dev/null | grep -v node_modules

echo ""
echo "═══ docs/ existentes ═══"
ls -la /root/secretaria/docs/ 2>/dev/null
