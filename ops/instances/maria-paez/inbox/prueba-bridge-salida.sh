#!/bin/bash
cd /root/secretaria
SECRET=$(grep -E '^ASISTENTE_INTERNAL_SECRET=' config/secrets.conf | cut -d= -f2- | tr -d '"')
PORT=$(grep -E '^ASISTENTE_INTERNAL_PORT=' config/instances/maria-paez.conf | cut -d= -f2- | tr -d '"')
# encolar por el outbox (a Diego). MariaBridge lo va a leer y responder silencioso.
curl -s -m 40 -X POST "http://127.0.0.1:$PORT/accion" -H "x-intensa-secret: $SECRET" -H 'Content-Type: application/json' \
  -d "{\"usuarioId\":1,\"accion\":{\"tipo\":\"enviar_wa\",\"a\":\"541132317896@c.us\",\"texto\":\"🌉 Prueba MariaBridge — si esto te llegó SIN que la pantalla se prendiera ni se abriera WhatsApp, la respuesta silenciosa funciona y jubilamos el Tasker para siempre.\"},\"canalOrigen\":\"whatsapp\"}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('encolado:', d.get('ok'))"
echo LISTO
