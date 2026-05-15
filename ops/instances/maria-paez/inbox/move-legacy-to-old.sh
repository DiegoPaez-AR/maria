#!/bin/bash
# Mover dirs legacy a state/_old/<timestamp>/.
# Razón: post refactor multi-instance, el código vivo usa state/<slug>/.
# Verificación previa: lsof confirmó que nadie los tiene abiertos.
set +e
cd /root/secretaria || exit 1

STAMP=$(date +%Y%m%d-%H%M%S)
OLD_DIR="state/_old/$STAMP"
mkdir -p "$OLD_DIR"

echo "═══ Plan ═══"
echo "Destino: /root/secretaria/$OLD_DIR/"
echo ""

echo "═══ ANTES — tamaño raíz ═══"
du -sh /root/secretaria/db /root/secretaria/.wwebjs_auth /root/secretaria/.wwebjs_cache 2>/dev/null
echo ""
echo "tamaño total /root/secretaria:"
du -sh /root/secretaria 2>/dev/null

echo ""
echo "═══ Doble-check: ¿alguien tiene esto abierto? ═══"
fuser /root/secretaria/db/maria.sqlite /root/secretaria/db/maria.sqlite-wal 2>&1
lsof +D /root/secretaria/.wwebjs_auth 2>&1 | head -5
lsof +D /root/secretaria/.wwebjs_cache 2>&1 | head -5

echo ""
echo "═══ Moviendo ═══"
for dir in db .wwebjs_auth .wwebjs_cache; do
  if [ -d "/root/secretaria/$dir" ]; then
    mv "/root/secretaria/$dir" "$OLD_DIR/" && echo "  ✓ $dir → $OLD_DIR/$dir" || echo "  ✗ $dir falló"
  fi
done

echo ""
echo "═══ DESPUÉS — verificar estructura ═══"
ls -la /root/secretaria/ | grep -vE '^total' | awk '{print $1, $NF}' | head -40
echo ""
echo "estado de state/_old/:"
ls -la /root/secretaria/state/_old/ 2>/dev/null
du -sh "/root/secretaria/$OLD_DIR"/* 2>/dev/null

echo ""
echo "═══ ¿Maria sigue viva? ═══"
pm2 jlist 2>/dev/null | python3 -c "
import json, sys
ps = json.load(sys.stdin)
for p in ps:
    if p.get('name') != 'maria-paez': continue
    e = p.get('pm2_env', {})
    print(f\"  status={e.get('status')} restarts={e.get('restart_time')} uptime_ms={e.get('pm_uptime')}\")
"
echo ""
echo "  últimos 8 logs de pm2:"
pm2 logs maria-paez --lines 8 --nostream 2>&1 | tail -8

echo ""
echo "═══ tamaño raíz POST limpieza ═══"
du -sh /root/secretaria 2>/dev/null
echo "raíz sin dirs movidos:"
du -sh --exclude=node_modules --exclude=state /root/secretaria 2>/dev/null
