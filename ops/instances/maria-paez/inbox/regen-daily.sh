#!/bin/bash
cd /root/secretaria
echo "corriendo daily-report a pedido de Diego (para ver la columna de uso)..."
timeout 240 /usr/bin/node daily-report.js 2>&1 | tail -5
echo LISTO
