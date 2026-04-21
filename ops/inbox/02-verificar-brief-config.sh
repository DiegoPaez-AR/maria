#!/bin/bash
# Verificar que pm2 levantó con la config nueva del brief (4:00, ventana 4h)
echo "=== pm2 logs maria --lines 40 --nostream ==="
pm2 logs maria --lines 40 --nostream 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | tail -40
