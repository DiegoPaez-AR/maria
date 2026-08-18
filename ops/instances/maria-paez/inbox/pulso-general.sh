#!/bin/bash
cat > /tmp/pulso.cjs <<'JS'
const db=require("/root/secretaria/node_modules/better-sqlite3")(process.env.MARIA_DB,{readonly:true});
console.log("== 1. BRIEF de hoy (¿salió por WA?) ==");
db.prepare(`SELECT timestamp,canal,usuario_id FROM eventos WHERE direccion='saliente' AND (cuerpo LIKE '%Buen día%' OR cuerpo LIKE '%☀️%') AND timestamp>=date('now') ORDER BY id LIMIT 6`).all()
  .forEach(x=>console.log(x.timestamp.slice(11,16),x.canal,"u"+x.usuario_id));
console.log("== 2. RE-CAMPAÑA hoy ==");
db.prepare(`SELECT id,cuando,enviado,razon FROM programados WHERE texto LIKE '%Telegram%' AND cuando LIKE '2026-08-18%' ORDER BY cuando`).all()
  .forEach(r=>console.log("#"+r.id,r.cuando.slice(11,16)+"Z","env:"+r.enviado,r.razon||""));
console.log("== 3. OUTBOX de hoy ==");
db.prepare(`SELECT id,creado,estado,intentos,numero,substr(texto,1,35) t FROM wa_outbox WHERE creado>=date('now') ORDER BY id`).all()
  .forEach(r=>console.log("#"+r.id,r.creado.slice(11,16),r.estado,"int:"+r.intentos,r.numero.slice(-8),"|",String(r.t).replace(/\n/g," ")));
console.log("== 4. vinculados TG ==");
console.log(db.prepare(`SELECT COUNT(*) n FROM usuarios WHERE telegram_chat_id IS NOT NULL`).get().n,"de",db.prepare(`SELECT COUNT(*) n FROM usuarios WHERE activo=1`).get().n);
console.log("== 5. entrantes de hoy (actividad) ==");
db.prepare(`SELECT COUNT(*) n, canal FROM eventos WHERE direccion='entrante' AND timestamp>=date('now') GROUP BY canal`).all()
  .forEach(x=>console.log(x.canal+":",x.n));
db.close();
JS
node /tmp/pulso.cjs; rm -f /tmp/pulso.cjs
echo "== 6. fallas/avisos en logs de hoy =="
grep -iE "MB-FALLO|chat ABIERTO ES OTRO|CANARY|FALLÓ" ~/.pm2/logs/maria-paez-out.log | grep "2026-08-18" | tail -6
echo "== 7. últimos MB =="
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | tail -6
echo LISTO
