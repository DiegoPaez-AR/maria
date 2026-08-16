#!/bin/bash
cd /root/secretaria
SECRET=$(grep -E '^ASISTENTE_INTERNAL_SECRET=' config/secrets.conf | cut -d= -f2- | tr -d '"')
PORT=$(grep -E '^ASISTENTE_INTERNAL_PORT=' config/instances/maria-paez.conf | cut -d= -f2- | tr -d '"')
curl -s -m 40 -X POST "http://127.0.0.1:$PORT/accion" -H "x-intensa-secret: $SECRET" -H 'Content-Type: application/json' \
  -d "{\"usuarioId\":1,\"accion\":{\"tipo\":\"enviar_wa\",\"a\":\"541132317896@c.us\",\"texto\":\"🌉✅ Confirmación final — MariaBridge andando. Este también salió por la cola, silencioso, sin Tasker. Buenas noches Diego, gran laburo hoy. 🌙\"},\"canalOrigen\":\"whatsapp\"}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('encolado:', d.get('ok'))"
sleep 10
node -e "const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true}); const r=db.prepare('SELECT id,estado,intentos FROM wa_outbox ORDER BY id DESC LIMIT 1').get(); console.log('pendiente #'+r.id, r.estado, 'int:'+r.intentos); db.close();"
echo LISTO
