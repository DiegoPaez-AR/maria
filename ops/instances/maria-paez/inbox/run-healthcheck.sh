#!/bin/bash
# Probar healthcheck.sh recién pusheado
set +e
cd /root/secretaria

echo "═══ Permisos del script ═══"
ls -la ops/healthcheck.sh

echo ""
echo "═══ Ejecución (output completo) ═══"
bash ops/healthcheck.sh
EXIT_CODE=$?
echo ""
echo "═══ Exit code: $EXIT_CODE ═══"
