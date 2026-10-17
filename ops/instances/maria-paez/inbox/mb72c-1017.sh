#!/bin/bash
# Solo lectura: ventanas de envío 15-16/10 en logs rotados (.log sin comprimir)
cd /root/secretaria/logs/maria-paez
ls -la out__2026-10-1[4-7]* 
T=$(mktemp); cat out__2026-10-1[5-7]*.log out.log > $T 2>/dev/null
for w in "2026-10-15 15:4" "2026-10-16 13:2" "2026-10-16 13:3" "2026-10-16 13:4" "2026-10-16 14:0"; do
  echo "════ $w ════"; grep "^$w" $T | grep -v -E "al día|meeting-prep|programados\]" | cut -c1-330
done
echo "════ upd/instalador ════"; grep -E "^2026-10-1[4-7]" $T | grep -E "\[upd\]|instalador|0-tap" | grep -v "al día" | cut -c1-250 | tail -25
rm -f $T
