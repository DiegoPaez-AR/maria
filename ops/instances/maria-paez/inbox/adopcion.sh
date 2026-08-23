#!/bin/bash
cd /root/secretaria
echo "── canary del deploy anterior ──"; cat state/.canary-bad-commit 2>/dev/null && echo "⚠️ MALO" || echo "limpio ✓"
echo ""
echo "════ ADOPCIÓN REAL POR USUARIO ════"
timeout 40 python3 - <<'PY'
import sqlite3,os
from datetime import datetime
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
print(f"  {'usuario':<20} {'alta':<11} {'último msg':<11} {'días':>5} {'total':>6} {'30d':>5}  canal")
filas=[]
for u in db.execute("SELECT id,nombre,creado,telegram_chat_id,email FROM usuarios WHERE activo=1 ORDER BY id"):
    r=db.execute("""SELECT MAX(timestamp) ult, COUNT(*) n FROM eventos
       WHERE usuario_id=? AND direccion='entrante' AND canal IN ('whatsapp','telegram','gmail')""",(u['id'],)).fetchone()
    r30=db.execute("""SELECT COUNT(*) n FROM eventos WHERE usuario_id=? AND direccion='entrante'
       AND canal IN ('whatsapp','telegram','gmail') AND timestamp >= datetime('now','-30 days')""",(u['id'],)).fetchone()
    canales=[x[0] for x in db.execute("""SELECT DISTINCT canal FROM eventos WHERE usuario_id=? AND direccion='entrante'
       AND canal IN ('whatsapp','telegram','gmail')""",(u['id'],))]
    ult=r['ult']
    dias='—'
    if ult:
        try: dias=str((datetime.utcnow()-datetime.strptime(ult[:19],'%Y-%m-%d %H:%M:%S')).days)
        except Exception: pass
    filas.append((u['nombre'], (u['creado'] or '')[:10], (ult or '—')[:10], dias, r['n'] or 0, r30['n'] or 0, ','.join(canales) or '—', 'TG' if u['telegram_chat_id'] else ''))
filas.sort(key=lambda f: -f[5])
for f in filas:
    print(f"  {f[0]:<20} {f[1]:<11} {f[2]:<11} {f[3]:>5} {f[4]:>6} {f[5]:>5}  {f[6]:<18} {f[7]}")
act30=sum(1 for f in filas if f[5]>0)
print(f"\n  ACTIVOS en 30 días: {act30} de {len(filas)}")
print(f"  Vinculados a Telegram: {sum(1 for f in filas if f[7])} de {len(filas)}")
print("\n  ── salientes de Maria por usuario (30d): ¿le habla y no le contestan? ──")
for r in db.execute("""SELECT u.nombre, COUNT(*) n FROM eventos e JOIN usuarios u ON u.id=e.usuario_id
   WHERE e.direccion='saliente' AND e.canal IN ('whatsapp','telegram','gmail')
     AND e.timestamp >= datetime('now','-30 days') GROUP BY u.nombre ORDER BY n DESC"""):
    print(f"   {r['nombre']:<22} {r['n']}")
db.close()
PY
echo LISTO
