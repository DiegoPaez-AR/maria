#!/bin/bash
echo "── todas las líneas de programados/1341 y sus errores ──"
grep -B3 "programados/1341\|programados.*1341" ~/.pm2/logs/maria-paez-out.log | tail -20
grep -B2 -A2 "1341" ~/.pm2/logs/maria-paez-error.log 2>/dev/null | tail -10
echo "── cómo decide canal el sender de programados ──"
grep -n "automaticos_sin_wa\|enviarWAUsuario\|programados" /root/secretaria/wa-send.js | head -10
echo LISTO
