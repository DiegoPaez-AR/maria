#!/bin/bash
cd /root/secretaria
timeout 60 python3 - <<'PY'
import sqlite3,os,re
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
# parsear cuerpo: prompt=NNNc ... cache_read=N new=N ... turnos=N
pat=re.compile(r'claude_call (\S+): .*?prompt=(\d+)c .*?cache_read=(\d+) new=(\d+)\) out=(\d+)t .*?turnos=(\d+)')
datos=[]
for r in db.execute("""SELECT cuerpo FROM eventos WHERE tipo='claude_call'
   AND timestamp >= datetime('now','-7 days')"""):
    m=pat.search(r['cuerpo'] or '')
    if m:
        canal,pc,cr,cw,out,t = m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4)), int(m.group(5)), int(m.group(6))
        datos.append((canal,pc,cr,cw,out,t))
print(f"muestras con telemetría completa: {len(datos)}")
# separar por canal principal
for canal in ('whatsapp','telegram','gmail'):
    d=[x for x in datos if x[0]==canal]
    if len(d)<3: continue
    print(f"\n── {canal} ({len(d)} turnos) ──")
    print(f"  {'promptKc':>9}{'cacheW(k)':>10}{'cacheR(k)':>10}{'out':>6}{'turnos':>7}")
    for x in sorted(d,key=lambda z:-z[3])[:6]:
        print(f"  {x[1]/1000:>9.0f}{x[3]/1000:>10.0f}{x[2]/1000:>10.0f}{x[4]:>6}{x[5]:>7}")
    # regresión simple cw = a + b*turnos
    n=len(d); sx=sum(x[5] for x in d); sy=sum(x[3] for x in d)
    sxx=sum(x[5]**2 for x in d); sxy=sum(x[5]*x[3] for x in d)
    den=n*sxx-sx*sx
    if den:
        b=(n*sxy-sx*sy)/den; a=(sy-b*sx)/n
        print(f"  ajuste: cacheW ≈ {a/1000:.0f}k + {b/1000:.1f}k × turnos_internos")
    tp=sum(x[5] for x in d)/n
    print(f"  promedio turnos internos: {tp:.1f} | cacheW medio: {sum(x[3] for x in d)/n/1000:.0f}k | prompt medio: {sum(x[1] for x in d)/n/1000:.0f}k chars")
db.close()
PY
echo LISTO
