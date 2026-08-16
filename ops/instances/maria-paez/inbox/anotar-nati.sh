#!/bin/bash
cd /root/secretaria
SECRET=$(grep -E '^ASISTENTE_INTERNAL_SECRET=' config/secrets.conf | cut -d= -f2- | tr -d '"')
PORT=$(grep -E '^ASISTENTE_INTERNAL_PORT=' config/instances/maria-paez.conf | cut -d= -f2- | tr -d '"')
curl -s -m 40 -X POST "http://127.0.0.1:$PORT/accion" -H "x-intensa-secret: $SECRET" -H 'Content-Type: application/json' \
  -d '{"usuarioId":1,"accion":{"tipo":"recordar_hecho","clave":"nati_cine_20260816","valor":"Natali Funez respondió HOY 16/8 a las 10:56 que NO puede ir al cine hoy (dijo: Hoy no puedo). La gestión del cine queda CERRADA con respuesta negativa. Nota: Maria le respondió confundida 2 veces por un bug ya arreglado — si Nati retoma, disculparse brevemente y no volver a preguntar por el cine de hoy."},"canalOrigen":"whatsapp"}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('hecho anotado:', d.get('ok'))"
echo LISTO
