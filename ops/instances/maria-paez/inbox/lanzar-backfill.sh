#!/bin/bash
set +e
cd /root/secretaria || exit 1
if pgrep -f 'backfill-perfiles.js' >/dev/null; then echo "backfill YA está corriendo (pid $(pgrep -f backfill-perfiles.js)) — no relanzo"; exit 0; fi
nohup node /root/secretaria/backfill-perfiles.js > /tmp/backfill-perfiles.log 2>&1 &
echo "backfill lanzado, pid=$! — log /tmp/backfill-perfiles.log"
sleep 4
echo "--- primeras líneas ---"; head -6 /tmp/backfill-perfiles.log 2>/dev/null
