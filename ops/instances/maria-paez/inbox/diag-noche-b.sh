#!/bin/bash
cat > /tmp/dnb.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
console.log("== eventos 23:20-23:30 UTC (el saludo a Santiago) ==");
db.prepare(`SELECT timestamp,canal,direccion,substr(cuerpo,1,110) c FROM eventos WHERE timestamp BETWEEN '2026-08-17 23:20' AND '2026-08-17 23:30' AND (cuerpo LIKE '%antiago%' OR cuerpo LIKE '%enviar_wa%' OR cuerpo LIKE '%saludo%' OR canal='whatsapp') ORDER BY id`).all()
  .forEach(x=>console.log(x.timestamp.slice(11,19),x.canal,x.direccion||"",":",String(x.c).replace(/\n/g," ")));
console.log("== transcript del audio de Diego 23:22 (¿whisper small?) ==");
db.prepare(`SELECT timestamp,substr(cuerpo,1,150) c FROM eventos WHERE canal='whatsapp' AND direccion='entrante' AND cuerpo LIKE '%transcripto%' AND timestamp>='2026-08-17 23:00' ORDER BY id DESC LIMIT 2`).all()
  .forEach(x=>console.log(x.timestamp.slice(11,19),"|",String(x.c).replace(/\n/g," ")));
db.close();
JS
node /tmp/dnb.cjs; rm -f /tmp/dnb.cjs
echo "== quien genera 'Te debo consulta' =="
grep -rln "Te debo consulta" /root/secretaria/*.js | head -3
grep -rn "Te debo consulta" /root/secretaria/*.js 2>/dev/null | head -3
echo "== cadencia (contexto) =="
F=$(grep -rln "Te debo consulta" /root/secretaria/*.js | head -1)
[ -n "$F" ] && grep -n "hora\|HORAS\|_MS\|ultimo_recordatorio\|cadencia" "$F" | head -8
echo LISTO
