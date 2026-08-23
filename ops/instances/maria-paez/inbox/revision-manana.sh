#!/bin/bash
cd /root/secretaria
echo "── hora ──"; date
echo ""
echo "── ERRORES del runtime (hoy) ──"
timeout 20 grep "2026-08-23" /root/.pm2/logs/maria-paez-error.log 2>/dev/null | tail -25
echo ""
echo "── acciones que fallaron hoy ──"
timeout 20 grep -E "2026-08-23.*(acción #|falló|FALLÓ|error)" /root/.pm2/logs/maria-paez-out.log | tail -20
echo ""
echo "── conversación de Diego hoy (todos los canales) ──"
timeout 30 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
for r in db.execute("""SELECT timestamp,canal,direccion,substr(cuerpo,1,170) c FROM eventos
   WHERE usuario_id=1 AND canal IN ('whatsapp','telegram','gmail')
     AND timestamp >= datetime('now','-14 hours') ORDER BY timestamp"""):
    f='→' if r['direccion']=='entrante' else '←'
    print(f" {r['timestamp']} {r['canal'][:3]} {f} {(r['c'] or '').replace(chr(10),' | ')}")
print("\n── eventos de sistema (descartes, fallos, avisos) ──")
for r in db.execute("""SELECT timestamp,substr(cuerpo,1,150) c FROM eventos
   WHERE canal='sistema' AND timestamp >= datetime('now','-14 hours') ORDER BY timestamp"""):
    print(' ',r['timestamp'],'|',(r['c'] or '').replace(chr(10),' '))
db.close()
PY
echo ""
echo "── barrido de notificaciones ──"
timeout 15 grep -E "barrido|RECUPERO" /root/.pm2/logs/maria-paez-out.log | tail -8
echo ""
echo "── sesiones (turnos / rotaciones) ──"
timeout 15 grep -E "TG sesion|GMAIL sesion" /root/.pm2/logs/maria-paez-out.log | tail -6
echo LISTO
