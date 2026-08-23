#!/bin/bash
cd /root/secretaria
echo "── hora ──"; date
echo "── errores del runtime (24h, sin los fetch failed de TG) ──"
timeout 20 grep -E "2026-08-2[23]" /root/.pm2/logs/maria-paez-error.log 2>/dev/null | grep -v "fetch failed" | tail -12
echo "  fetch-failed de Telegram (transitorios): $(timeout 10 grep -c 'fetch failed' /root/.pm2/logs/maria-paez-error.log 2>/dev/null)"
echo "── acciones fallidas / avisos honestos (24h) ──"
timeout 20 grep -E "2026-08-2[23].*(acción #.*falló|FALLIDA|MB-FALLO|loop_guard)" /root/.pm2/logs/maria-paez-out.log | tail -10
echo "── actividad y costo ──"
timeout 30 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
print("  canal      entrante  saliente")
for r in db.execute("""SELECT canal, SUM(direccion='entrante') e, SUM(direccion='saliente') s
   FROM eventos WHERE timestamp >= datetime('now','-24 hours')
     AND canal IN ('whatsapp','telegram','gmail') GROUP BY canal"""):
    print(f"  {r['canal']:<10} {r['e'] or 0:>7}  {r['s'] or 0:>8}")
print("  usuarios que escribieron (24h):")
for r in db.execute("""SELECT u.nombre, COUNT(*) n FROM eventos e JOIN usuarios u ON u.id=e.usuario_id
   WHERE e.timestamp >= datetime('now','-24 hours') AND e.direccion='entrante'
     AND e.canal IN ('whatsapp','telegram','gmail') GROUP BY u.nombre ORDER BY n DESC LIMIT 8"""):
    print(f"   {r['nombre']:<22} {r['n']}")
print("  costo por canal (24h):")
tot=0
for r in db.execute("""SELECT json_extract(metadata_json,'$.canal') c, COUNT(*) n,
     SUM(json_extract(metadata_json,'$.cost_usd')) usd
   FROM eventos WHERE timestamp >= datetime('now','-24 hours')
     AND json_extract(metadata_json,'$.cost_usd') IS NOT NULL GROUP BY c ORDER BY usd DESC"""):
    print(f"   {str(r['c'] or '-'):<14} {r['n']:>3} turnos   US$ {r['usd'] or 0:.2f}")
    tot += r['usd'] or 0
print(f"   {'TOTAL':<14}              US$ {tot:.2f}")
print("  pendientes abiertos:")
for r in db.execute("SELECT dueno, COUNT(*) n FROM pendientes WHERE estado='abierto' GROUP BY dueno"):
    print(f"   dueno={r['dueno']}: {r['n']}")
db.close()
PY
echo "── barrido de notificaciones ──"
timeout 15 grep -E "barrido|RECUPERO" /root/.pm2/logs/maria-paez-out.log | tail -4
echo "── sesión de Diego ──"
timeout 15 node -e "const mem=require('/root/secretaria/memory'); console.log('  ', mem.getEstadoUsuario(1,'claude_sesion')||'(sin sesión)');"
echo LISTO
