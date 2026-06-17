#!/bin/bash
set +e
cd /root/secretaria || exit 1
node -e '
const mem=require("/root/secretaria/memory"); const db=mem.db;
const art=(ts)=>{try{return new Date(String(ts).replace(" ","T")+"Z").toLocaleString("es-AR",{timeZone:"America/Argentina/Buenos_Aires",hour12:false});}catch{return ts;}};
console.log("== pendientes uid=1 relacionados a Kona/reserva/sabado/corner ==");
const p=db.prepare("SELECT id,estado,dueno,disparador,desc,meta_json,creado,cerrado FROM pendientes WHERE usuario_id=1 AND (desc LIKE ? OR desc LIKE ? OR desc LIKE ? OR desc LIKE ? OR desc LIKE ?) ORDER BY id DESC LIMIT 15").all("%ona%","%eserva%","%ábado%","%abado%","%orner%");
for(const x of p){ let m=""; try{const j=JSON.parse(x.meta_json||"{}"); m=JSON.stringify(j);}catch{}; console.log(`#${x.id} [${x.estado}] dueno=${x.dueno} disp=${x.disparador} creado=${art(x.creado)}\n   desc: ${x.desc}\n   meta: ${m}`); }
console.log("\n== últimos pendientes abiertos uid=1 (todos, por las dudas) ==");
for(const x of db.prepare("SELECT id,estado,dueno,disparador,desc,creado FROM pendientes WHERE usuario_id=1 AND estado=\"abierto\" ORDER BY id DESC LIMIT 12").all()) console.log(`#${x.id} [${x.estado}] ${x.dueno}/${x.disparador} ${art(x.creado)} :: ${String(x.desc).slice(0,120)}`);
' 2>&1
