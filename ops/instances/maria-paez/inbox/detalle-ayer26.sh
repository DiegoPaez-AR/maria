#!/bin/bash
cd /root/secretaria
echo "── los 15 turnos más caros del 26/8 ──"
timeout 40 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
tot=0
for r in db.execute("""SELECT timestamp, json_extract(metadata_json,'$.canal') c,
     json_extract(metadata_json,'$.cost_usd') usd,
     json_extract(metadata_json,'$.cache_creation') cw,
     json_extract(metadata_json,'$.cache_read') cr,
     json_extract(metadata_json,'$.turnos') t,
     json_extract(metadata_json,'$.sesion') s
   FROM eventos WHERE tipo='claude_call' AND date(timestamp)='2026-08-26' ORDER BY usd DESC LIMIT 15"""):
    print(f"   {r['timestamp'][11:16]} {str(r['c'] or '-'):<20} ${r['usd'] or 0:.3f}  cw={int((r['cw'] or 0)/1000):>4}k cr={int((r['cr'] or 0)/1000):>4}k ses={r['s'] or '-'} turnos={r['t']}")
print("\n── resumen por canal del 26/8 ──")
for r in db.execute("""SELECT json_extract(metadata_json,'$.canal') c, COUNT(*) n,
     SUM(json_extract(metadata_json,'$.cost_usd')) usd
   FROM eventos WHERE tipo='claude_call' AND date(timestamp)='2026-08-26' GROUP BY c ORDER BY usd DESC"""):
    print(f"   {str(r['c'] or '-'):<20} {r['n']:>3}t  ${r['usd'] or 0:.2f} (${(r['usd'] or 0)/max(r['n'],1):.3f}/t)")
db.close()
PY
echo LISTO
