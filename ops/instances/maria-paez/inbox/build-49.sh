#!/bin/bash
cd /root/secretaria
setsid nohup bash /root/mb-build-worker.sh > /tmp/mb-build-49.log 2>&1 < /dev/null &
echo "build v4.9 lanzado (pid $!)"
echo "── #271: arreglo el rastro falso (quedó 'entregado' con el texto en el cuadro) ──"
DB=/root/secretaria/state/maria-paez/db/maria.sqlite
sqlite3 "$DB" "delete from eventos where canal='whatsapp' and direccion='saliente' and metadata_json like '%\"outboxId\":271%' and metadata_json like '%no_verificado%'" && echo "  evento saliente falso borrado"
sqlite3 "$DB" "insert into eventos (usuario_id, canal, direccion, cuerpo, metadata_json) values (1,'sistema','interno','wa-outbox: #271 a Daniel Castro NO salió (popup de la operadora tapó el chat; la foto muestra el texto en el cuadro). Se re-sirve cuando el teléfono tenga v4.9','{\"tipo\":\"correccion_operador\",\"outboxId\":271}')"
echo LISTO
