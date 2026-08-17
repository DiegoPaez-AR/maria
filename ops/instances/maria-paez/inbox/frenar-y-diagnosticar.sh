#!/bin/bash
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB);
const r=db.prepare(\"UPDATE programados SET enviado=-2, razon='pausado-bug-chat-equivocado' WHERE id IN (1352,1353,1354) AND enviado=0\").run();
console.log('campaña FRENADA:', r.changes, 'mensajes pausados');
console.log('── ¿algún usuario campaña respondió hoy? (entrantes de sus números) ──');
db.prepare(\"SELECT timestamp,de,substr(cuerpo,1,50) c FROM eventos WHERE canal='whatsapp' AND direccion='entrante' AND timestamp>='2026-08-17 13:00' ORDER BY id\").all().forEach(x=>console.log(x.timestamp.slice(11,16),String(x.de).slice(-10),'|',String(x.c).replace(/\n/g,' ')));
console.log('── qué es el 'Te debo consulta' (programados/follow-ups con ese texto) ──');
db.prepare(\"SELECT id,cuando,enviado,usuario_id,substr(texto,1,80) t FROM programados WHERE texto LIKE '%Te debo consulta%' ORDER BY id DESC LIMIT 5\").all().forEach(x=>console.log('prog#'+x.id,x.cuando,'env:'+x.enviado,'u:'+x.usuario_id,'|',x.t));
db.close();"
echo "── logs MB del mediodía en adelante (frio vs silencioso) ──"
grep "\[MB " ~/.pm2/logs/maria-paez-out.log | grep -E "frio|outbox|respondido" | tail -20
echo LISTO
