#!/bin/bash
cd /root/secretaria
echo "── gasto por DÍA, último mes (recalculado desde tokens, precio intro) ──"
timeout 60 python3 - <<'PY'
import sqlite3,os,json
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
P={'main':{'in':2,'out':10,'cr':0.20,'cw':2.50},'haiku':{'in':1,'out':5,'cr':0.10,'cw':1.25}}
rows=db.execute("""SELECT date(timestamp) d, json_extract(metadata_json,'$.canal') c,
   json_extract(metadata_json,'$.tokens_in') tin, json_extract(metadata_json,'$.tokens_out') tout,
   json_extract(metadata_json,'$.cache_read') cr, json_extract(metadata_json,'$.cache_creation') cw,
   json_extract(metadata_json,'$.cost_usd') cli
   FROM eventos WHERE tipo='claude_call' AND timestamp >= datetime('now','-30 days')""").fetchall()
dias={}
for r in rows:
    p=P['haiku' if r['c']=='moderacion' else 'main']
    usd=((r['tin'] or 0)*p['in']+(r['tout'] or 0)*p['out']+(r['cr'] or 0)*p['cr']+(r['cw'] or 0)*p['cw'])/1e6 if (r['tin'] is not None or r['tout'] is not None) else float(r['cli'] or 0)
    e=dias.setdefault(r['d'],{'usd':0,'n':0,'cw':0})
    e['usd']+=usd; e['n']+=1; e['cw']+=(r['cw'] or 0)
print(f"  {'día':<12}{'turnos':>7}{'USD':>8}{'cacheW(k)':>11}")
for d in sorted(dias):
    e=dias[d]
    print(f"  {d:<12}{e['n']:>7}{e['usd']:>8.2f}{e['cw']/1000:>11.0f}")
print("\n── HOY por canal, con detalle de los turnos caros ──")
hoy=db.execute("SELECT date('now')").fetchone()[0]
for r in db.execute("""SELECT json_extract(metadata_json,'$.canal') c, COUNT(*) n,
     SUM(json_extract(metadata_json,'$.cost_usd')) usd,
     SUM(json_extract(metadata_json,'$.cache_creation')) cw,
     SUM(json_extract(metadata_json,'$.cache_read')) cr
   FROM eventos WHERE tipo='claude_call' AND date(timestamp)=? GROUP BY c ORDER BY usd DESC""",(hoy,)):
    print(f"   {str(r['c'] or '-'):<18} {r['n']:>3}t  ${r['usd'] or 0:.2f}  cacheW={int((r['cw'] or 0)/1000)}k cacheR={int((r['cr'] or 0)/1000)}k")
print("\n── los 8 turnos más caros de hoy ──")
for r in db.execute("""SELECT timestamp, json_extract(metadata_json,'$.canal') c,
     json_extract(metadata_json,'$.cost_usd') usd,
     json_extract(metadata_json,'$.cache_creation') cw,
     json_extract(metadata_json,'$.cache_read') cr,
     json_extract(metadata_json,'$.turnos') t
   FROM eventos WHERE tipo='claude_call' AND date(timestamp)=? ORDER BY usd DESC LIMIT 8""",(hoy,)):
    print(f"   {r['timestamp'][11:16]} {str(r['c'] or '-'):<12} ${r['usd'] or 0:.3f}  cw={int((r['cw'] or 0)/1000)}k cr={int((r['cr'] or 0)/1000)}k turnos={r['t']}")
db.close()
PY
echo LISTO
