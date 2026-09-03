#!/bin/bash
cd /root/secretaria
echo "═══ DRY-RUN alta sofia-bruscoli ═══"
timeout 120 bash ops/provision/nueva-instancia.sh sofia-bruscoli "Sofia Bruscoli" sofia@luminaconsultora.com --dry-run 2>&1 | tail -60
echo LISTO
