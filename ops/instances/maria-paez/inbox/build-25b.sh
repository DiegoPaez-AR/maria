#!/bin/bash
if pgrep -f mb-build-worker >/dev/null; then echo corriendo; exit 0; fi
grep -q "rm -rf" /root/mb-build-worker.sh && echo "worker con clean ✓" || echo "OJO sin clean"
nohup bash /root/mb-build-worker.sh >/dev/null 2>&1 &
echo "build v2.5b lanzado"
