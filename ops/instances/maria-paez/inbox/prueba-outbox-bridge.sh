#!/bin/bash
cd /root/secretaria
SECRET=$(grep -E '^ASISTENTE_INTERNAL_SECRET=' config/secrets.conf | cut -d= -f2- | tr -d '"')
PORT=$(grep -E '^ASISTENTE_INTERNAL_PORT=' config/instances/maria-paez.conf | cut -d= -f2- | tr -d '"')
curl -s -m 40 -X POST "http://127.0.0.1:$PORT/accion" -H "x-intensa-secret: $SECRET" -H 'Content-Type: application/json' \
  -d "{\"usuarioId\":1,\"accion\":{\"tipo\":\"enviar_wa\",\"a\":\"541132317896@c.us\",\"texto\":\"🌉 Prueba OUTBOX→Bridge — este mensaje va por la COLA (lo que hacía el Tasker MariaEnvio, ahora apagado). Si te llegó, salió por MariaBridge y no por el AutoResponder. ¡Ese es el test real!\"},\"canalOrigen\":\"whatsapp\"}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('encolado en outbox:', d.get('ok'))"
sleep 8
echo "── estado del pendiente recién encolado ──"
node -e "
const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
db.prepare('SELECT id,estado,intentos FROM wa_outbox ORDER BY id DESC LIMIT 1').all().forEach(r=>console.log('#'+r.id, r.estado, 'intentos:'+r.intentos));
db.close();"
echo LISTO
