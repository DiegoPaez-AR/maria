#!/bin/bash
# 1) Chequear errores en logs desde el último reload (~15:39 ART)
# 2) Si no hay nada crítico, pm2 flush para empezar de cero.
set +e

echo "═══ 1) PM2 status actual ═══"
pm2 jlist 2>/dev/null | python3 -c "
import json, sys
ps = json.load(sys.stdin)
for p in ps:
    if p.get('name') != 'maria-paez': continue
    e = p.get('pm2_env', {})
    print(f\"  pid={p.get('pid')} status={e.get('status')} restarts={e.get('restart_time')}\")
    uptime_min = int((p.get('monit',{}).get('cpu',0), 0)[1] if False else 0)
    print(f\"  pm_uptime ms: {e.get('pm_uptime')}\")
"

echo ""
echo "═══ 2) Errores/warnings desde el último arranque ═══"
# Tomar logs desde la última vez que arrancó Maria (banner 'iniciando…')
# y filtrar líneas que contengan signos de error/falla.
pm2 logs maria-paez --lines 1000 --nostream 2>&1 | tac | awk '/iniciando…/{p=1} p' | tac | \
  grep -iE 'error|falló|failed|ENOENT|fatal|invalid|unauthorized|crash|reject|warn|⚠️' | \
  grep -vE '\[meeting-prep\] activo|\[morning-brief\] activo|\[calendar-watch\] activo' | \
  tail -40

echo ""
echo "═══ 3) Resumen logs por categoria post-arranque ═══"
pm2 logs maria-paez --lines 1000 --nostream 2>&1 | tac | awk '/iniciando…/{p=1} p' | tac | \
  awk '
    /\[GMAIL/ {gmail++}
    /\[WA →/ {wa_out++}
    /\[WA ←/ {wa_in++}
    /\[morning-brief/ && /✓/ {brief_ok++}
    /\[meeting-prep\/.*\+ id=/ {mtg++}
    /falló|error/i {err++}
    END {
      print "  Gmail eventos:", gmail+0
      print "  WA salientes:", wa_out+0
      print "  WA entrantes:", wa_in+0
      print "  morning-brief OK:", brief_ok+0
      print "  meeting-prep alertas creadas:", mtg+0
      print "  errors/falló:", err+0
    }
  '

echo ""
echo "═══ 4) pm2 flush — borrar todos los logs ═══"
pm2 flush maria-paez 2>&1 | tail -5

echo ""
echo "═══ 5) Verificar archivos de log vacíos ═══"
ls -la ~/.pm2/logs/maria-paez-* 2>/dev/null

echo ""
echo "═══ 6) Confirmación: pm2 logs --lines 10 (debería estar vacío o casi) ═══"
pm2 logs maria-paez --lines 10 --nostream 2>&1 | tail -10
