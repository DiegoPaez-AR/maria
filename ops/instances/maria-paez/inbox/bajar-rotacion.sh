#!/bin/bash
cd /root/secretaria
CF=$(ls config/instances/*.conf | head -1)
grep -q '^MARIA_SESION_MAX_TURNOS=' "$CF" && sed -i 's/^MARIA_SESION_MAX_TURNOS=.*/MARIA_SESION_MAX_TURNOS=12/' "$CF" || echo 'MARIA_SESION_MAX_TURNOS=12' >> "$CF"
grep -E '^MARIA_SESION' "$CF"
timeout 60 pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK"
echo "── costo por turno de telegram, últimas 24h (para comparar mañana) ──"
timeout 25 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
for r in db.execute("""SELECT timestamp,
     json_extract(metadata_json,'$.cache_read') cr,
     json_extract(metadata_json,'$.cache_creation') cc,
     json_extract(metadata_json,'$.cost_usd') usd
   FROM eventos WHERE json_extract(metadata_json,'$.canal')='telegram'
     AND timestamp >= datetime('now','-24 hours') ORDER BY timestamp"""):
    print(f"  {r['timestamp']}  cacheR={r['cr'] or 0:>7}  cacheW={r['cc'] or 0:>7}  US$ {r['usd'] or 0:.4f}")
db.close()
PY
echo LISTO
