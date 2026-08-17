#!/bin/bash
set -uo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"
cd /root/secretaria
echo "=== REPORTE CAMPANA TELEGRAM - $(date '+%Y-%m-%d %H:%M:%S %z') ==="
echo "DB=${MARIA_DB:-<sin MARIA_DB>}"
echo

node -e '
const Database = require("/root/secretaria/node_modules/better-sqlite3");
const db = new Database(process.env.MARIA_DB, { readonly: true });
const q = (s,...a)=>{ try { return db.prepare(s).all(...a); } catch(e){ console.log("  ERR: "+e.message); return []; } };
const cols = t => { try { return db.prepare("PRAGMA table_info("+t+")").all().map(c=>c.name); } catch(e){ return []; } };

console.log("-- 1) PROGRAMADOS con Telegram --");
console.log("   cols: " + cols("programados").join(","));
const prog = q("SELECT id, usuario_id, cuando, canal, destino, enviado, razon, substr(replace(texto,char(10),\" \"),1,70) AS txt FROM programados WHERE texto LIKE \"%Telegram%\" ORDER BY cuando");
console.log("   total con Telegram: " + prog.length);
let env=0, pend=0;
for (const p of prog) { p.enviado ? env++ : pend++; }
console.log("   enviado=1: " + env + "   pendientes: " + pend);
for (const p of prog) {
  console.log("   ["+p.id+"] "+p.cuando+" u="+p.usuario_id+" "+p.canal+"->"+p.destino+" enviado="+p.enviado+" razon="+(p.razon||"-"));
  console.log("         \"" + p.txt + "\"");
}
console.log();

console.log("-- 2) WA_OUTBOX (ultimas 30h) --");
console.log("   cols: " + cols("wa_outbox").join(","));
const ob = q("SELECT id, creado, usuario_id, numero, estado, intentos, tomado_en, entregado, substr(replace(texto,char(10),\" \"),1,60) AS txt FROM wa_outbox WHERE datetime(creado) >= datetime(\"now\",\"-30 hours\") ORDER BY id");
console.log("   filas: " + ob.length);
const porEstado = {};
for (const r of ob) porEstado[r.estado] = (porEstado[r.estado]||0)+1;
console.log("   por estado: " + JSON.stringify(porEstado));
const obTg = ob.filter(r => /Telegram/i.test(r.txt));
const porEstadoTg = {};
for (const r of obTg) porEstadoTg[r.estado] = (porEstadoTg[r.estado]||0)+1;
console.log("   de la campana (texto LIKE Telegram): " + obTg.length + " filas  " + JSON.stringify(porEstadoTg));
for (const r of ob) {
  console.log("   ["+r.id+"] "+r.creado+" n="+r.numero+" u="+r.usuario_id+" estado="+r.estado+" int="+r.intentos+" entregado="+(r.entregado||"-"));
  console.log("         \"" + r.txt + "\"");
}
console.log();

console.log("-- 3) USUARIOS / vinculacion Telegram --");
console.log("   cols: " + cols("usuarios").join(","));
const us = q("SELECT * FROM usuarios ORDER BY id");
const conTg = us.filter(u => u.telegram_chat_id != null && String(u.telegram_chat_id).trim() !== "");
console.log("   usuarios totales: " + us.length + "   con telegram_chat_id: " + conTg.length);
for (const u of us) {
  console.log("   ["+u.id+"] "+u.nombre+" wa="+(u.whatsapp||"-")+" tg="+(u.telegram_chat_id||"-")+" servido="+u.servido+" activo="+(u.activo!==undefined?u.activo:"?"));
}
console.log();

console.log("-- 4) EVENTOS ultimas 30h --");
console.log("   cols: " + cols("eventos").join(","));
const ev = q("SELECT id, timestamp, tipo, de, usuario_id, substr(replace(cuerpo,char(10),\" \"),1,110) AS txt FROM eventos WHERE datetime(timestamp) >= datetime(\"now\",\"-30 hours\") ORDER BY timestamp");
console.log("   eventos: " + ev.length);
const porTipo = {};
for (const e of ev) porTipo[e.tipo] = (porTipo[e.tipo]||0)+1;
console.log("   por tipo: " + JSON.stringify(porTipo));
for (const e of ev.slice(-90)) {
  console.log("   "+e.timestamp+" ["+e.tipo+"] de="+e.de+" u="+e.usuario_id);
  console.log("      \"" + e.txt + "\"");
}
db.close();
' 2>&1

echo
echo "-- 5) LOGS [MB] --"
grep "\[MB " ~/.pm2/logs/maria-paez-out.log 2>/dev/null | tail -40 || echo "   (sin lineas MB)"
echo
echo "-- 6) errores recientes --"
tail -80 ~/.pm2/logs/maria-paez-error.log 2>/dev/null | tail -25 || echo "   (sin errores)"
echo
echo "-- 7) outbox / cold-send en logs --"
grep -iE "outbox|cold-send" ~/.pm2/logs/maria-paez-out.log 2>/dev/null | tail -25 || echo "   (nada)"
echo
echo "done"
