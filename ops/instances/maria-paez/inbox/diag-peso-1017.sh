#!/bin/bash
# Solo lectura: qué archivo pesado intenta subir el cron (push roto desde 06:39)
OUT=/var/www/intensa.io/_dl/diag-9df65c3abf373fc6.txt
[ -f "$OUT" ] && exit 0
rm -f /var/www/intensa.io/_dl/diag-d542f22af36801a3.txt
{
cd /root/secretaria
echo "── cambios en ops/ vs HEAD (lo que el cron agregaría) ──"
git status --porcelain --untracked-files=all ops | head -40
echo "── esos archivos por tamaño ──"
git status --porcelain --untracked-files=all ops | awk '{print $NF}' | while read f; do [ -f "$f" ] && du -k "$f"; done | sort -rn | head -15
echo "── archivos >1MB en ops/ modificados desde 17/10 06:00 ──"
find ops -type f -size +1M -newermt '2026-10-17 06:00' -printf '%k KB  %TY-%Tm-%Td %TH:%TM  %p\n' 2>/dev/null | sort -rn | head
echo "── http.postBuffer ──"; git config --get http.postBuffer || echo "(default)"
echo "── cron.log alrededor de la primera falla ──"
n=$(grep -n "push fase 1 FAIL" ops/.cron.log | awk -F: '$1>780000' | head -1 | cut -d: -f1); [ -n "$n" ] && sed -n "$((n-40)),$((n+2))p" ops/.cron.log
} 2>&1 | sed -E 's/gh[pousr]_[A-Za-z0-9]+/gh*_***/g; s#https://[^@/ ]+@#https://***@#g' > "$OUT"
chmod 644 "$OUT"
