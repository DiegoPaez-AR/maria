#!/bin/bash
set +e
cd /root/secretaria
echo "── .playwright-mcp/ logs antes ──"
ls -la .playwright-mcp/ 2>&1 | head -10
echo
echo "── borrando logs ──"
rm -fv .playwright-mcp/*.log .playwright-mcp/*.yml 2>/dev/null
echo
echo "── después ──"
du -sh .playwright-mcp 2>&1
ls -la .playwright-mcp/ 2>&1 | head -5
