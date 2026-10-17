#!/bin/bash
# Solo lectura: líneas de MariaBridge / wa-hook en las ventanas de los envíos 16-17/10
cd /root/secretaria
L=logs/maria-paez/out.log
for w in "2026-10-15 15:4" "2026-10-16 13:2" "2026-10-16 13:3" "2026-10-16 13:4" "2026-10-16 14:0" "2026-10-17 07:5" "2026-10-17 08:0"; do
  echo "════ $w ════"; grep "^$w" $L | grep -v "al día" | cut -c1-350
done
echo "════ upd/instalador 72h ════"
awk '($1" "substr($2,1,5))>="2026-10-14 11:00"' $L | grep -E "\[upd\]|instalador|0-tap" | grep -v "al día" | cut -c1-250 | tail -20
echo "════ sofia MB 72h (sin al día) ════"
awk '($1" "substr($2,1,5))>="2026-10-14 11:00"' logs/sofia-bruscoli/out.log | grep "\[MB" | grep -v "al día" | cut -c1-250 | tail -20
