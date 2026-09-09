#!/bin/bash
cd /root/secretaria
ls -la /tmp/canary-tick.log; grep -nE "^not ok|# fail|canary" /tmp/canary-tick.log | head; grep -n "not ok" -A12 /tmp/canary-tick.log | head -40
git log --oneline -3 | cat; git status --short | head -5
ls -la ops/instances/maria-paez/snapshots/ | grep -i canary
echo LISTO
