#!/bin/bash
cd /root/secretaria
SECRET=$(grep -E '^ASISTENTE_INTERNAL_SECRET=' config/secrets.conf | cut -d= -f2- | tr -d '"')
PORT=$(grep -E '^ASISTENTE_INTERNAL_PORT=' config/instances/maria-paez.conf | cut -d= -f2- | tr -d '"')
acc() {
  curl -s -m 40 -X POST "http://127.0.0.1:$PORT/accion" -H "x-intensa-secret: $SECRET" -H 'Content-Type: application/json' -d "$1" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print('ok:', d.get('ok'), ('| ' + str(d.get('error'))[:90]) if not d.get('ok') else '')"
}
echo "── 1. hecho en la gestión de Diego ──"
acc '{"usuarioId":1,"accion":{"tipo":"recordar_hecho","clave":"reunion_manuel_hernan_confirmaciones","valor":"Hernán Fulco CONFIRMÓ viernes 21/08 de 9 a 12hs para la reunión de 3hs con Diego y Manuel Carrasco (confirmado 14/08). FALTA la respuesta de Manuel — cuando conteste, cerrar con ese horario si le sirve a ambos y crear el evento con los tres."},"canalOrigen":"whatsapp"}'
echo "── 2. ack a Hernán ──"
acc '{"usuarioId":1,"accion":{"tipo":"enviar_wa","a":"5491126829596@c.us","texto":"¡Buenísimo Hernán! Anoto viernes 21/8 de 9 a 12hs de tu lado 👌 Apenas me confirme Manuel te mando la invitación con el horario cerrado."},"canalOrigen":"whatsapp"}'
echo LISTO
