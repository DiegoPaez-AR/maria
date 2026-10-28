#!/bin/bash
# 28/10 (aprobado Diego): cerrar #373 (gestión "esperando" de Diego mismo) + verificar el lookup de hilo con el caso Mónaco
cd /root/secretaria; git log --format='%h %s' -1; grep -c "_usuarioDelHilo" unknown-flow.js
( set -a; . config/instances/maria-paez.conf; set +a
  sqlite3 "$MARIA_DB" "UPDATE pendientes SET estado='cerrado', cerrado=CURRENT_TIMESTAMP WHERE id=373 AND estado='abierto'; SELECT id, estado, cerrado FROM pendientes WHERE id=373;"
  T=$(sqlite3 "$MARIA_DB" "select json_extract(metadata_json,'\$.threadId') from eventos where id=34579;")
  echo "thread Mónaco: $T"
  sqlite3 "$MARIA_DB" "SELECT DISTINCT e.usuario_id, u.nombre FROM eventos e JOIN usuarios u ON u.id=e.usuario_id WHERE e.canal='gmail' AND e.usuario_id IS NOT NULL AND COALESCE(json_extract(e.metadata_json,'\$.tipo'),'') NOT LIKE 'unknown%' AND COALESCE(json_extract(e.metadata_json,'\$.tipo'),'') NOT LIKE 'descartado%' AND (json_extract(e.metadata_json,'\$.threadId')='$T' OR json_extract(e.metadata_json,'\$.inReplyTo') IN (SELECT json_extract(metadata_json,'\$.messageId') FROM eventos WHERE canal='gmail' AND json_extract(metadata_json,'\$.threadId')='$T'));"
  echo "── control: hilo inexistente ──"
  sqlite3 "$MARIA_DB" "SELECT count(*) FROM eventos WHERE canal='gmail' AND json_extract(metadata_json,'\$.threadId')='nada';" )
sleep 20; tail -30 logs/maria-paez/error.log | grep -v "TG\] poll" | tail -5; pm2 jlist | python3 -c "import json,sys;[print(p['name'],p['pm2_env']['status'],p['pm2_env']['restart_time']) for p in json.load(sys.stdin)]"
