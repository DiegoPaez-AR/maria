#!/bin/bash
set +e

cd /root/secretaria

echo "── 1. Borrar .js.bak* viejos (abril) ──"
for f in executor.js.bak google.js.bak google.js.bak.1777331900 prompt-builder.js.bak; do
  if [ -f "$f" ]; then
    SIZE=$(stat -c%s "$f")
    AGE=$(stat -c%y "$f" | cut -d' ' -f1)
    echo "  $f ($SIZE bytes, $AGE) → borro"
    rm "$f"
  fi
done
echo

echo "── 2. token.json.bak — mantener el más reciente, borrar viejos ──"
# El más reciente es 20260508-115436 (post-OAuth refresh), lo dejamos.
# El viejo 1777590754 (30 abril) se borra.
if [ -f token.json.bak.1777590754 ]; then
  echo "  token.json.bak.1777590754 (30 abril) → borro"
  rm token.json.bak.1777590754
fi
if [ -f token.json.bak.20260508-115436 ]; then
  echo "  token.json.bak.20260508-115436 (8 mayo) → mantengo (más reciente, por seguridad)"
fi
echo

echo "── 3. Logs sueltos (maria.log, whatsapp-debug.log) ──"
# Estos son logs antiguos no usados (pm2 maneja sus propios logs en /root/.pm2/logs/).
for f in maria.log whatsapp-debug.log; do
  if [ -f "$f" ]; then
    SIZE=$(stat -c%s "$f")
    AGE=$(stat -c%y "$f" | cut -d' ' -f1)
    echo "  $f ($SIZE bytes, $AGE) → borro"
    rm "$f"
  fi
done
echo

echo "── 4. Archivo raro '676' (sin nombre) ──"
# Vimos que listaba algo de 676 bytes con nombre vacío.
ls -la /root/secretaria/ | grep -E '^\-' | awk '$5 == 676 {print}'
echo

echo "── 5. Carpeta _legacy/ — qué hay ──"
if [ -d _legacy ]; then
  ls -la _legacy/
  echo "  → no borro automático, decidí vos"
fi
echo

echo "── 6. Carpeta .playwright-mcp/ — estado ──"
if [ -d .playwright-mcp ]; then
  du -sh .playwright-mcp 2>/dev/null
  ls -la .playwright-mcp/ | head -10
fi
echo

echo "── 7. Estado final ──"
ls -la /root/secretaria/ | grep -v '^d' | awk '{print $NF, "("$5" bytes)"}' | grep -v '^\.$\|^\.\.$' | head -40
