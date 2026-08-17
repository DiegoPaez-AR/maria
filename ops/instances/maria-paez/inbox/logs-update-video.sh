#!/bin/bash
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | awk '$2>="20:24:00" && $2<="20:32:00"' | head -20
echo "── ¿v3.2 arrancó? ──"
grep "\[MB v3.2" ~/.pm2/logs/maria-paez-out.log | head -5
echo LISTO
