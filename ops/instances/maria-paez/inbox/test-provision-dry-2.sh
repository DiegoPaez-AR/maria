#!/bin/bash
cd /root/secretaria
bash ops/provision/nueva-instancia.sh maria-demo "Maria Demo" maria.demo@gmail.com --dry-run 2>&1 | head -12
echo LISTO
