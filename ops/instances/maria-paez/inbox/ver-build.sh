#!/bin/bash
echo "── proceso ──"; pgrep -f mb-build-worker >/dev/null && echo "CORRIENDO" || echo "terminó (o no arrancó)"
echo "── últimas 30 del log ──"
tail -30 /root/mariabridge-build.log 2>/dev/null || echo "sin log aún"
echo LISTO
