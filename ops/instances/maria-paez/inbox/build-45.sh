#!/bin/bash
cd /root/secretaria
nohup bash /root/mb-build-worker.sh > /tmp/mbbuild45.log 2>&1 &
echo "build 4.5 lanzado (detached)"
echo LISTO
