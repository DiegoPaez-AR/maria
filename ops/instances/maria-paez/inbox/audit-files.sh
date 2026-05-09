#!/bin/bash
set +e

echo "═══ AUDIT FINAL — /root/secretaria/ ═══"
echo

echo "── 1. Raíz: archivos sueltos ──"
ls -la /root/secretaria/ | grep '^-' | awk '{print "  ", $NF, "("$5" bytes,", $6, $7")"}'
echo

echo "── 2. Raíz: carpetas ──"
ls /root/secretaria/ | grep -v '^\.$\|^\.\.$' | xargs -I{} sh -c 'if [ -d "/root/secretaria/{}" ]; then echo "  {}"; fi'
echo

echo "── 3. state/maria-paez/ — solo lo que esa instancia necesita ──"
ls -la /root/secretaria/state/maria-paez/ | grep -v '^total\|^d.*\.$'
echo

echo "── 4. ops/instances/maria-paez/inbox|outbox/.gitkeep + archivos ──"
ls /root/secretaria/ops/instances/maria-paez/inbox/ /root/secretaria/ops/instances/maria-paez/outbox/ 2>&1
echo

echo "── 5. ¿context-fetcher.js, test-calendar.js, auth-gmail.js se usan? (grep imports) ──"
cd /root/secretaria
for f in context-fetcher test-calendar auth-gmail; do
  count=$(grep -lr "require.*${f}" --include='*.js' . 2>/dev/null | grep -v node_modules | grep -v "${f}\.js" | wc -l)
  uses=$(grep -lr "require.*${f}" --include='*.js' . 2>/dev/null | grep -v node_modules | grep -v "${f}\.js" | tr '\n' ' ')
  echo "  ${f}.js → require'd por: ${count} archivos. ${uses}"
done
echo

echo "── 6. Tamaño total y top archivos en /root/secretaria/ ──"
du -sh /root/secretaria 2>/dev/null
du -sh /root/secretaria/* 2>/dev/null | sort -h | tail -10
echo

echo "── 7. Logs/backups sueltos ──"
find /root/secretaria -maxdepth 2 \( -name '*.log' -o -name '*.bak*' \) -type f 2>/dev/null | grep -v node_modules | head -10 || echo "  (ninguno)"
