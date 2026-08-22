#!/bin/bash
cd /root/secretaria
timeout 30 python3 - <<'PY'
import sqlite3,os,json
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
print("── turnos de HOY por Telegram, con tokens ──")
q="""SELECT timestamp,
        json_extract(metadata_json,'$.tokens_in')       tin,
        json_extract(metadata_json,'$.tokens_out')      tout,
        json_extract(metadata_json,'$.cache_read')      cr,
        json_extract(metadata_json,'$.cache_creation')  cc,
        json_extract(metadata_json,'$.canal')           canal,
        json_extract(metadata_json,'$.sesion')          ses,
        json_extract(metadata_json,'$.cost_usd')        cost
     FROM eventos
     WHERE timestamp >= datetime('now','-6 hours')
       AND json_extract(metadata_json,'$.tokens_in') IS NOT NULL
     ORDER BY timestamp"""
rs=db.execute(q).fetchall()
print(f"{'hora':<20}{'canal':<10}{'sesion':<9}{'in':>8}{'out':>7}{'cacheR':>9}{'cacheW':>9}{'usd':>9}")
tot=0
for r in rs:
    print(f"{r['timestamp']:<20}{str(r['canal'] or '-'):<10}{str(r['ses'] or '-'):<9}"
          f"{str(r['tin'] or 0):>8}{str(r['tout'] or 0):>7}{str(r['cr'] or 0):>9}{str(r['cc'] or 0):>9}"
          f"{(('%.4f'%r['cost']) if r['cost'] else '-'):>9}")
    tot += (r['cost'] or 0)
print(f"\ntotal de esos turnos: US$ {tot:.4f}")
print("\n── comparación: turnos por Telegram de AYER (sin sesiones) ──")
q2="""SELECT AVG(json_extract(metadata_json,'$.tokens_in')) a,
             COUNT(*) n
      FROM eventos
      WHERE timestamp >= datetime('now','-4 days') AND timestamp < datetime('now','-8 hours')
        AND json_extract(metadata_json,'$.tokens_in') IS NOT NULL
        AND json_extract(metadata_json,'$.canal') = 'telegram'"""
r=db.execute(q2).fetchone()
print(f"  promedio tokens_in por turno TG (últimos días, sin sesión): {round(r['a'] or 0)}  (n={r['n']})")
db.close()
PY
echo LISTO
