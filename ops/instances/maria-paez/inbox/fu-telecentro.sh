#!/bin/bash
DB=/root/secretaria/state/maria-paez/db/maria.sqlite
sqlite3 "$DB" "update follow_ups set estado='cancelado', cerrado_en=CURRENT_TIMESTAMP where id in (68,70) and estado='abierto'"
sqlite3 "$DB" "insert into eventos (usuario_id,canal,direccion,cuerpo,metadata_json) values (1,'sistema','interno','follow-ups #68 y #70 (Telecentro) cancelados por el operador: la gestión cerró con la baja Nº 13132707; sin esto Maria re-pingueaba a Telecentro en 2 días','{\"tipo\":\"correccion_operador\"}')"
sqlite3 "$DB" "select id,estado from follow_ups where id in (68,70)"
sqlite3 "$DB" "select id,estado,substr(\"desc\",1,80) from pendientes where usuario_id=1 and estado='abierto' and lower(\"desc\") like '%telecentro%'"
echo LISTO
