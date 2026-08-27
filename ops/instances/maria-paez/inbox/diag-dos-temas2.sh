#!/bin/bash
cd /root/secretaria
echo "════ 1a. ¿Qué le respondió Maria a Manuel el 24/8 cuando preguntó si era virtual? ════"
timeout 40 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
print("── hilo de mail con Manuel (salientes incluidos, por metadata) ──")
for r in db.execute("""SELECT timestamp,canal,direccion,substr(cuerpo,1,250) c FROM eventos
   WHERE timestamp >= '2026-08-21' AND canal='gmail'
     AND (de LIKE '%manucarrasco%' OR cuerpo LIKE '%Manuel%' OR metadata_json LIKE '%manucarrasco%')
   ORDER BY timestamp"""):
    f='→' if r['direccion']=='entrante' else '←'
    print(f" {r['timestamp'][5:16]} {f} {(r['c'] or '').replace(chr(10),' | ')[:240]}")
print("\n── el evento en el calendario: ¿tiene Meet? ──")
PY
timeout 40 node -e "
const g=require('/root/secretaria/google');
(async()=>{
  const evs=await g.listarEventos({desde:new Date('2026-08-27T00:00:00-03:00'),hasta:new Date('2026-08-28T00:00:00-03:00')}).catch(e=>null);
  if(!evs){console.log('  (no pude listar)');return;}
  for(const e of evs){
    const s=e.summary||'';
    if(/manuel|fulco|hern/i.test(s+JSON.stringify(e.attendees||[]))){
      console.log('  ▸', s, '|', e.start?.dateTime||e.start?.date, '→', e.end?.dateTime||'');
      console.log('    ubicación:', e.location||'(sin ubicación)');
      console.log('    meet:', e.hangoutLink||e.conferenceData?'SÍ TIENE':'no');
      console.log('    attendees:', (e.attendees||[]).map(a=>a.email).join(', '));
      console.log('    descripción:', String(e.description||'').slice(0,150));
    }
  }
})();" 2>&1 | grep -v Warning
echo ""
echo "════ 2. Fulco → reunión con Ruben Ward: TODO el intercambio ════"
timeout 40 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
uid=db.execute("SELECT id FROM usuarios WHERE nombre='Hernan Fulco'").fetchone()[0]
for r in db.execute("""SELECT timestamp,canal,direccion,substr(cuerpo,1,250) c FROM eventos
   WHERE usuario_id=? AND timestamp >= datetime('now','-3 days')
     AND canal IN ('whatsapp','telegram','gmail') ORDER BY timestamp""",(uid,)):
    f='→' if r['direccion']=='entrante' else '←'
    print(f" {r['timestamp'][5:16]} {r['canal'][:4]} {f} {(r['c'] or '').replace(chr(10),' | ')[:240]}")
print("\n── razonamientos de los turnos de Fulco (sistema) ──")
for r in db.execute("""SELECT timestamp,substr(cuerpo,1,250) c FROM eventos
   WHERE canal='sistema' AND timestamp >= datetime('now','-3 days')
     AND (cuerpo LIKE '%Fulco%' OR cuerpo LIKE '%Ward%') ORDER BY timestamp"""):
    print(f" {r['timestamp'][5:16]} {(r['c'] or '').replace(chr(10),' ')[:240]}")
print("\n── pendientes de Fulco ──")
for r in db.execute("SELECT id,desc,dueno,estado,creado FROM pendientes WHERE usuario_id=? ORDER BY id DESC LIMIT 6",(uid,)):
    print(' ',dict(r))
db.close()
PY
echo LISTO
