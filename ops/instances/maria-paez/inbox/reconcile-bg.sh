#!/bin/bash
cd /root/secretaria
nohup bash ops/scripts/gcontacts-reconcile.sh > /tmp/reconcile-0909.log 2>&1 &
echo "reconcile lanzado en background (pid $!) — ~6 min"
echo LISTO
