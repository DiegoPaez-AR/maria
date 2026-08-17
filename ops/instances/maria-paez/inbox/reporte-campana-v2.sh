#!/bin/bash
set -uo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"
cd /root/secretaria
echo "=== REPORTE CAMPANA TELEGRAM v2 - $(date '+%Y-%m-%d %H:%M:%S %z') ==="
echo "DB=${MARIA_DB:-<sin MARIA_DB>}"
echo

cat > /tmp/rep-campana.js <<'JSEOF'
const Database = require("/root/secretaria/node_modules/better-sqlite3");
const db = new Database(process.env.MARIA_DB, { readonly: true });
const q = (s,...a)=>{ try { return db.prepare(s).all(...a); } catch(e){ console.log("  ERR: "+e.message); return []; } };
const cut = (s,n)=> (s==null?"":String(s).replace(/\s+/g," ").slice(0,n));

console.log("-- 1) PROGRAMADOS con Telegram --");
const prog = q("SELECT id, usuario_id, cuando, canal, destino, enviado, razon, texto FROM programados WHERE texto LIKE '%Telegram%' ORDER BY cuando");
console.log("   total: " + prog.length);
console.log("   enviado=1: " + prog.filter(p=>p.enviado).length + "   pendientes: " + prog.filter(p=>!p.enviado).length);
for (const p of prog) {
  console.log("   ["+p.id+"] "+p.cuando+" u="+p.usuario_id+" "+p.canal+"->"+p.destino+" enviado="+p.enviado+" razon="+(p.razon||"-"));
  console.log("        txt: " + cut(p.texto,90));
}
console.log();
console.log("   -- todos los programados de las ultimas 36h (por si el texto no dice Telegram) --");
const prog2 = q("SELECT id, usuario_id, cuando, canal, destino, enviado, razon, texto FROM programados WHERE datetime(cuando) >= datetime('now','-36 hours') ORDER BY cuando");
console.log("   total: " + prog2.length);
for (const p of prog2) {
  console.log("   ["+p.id+"] "+p.cuando+" u="+p.usuario_id+" "+p.canal+"->"+p.destino+" env="+p.enviado+" razon="+(p.razon||"-")+" :: "+cut(p.texto,70));
}
console.log();

console.log("-- 2) WA_OUTBOX ultimas 36h --");
const ob = q("SELECT id, creado, usuario_id, numero, estado, intentos, tomado_en, entregado, texto FROM wa_outbox WHERE datetime(creado) >= datetime('now','-36 hours') ORDER BY id");
console.log("   filas: " + ob.length);
const cnt = (arr,k)=>{const o={};for(const r of arr)o[r[k]]=(o[r[k]]||0)+1;return JSON.stringify(o);};
console.log("   por estado: " + cnt(ob,"estado"));
const obTg = ob.filter(r=>/Telegram/i.test(r.texto||""));
console.log("   campana (texto LIKE Telegram): " + obTg.length + "  " + cnt(obTg,"estado"));
for (const r of ob) {
  console.log("   ["+r.id+"] creado="+r.creado+" n="+r.numero+" u="+r.usuario_id+" estado="+r.estado+" int="+r.intentos+" entregado="+(r.entregado||"-"));
  console.log("        txt: " + cut(r.texto,80));
}
console.log();

console.log("-- 3) USUARIOS con telegram_chat_id --");
const us = q("SELECT id, nombre, email, wa_cus, telegram_chat_id, servido, activo FROM usuarios ORDER BY id");
const conTg = us.filter(u=>u.telegram_chat_id!=null && String(u.telegram_chat_id).trim()!=="");
console.log("   totales: "+us.length+"   con TG: "+conTg.length);
for (const u of conTg) console.log("   VINCULADO -> ["+u.id+"] "+u.nombre+" tg="+u.telegram_chat_id);
console.log("   sin TG: " + us.filter(u=>!u.telegram_chat_id).map(u=>u.nombre).join(", "));
console.log();

console.log("-- 4) EVENTOS ultimas 36h --");
const ev = q("SELECT id, timestamp, canal, direccion, de, nombre, usuario_id, tipo, cuerpo FROM eventos WHERE datetime(timestamp) >= datetime('now','-36 hours') ORDER BY timestamp");
console.log("   total: " + ev.length);
console.log("   por canal: " + cnt(ev,"canal") + "   por direccion: " + cnt(ev,"direccion"));
const ent = ev.filter(e=>String(e.direccion||"").match(/entrante|in/i));
console.log("   ENTRANTES: " + ent.length);
for (const e of ent) {
  console.log("   "+e.timestamp+" ["+e.canal+"/"+(e.tipo||"-")+"] de="+e.de+" ("+(e.nombre||"-")+") u="+e.usuario_id);
  console.log("        " + cut(e.cuerpo,140));
}
console.log();
console.log("   -- SALIENTES de hoy (resumen) --");
for (const e of ev.filter(e=>!String(e.direccion||"").match(/entrante|in/i))) {
  console.log("   "+e.timestamp+" ["+e.canal+"] ->"+e.de+" :: "+cut(e.cuerpo,70));
}
db.close();
JSEOF

node /tmp/rep-campana.js 2>&1

echo
echo "-- 5) LOGS [MB] hoy --"
grep "\[MB " ~/.pm2/logs/maria-paez-out.log 2>/dev/null | grep "2026-08-17" | tail -60
echo
echo "-- 6) grep frio/outbox/error en out.log hoy --"
grep -iE "\[frio\]|\[outbox\]|restring|timeout|no entrega" ~/.pm2/logs/maria-paez-out.log 2>/dev/null | grep "2026-08-17" | tail -50
echo
echo "-- 7) marker WA / estado --"
ls -la /root/secretaria/state/maria-paez/ 2>/dev/null | grep -iE "wa-|marker" || echo "   (sin markers)"
echo
echo "done"
