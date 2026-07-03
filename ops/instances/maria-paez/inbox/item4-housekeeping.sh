#!/bin/bash
# Punto 4: housekeeping. Node 22 lleva 24h estable con tráfico real → chau backup del binario.
rm -f /usr/bin/node18.bak && echo "node18.bak borrado (rollback ahora = nodesource setup_18.x si hiciera falta)"
ls -la /usr/bin/node* 2>/dev/null | head -3
# de paso: limpiar los .env-intensa-api.bak viejos con secrets pre-rotación
cd /root/secretaria
ls .env-intensa-api.bak.* .env-intensa-api.pre-lemon-cleanup 2>/dev/null | wc -l
rm -f .env-intensa-api.bak.* .env-intensa-api.pre-lemon-cleanup && echo "backups viejos de .env borrados (secrets pre-rotación)"
echo LISTO
