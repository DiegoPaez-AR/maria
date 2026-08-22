#!/bin/bash
cd /root/secretaria
nohup bash /root/mb-build-worker.sh > /tmp/mbbuild.log 2>&1 &
echo "build lanzado"
sleep 5
tail -3 /root/mariabridge-build.log 2>/dev/null
echo LISTO
