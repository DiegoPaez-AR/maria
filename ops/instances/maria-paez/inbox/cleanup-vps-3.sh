#!/bin/bash
set +e

cd /root/secretaria

echo "── 1. Carpeta _legacy/ — código viejo pre-multi-user ──"
if [ -d _legacy ]; then
  echo "  contenido:"
  ls -la _legacy/ | grep -v '^d' | awk '{print "    "$NF, "("$5" bytes,", $6, $7")"}'
  echo "  → borrando carpeta entera"
  rm -rf _legacy/
  echo "  done"
fi
echo

echo "── 2. .playwright-mcp/ — logs viejos (>7 días) ──"
if [ -d .playwright-mcp ]; then
  COUNT=$(find .playwright-mcp -type f -mtime +7 2>/dev/null | wc -l)
  echo "  archivos >7d encontrados: $COUNT"
  find .playwright-mcp -type f -mtime +7 -delete 2>/dev/null
  echo "  borrados"
  echo "  estado actual:"
  du -sh .playwright-mcp 2>/dev/null
fi
echo

echo "── 3. Estado final completo de /root/secretaria/ ──"
ls -la /root/secretaria/ | grep -v '^total\|^\.$\|^\.\.$'
