#!/bin/bash
set +e

cd /root/secretaria

echo "════════════════════════════════════════════════════════════════"
echo "    MIGRACIÓN: archivos legacy → state/maria-paez/"
echo "════════════════════════════════════════════════════════════════"
echo

STATE_DIR=/root/secretaria/state/maria-paez

# Idempotencia: si ya existe state/maria-paez/db/maria.sqlite, asumimos que
# la migración ya pasó.
if [ -f "$STATE_DIR/db/maria.sqlite" ]; then
  echo "── ya migrado (state/maria-paez/db/maria.sqlite existe). Skipping. ──"
  pm2 list 2>&1 | head -8
  exit 0
fi

echo "── 1. pm2 stop maria-paez (libera locks) ──"
pm2 stop maria-paez 2>&1 | tail -3
sleep 2
echo

echo "── 2. Crear estructura state/maria-paez/ ──"
mkdir -p "$STATE_DIR/db"
echo "  done"
echo

echo "── 3. Mover archivos a state/maria-paez/ ──"
# DB
if [ -f db/maria.sqlite ]; then
  mv db/maria.sqlite                "$STATE_DIR/db/maria.sqlite"
  echo "  ✓ db/maria.sqlite"
fi
# WAL/SHM si existen (sqlite WAL mode)
[ -f db/maria.sqlite-wal ] && mv db/maria.sqlite-wal "$STATE_DIR/db/" && echo "  ✓ db/maria.sqlite-wal"
[ -f db/maria.sqlite-shm ] && mv db/maria.sqlite-shm "$STATE_DIR/db/" && echo "  ✓ db/maria.sqlite-shm"

# WA Web auth + cache
if [ -d .wwebjs_auth ]; then
  mv .wwebjs_auth "$STATE_DIR/.wwebjs_auth"
  echo "  ✓ .wwebjs_auth/"
fi
if [ -d .wwebjs_cache ]; then
  mv .wwebjs_cache "$STATE_DIR/.wwebjs_cache"
  echo "  ✓ .wwebjs_cache/"
fi

# Google OAuth
if [ -f token.json ]; then
  mv token.json "$STATE_DIR/token.json"
  echo "  ✓ token.json"
fi
if [ -f credentials.json ]; then
  mv credentials.json "$STATE_DIR/credentials.json"
  echo "  ✓ credentials.json"
fi
# Backup reciente
for bak in token.json.bak.*; do
  [ -f "$bak" ] || continue
  mv "$bak" "$STATE_DIR/$bak"
  echo "  ✓ $bak"
done
echo

echo "── 4. Verificar archivos en nueva ubicación ──"
ls -la "$STATE_DIR/" "$STATE_DIR/db/" 2>&1 | head -20
echo

echo "── 5. pm2 delete + start (carga .conf nuevo) ──"
pm2 delete maria-paez 2>&1 | tail -2
pm2 start ecosystem.config.js 2>&1 | tail -8
echo

echo "── 6. Esperar 5s y mirar log ──"
sleep 5
pm2 logs maria-paez --lines 25 --nostream 2>&1 | tail -25
echo

echo "── 7. Estado final raíz ──"
echo "  archivos sueltos en /root/secretaria:"
ls -la /root/secretaria/ | grep -v '^d' | awk '{print "    "$NF, "("$5" bytes)"}' | grep -v '^    \.$\|^    \.\.$'
echo
echo "  carpetas:"
ls /root/secretaria/ | grep -v '^\.$\|^\.\.$'
echo
echo "  state/maria-paez/ size:"
du -sh "$STATE_DIR" 2>&1
