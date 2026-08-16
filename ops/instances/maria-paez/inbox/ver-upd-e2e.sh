#!/bin/bash
echo "── logs [MB] últimos 10 min (versión + updater + servicios) ──"
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | tail -12
echo LISTO
