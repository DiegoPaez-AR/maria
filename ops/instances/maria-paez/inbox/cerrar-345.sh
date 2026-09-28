#!/bin/bash
cd /root/secretaria; sleep 45
DB=/root/secretaria/state/maria-paez/db/maria.sqlite
grep -E "^# (pass|fail)" /tmp/canary-tick.log | tr '\n' ' '; echo; git log --oneline -1 -- executor.js | cat
echo "── ¿cómo vino el id en el tool call? ──"
sqlite3 "$DB" "select datetime(timestamp,'-3 hours'),substr(replace(cuerpo,char(10),' '),1,200) from eventos where canal='sistema' and (cuerpo like '%quitar_pendiente%345%' or metadata_json like '%quitar_pendiente%') and date(timestamp,'-3 hours')='2026-09-28' order by timestamp desc limit 3"
grep -h "quitar_pendiente" logs/maria-paez/out.log | grep -E "args|\"id\"" | tail -3 | cut -c1-200
echo "── cierro 345 a mano (Diego ya pasó el domicilio y Maria lo mandó) ──"
sqlite3 "$DB" "update pendientes set estado='cerrado', cerrado_en=CURRENT_TIMESTAMP where id=345 and estado='abierto'" 2>&1
sqlite3 "$DB" "pragma table_info(pendientes)" | grep -i cerr
sqlite3 "$DB" "select id,estado from pendientes where id=345"
sqlite3 "$DB" "insert into eventos (usuario_id,canal,direccion,cuerpo,metadata_json) values (1,'sistema','interno','pendiente #345 cerrado por el operador: Diego ya dio el domicilio (Triunvirato 3176 6A) y Maria se lo pasó a Telecentro; quitar_pendiente falló por id como string','{\"tipo\":\"correccion_operador\",\"pendiente\":345}')"
echo LISTO
