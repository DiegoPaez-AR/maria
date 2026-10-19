#!/bin/bash
# Solo lectura: arranque de MariaBridge 4.11 en ambos teléfonos + qué despierta la pantalla en el de Sofia
cd /root/secretaria/logs
for s in maria-paez sofia-bruscoli; do
  echo "════ $s ════"
  grep -h "\[MB " $s/out__2026-10-1[89]*.log $s/out.log 2>/dev/null | grep -v "al día" | awk '$1>="2026-10-19"' | tail -40 | cut -c1-230
  echo "── despertares / ctl / instalador 7 días ──"
  cat $s/out__*.log $s/out.log 2>/dev/null | grep "\[MB " | grep -i -E "despert|wake|instalador|0-tap|\[ctl\]|frio\] abriendo" | awk '$1>="2026-10-12"' | tail -25 | cut -c1-200
done
