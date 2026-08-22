#!/bin/bash
cd /root/secretaria
bash ops/tools/mb-remoto.sh shot 2>&1 | tail -20
ls -la ops/instances/maria-paez/shots/ 2>/dev/null
echo LISTO
