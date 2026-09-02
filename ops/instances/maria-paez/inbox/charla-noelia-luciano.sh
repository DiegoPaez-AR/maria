#!/bin/bash
cd /root/secretaria
echo "── hora ──"; date
timeout 40 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
print("════ TODO lo que menciona a Noelia / Luciano (Diego + terceros), desde el 25/8 ════")
for r in db.execute("""SELECT timestamp,canal,direccion,COALESCE(nombre,de) q,substr(cuerpo,1,260) c FROM eventos
   WHERE timestamp >= '2026-08-25' AND canal IN ('whatsapp','telegram','gmail')
     AND (cuerpo LIKE '%Noelia%' OR cuerpo LIKE '%Luciano%' OR cuerpo LIKE '%NB LP%'
          OR nombre LIKE '%Noelia%' OR nombre LIKE '%Luciano%' OR de LIKE '%59524645%' OR de LIKE '%55947242%')
   ORDER BY timestamp"""):
    f='→' if r['direccion']=='entrante' else '←'
    print(f" {r['timestamp'][5:16]} {r['canal'][:3]} {f} {(r['q'] or '?')[:16]:<16} {(r['c'] or '').replace(chr(10),' | ')}")
print("\n── el evento en calendario ──")
PY
timeout 60 node -e "
(async()=>{
  const pb=require('/root/secretaria/prompt-builder');
  const u=require('/root/secretaria/usuarios').obtenerOwner();
  const a=await pb.seccionAgenda(u,{dias:2});
  console.log(a.split('\n').filter(l=>/NB LP|Noelia|Luciano|02\/09/.test(l)).join('\n'));
})().catch(e=>console.log('ERR',e.message));" 2>&1 | grep -v Warning
echo "── pendientes/follow-ups relacionados ──"
timeout 20 node -e "
const mem=require('/root/secretaria/memory');
mem.db.prepare(\"SELECT id,desc,dueno,estado FROM pendientes WHERE desc LIKE '%Noelia%' OR desc LIKE '%Luciano%' ORDER BY id DESC LIMIT 6\").all().forEach(p=>console.log(' P',JSON.stringify(p)));
mem.db.prepare(\"SELECT id,descripcion,estado FROM follow_ups WHERE descripcion LIKE '%Noelia%' OR descripcion LIKE '%Luciano%' ORDER BY id DESC LIMIT 4\").all().forEach(p=>console.log(' FU',JSON.stringify(p)));"
echo LISTO
