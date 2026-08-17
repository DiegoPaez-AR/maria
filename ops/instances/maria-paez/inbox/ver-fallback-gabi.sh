#!/bin/bash
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
console.log('── TODOS los salientes a Gabi (u18) anoche 23:20+ y hoy 11:55+ UTC, con canal y metadata ──');
db.prepare(\"SELECT timestamp,canal,substr(cuerpo,1,45) c, metadata_json m FROM eventos WHERE usuario_id=18 AND direccion='saliente' AND (timestamp>='2026-08-16 23:20' AND timestamp<='2026-08-16 23:30' OR timestamp>='2026-08-17 11:55') ORDER BY id\").all().forEach(r=>{
  let via=''; try{const mm=JSON.parse(r.m||'{}'); via=mm.via||mm.fallback||mm.tipo||'';}catch{}
  console.log(r.timestamp.slice(5,16),r.canal,via,'|',String(r.c).replace(/\n/g,' '));});
db.close();"
echo "── wa-send: qué hace sin waClient (fallback) ──"
grep -n "fallback\|!waClient\|waClient) " /root/secretaria/wa-send.js | head -8
echo LISTO
