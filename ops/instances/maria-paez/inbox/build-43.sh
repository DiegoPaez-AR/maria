#!/bin/bash
if pgrep -f mb-build-worker >/dev/null; then echo corriendo; exit 0; fi
nohup bash /root/mb-build-worker.sh >/dev/null 2>&1 &
echo "build v4.3 lanzado"
