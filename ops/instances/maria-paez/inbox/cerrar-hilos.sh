#!/bin/bash
cd /root/secretaria
SECRET=$(grep -E '^ASISTENTE_INTERNAL_SECRET=' config/secrets.conf | cut -d= -f2- | tr -d '"')
PORT=$(grep -E '^ASISTENTE_INTERNAL_PORT=' config/instances/maria-paez.conf | cut -d= -f2- | tr -d '"')
acc() { curl -s -m 40 -X POST "http://127.0.0.1:$PORT/accion" -H "x-intensa-secret: $SECRET" -H 'Content-Type: application/json' -d "$1" | python3 -c "import json,sys; d=json.load(sys.stdin); print('ok:', d.get('ok'), ('| '+str(d.get('error'))[:90]) if not d.get('ok') else '')"; }
echo "── 1. persecución automática a Hernán ──"
acc '{"usuarioId":1,"accion":{"tipo":"agregar_pendiente","desc":"Esperando que Hernán Fulco confirme jueves 20/08 13-16hs (o lunes 24) para la reunión con Diego y Manuel Carrasco. Al confirmar: crear_evento con los tres + invitaciones + avisar a Diego.","dueno":"maria","disparador":"trigger_externo","meta":{"esperando_de":"5491126829596@c.us","esperando_canal":"whatsapp"}},"canalOrigen":"whatsapp"}'
echo "── 2. update a Gabriela ──"
acc '{"usuarioId":18,"accion":{"tipo":"enviar_wa","a":"5491165286555@c.us","texto":"Gabi, te cuento cómo viene lo de Ulises y Esteban: hablé con Ulises, re copado — dice que la receta del chipá está en un posteo de Instagram que te va a pasar (o ya te pasó por ahí), y me confirmó que tienen ganas de juntarse 🙌 ¿Qué días te vienen bien a vos esta semana o la que viene? Así les propongo algo concreto y lo cerramos."},"canalOrigen":"whatsapp"}'
echo "── 3. ack a Manuel ──"
acc '{"usuarioId":1,"accion":{"tipo":"enviar_wa","a":"541155771290@c.us","texto":"¡Gracias Manuel! 😊 Quedamos así entonces: apenas Hernán me confirme, te mando la invitación del jueves 20 de 13 a 16. Cualquier cosa me escribís por acá."},"canalOrigen":"whatsapp"}'
echo LISTO
