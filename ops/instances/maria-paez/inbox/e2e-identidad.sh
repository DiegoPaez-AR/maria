#!/bin/bash
cd /root/secretaria
WHS=$(grep -E '^WA_HOOK_SECRET=' config/instances/maria-paez.conf | cut -d= -f2- | tr -d '"')
echo "── 1. crear gestión de prueba (Diego esperando a Fulco) ──"
PID=$(node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB);
const r=db.prepare(\"INSERT INTO pendientes (usuario_id, \\\"desc\\\", estado, meta_json) VALUES (1, 'TEST TÉCNICO de ruteo: esperando que Hernan Fulco confirme que recibió la prueba del sistema (es un test de Diego — al confirmar, solo anotarlo, no crear eventos)', 'abierto', ?)\").run(JSON.stringify({dueno:'maria',disparador:'trigger_externo',esperando_de:'5491126829596@c.us',origen:'e2e_test'}));
console.log(r.lastInsertRowid);
db.close();")
echo "pendiente de prueba: #$PID"
echo "── 2. inyectar respuesta de Fulco al hook ──"
timeout 50 curl -s -m 45 -X POST "https://intensa.io/hooks/wa-maria/$WHS" -H 'Content-Type: application/json' \
  -d '{"query":{"sender":"Hernan Fulco","message":"Confirmo que recibí la prueba del sistema, todo ok por acá"}}' | head -c 400
echo ""
echo "── 3. ¿ruteó como tercero? (log usuario_como_tercero) ──"
sleep 2
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
db.prepare(\"SELECT timestamp,substr(cuerpo,1,120) c FROM eventos WHERE canal='sistema' AND cuerpo LIKE 'gestion-ajena:%' ORDER BY id DESC LIMIT 2\").all().forEach(r=>console.log(r.timestamp.slice(11),'|',r.c));
db.close();"
echo "── 4. limpieza: cancelar pendiente de prueba ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB);
db.prepare(\"UPDATE pendientes SET estado='cancelado' WHERE id=$PID AND \\\"desc\\\" LIKE 'TEST TÉCNICO%'\").run();
console.log('pendiente #$PID cancelado');
db.close();"
echo LISTO
