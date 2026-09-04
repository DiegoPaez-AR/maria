#!/bin/bash
ls -la /root/mb-build-worker.sh && head -30 /root/mb-build-worker.sh
nohup bash /root/mb-build-worker.sh > /tmp/mb-build-46.log 2>&1 &
echo "build lanzado en background (pid $!)"
echo LISTO
