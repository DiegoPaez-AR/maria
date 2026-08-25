#!/bin/bash
cd /root/secretaria
echo "── hora ──"; date
echo "── conversación de Diego por Telegram (últimas 3 horas) ──"
timeout 30 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
for r in db.execute("""SELECT timestamp,direccion,substr(cuerpo,1,220) c FROM eventos
   WHERE usuario_id=1 AND canal='telegram' AND timestamp >= datetime('now','-3 hours') ORDER BY timestamp"""):
    f='→' if r['direccion']=='entrante' else '←'
    print(f" {r['timestamp'][11:16]} {f} {(r['c'] or '').replace(chr(10),' | ')}")
print("\n── acciones y fallos del período ──")
for r in db.execute("""SELECT timestamp,substr(cuerpo,1,180) c FROM eventos
   WHERE canal='sistema' AND timestamp >= datetime('now','-3 hours') ORDER BY timestamp"""):
    print(f" {r['timestamp'][11:16]} {(r['c'] or '').replace(chr(10),' ')}")
db.close()
PY
echo ""
echo "── errores del runtime (3h) ──"
timeout 15 awk -v d="$(date '+%Y-%m-%d') $(date -d '3 hours ago' '+%H:%M')" '$0 >= d' /root/.pm2/logs/maria-paez-error.log 2>/dev/null | tail -20
echo "── out.log: fallos/turnos (3h) ──"
timeout 15 awk -v d="$(date '+%Y-%m-%d') $(date -d '3 hours ago' '+%H:%M')" '$0 >= d' /root/.pm2/logs/maria-paez-out.log 2>/dev/null | grep -iE "TG|executor|fall|error|acción|prosa|sinJson" | tail -25
echo LISTO
