#!/bin/bash
set +e
echo "── pm2 list ──"
pm2 list 2>&1 | head -20
echo
echo "── últimas 800 líneas pm2 logs maria (filtrado a eventos clave) ──"
pm2 logs maria --lines 1500 --nostream 2>&1 | grep -E 'change_state|disconnected|qr|auth|brief|morning|claude exit|Error|TypeError|ECONN|frame muerto|SIGINT|iniciando|WA loading|ready|crash' | tail -120
