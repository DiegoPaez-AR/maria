#!/bin/bash
cd /root/secretaria
grep -A 20 "canary FALLO" ops/.cron.log | tail -35
echo LISTO
