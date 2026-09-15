#!/bin/bash
cd /root/secretaria
set -a; . config/instances/maria-paez.conf; . config/secrets.conf 2>/dev/null; set +a
echo "── nodos (árbol de la pantalla) ──"
timeout 100 bash ops/tools/mb-remoto.sh nodos 2>&1 | tail -30 | cut -c1-400
echo "── shot ──"
timeout 100 bash ops/tools/mb-remoto.sh shot 2>&1 | tail -3
ls -la ops/instances/maria-paez/shots/ultima.png 2>/dev/null
echo LISTO
