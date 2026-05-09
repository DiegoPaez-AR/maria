#!/bin/bash
set +e

echo "════════════════════════════════════════════════════════════════"
echo "    LIMPIEZA DE /root/secretaria — single→multi-instance"
echo "════════════════════════════════════════════════════════════════"
echo

cd /root/secretaria

echo "── 1. Lock huérfano del cron viejo ──"
ls -la /tmp/maria-cron.lock 2>/dev/null && rm -v /tmp/maria-cron.lock || echo "  (no estaba)"
echo

echo "── 2. Crontab — verificar que solo tenga el cron-master ──"
crontab -l 2>&1 | grep -E 'cron|secretaria' || echo "  (no hay)"
echo

echo "── 3. Archivos sueltos en /root/secretaria/ (top level) ──"
ls -la /root/secretaria/ | grep -v '^d' | awk '{print $NF, "("$5" bytes)"}' | grep -v '^\.$\|^\.\.$' | head -40
echo

echo "── 4. Carpetas en /root/secretaria/ ──"
ls -la /root/secretaria/ | grep '^d' | awk '{print $NF}' | grep -v '^\.$\|^\.\.$'
echo

echo "── 5. .db y .sqlite huérfanos en root (NO en db/) ──"
echo "  (memoria dice que son huérfanos vacíos, los borramos)"
for f in /root/secretaria/maria.db /root/secretaria/maria.sqlite /root/secretaria/maria.sqllite; do
  if [ -f "$f" ]; then
    SIZE=$(stat -c%s "$f")
    echo "  $f → $SIZE bytes → borro"
    rm -v "$f"
  fi
done
echo

echo "── 6. Backups (.bak*) sueltos en root ──"
shopt -s nullglob
backups=(/root/secretaria/*.bak* /root/secretaria/token.json.bak.* /root/secretaria/db.bak* )
if [ ${#backups[@]} -gt 0 ]; then
  echo "  encontrados: ${#backups[@]} archivos backup"
  for b in "${backups[@]}"; do
    [ -e "$b" ] || continue
    SIZE=$(stat -c%s "$b" 2>/dev/null || echo "?")
    AGE=$(stat -c%y "$b" 2>/dev/null | cut -d. -f1)
    echo "  $b ($SIZE bytes, $AGE)"
  done
  echo "  (solo listo — no borro automático, hacelo a mano si querés)"
else
  echo "  (no hay backups sueltos)"
fi
echo

echo "── 7. contactos.json (legacy, ya migrado a DB según .gitignore) ──"
if [ -f /root/secretaria/contactos.json ]; then
  echo "  $(stat -c%y /root/secretaria/contactos.json | cut -d. -f1) — borro"
  rm -v /root/secretaria/contactos.json
else
  echo "  (no estaba)"
fi
echo

echo "── 8. Archivos /tmp temporales viejos ──"
TEMP_OLD=$(find /tmp -maxdepth 1 -name 'maria-*' -mtime +1 2>/dev/null | wc -l)
echo "  encontrados: $TEMP_OLD archivos /tmp/maria-* >24h"
find /tmp -maxdepth 1 -name 'maria-*' -mtime +1 -delete 2>/dev/null
echo "  borrados (silenciosamente)"
echo

echo "── 9. node_modules: tamaño actual ──"
du -sh /root/secretaria/node_modules 2>/dev/null | head -1
echo

echo "── 10. Verificación final: pm2 + cron ──"
pm2 list 2>&1 | head -8
echo
crontab -l | grep -v '^#' | grep -v '^$'
