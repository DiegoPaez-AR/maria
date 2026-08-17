#!/bin/bash
grep -B2 -A6 "canary FALLO\|canary FALLÓ" /root/secretaria/ops/.cron.log | tail -25
echo LISTO
