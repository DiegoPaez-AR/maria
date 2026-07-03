#!/bin/bash
# Re-ping manual del follow-up #19 a Gabriela (pedido de Diego via Cowork 2026-07-03)
set -u
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"

echo "== follow_up #19 =="
sqlite3 "$DB" "SELECT id, estado, esperando_de, descripcion FROM follow_ups WHERE id=19;"

row=$(sqlite3 "$DB" "SELECT id||'|'||COALESCE(wa_cus,'')||'|'||nombre FROM usuarios WHERE nombre LIKE 'Gabriela%' AND activo=1 LIMIT 1")
USRID="${row%%|*}"; rest="${row#*|}"; WA="${rest%%|*}"; NOMBRE="${rest#*|}"
echo "usuario: id=$USRID wa=$WA nombre=$NOMBRE"

if [ "$WA" != "5491165286555@c.us" ]; then
  echo "ABORT: wa_cus inesperado ($WA), no mando nada"
  exit 1
fi

python3 - "$USRID" "$WA" <<'PYEOF'
import json, sys, urllib.request, os
uid, wa = sys.argv[1], sys.argv[2]
texto = ("Hola Gaby! Te recuerdo que quedó pendiente coordinar la reunión con Ana Clara "
         "(y posiblemente Diego) para la semana que viene, lunes 06/07 o martes 07/07 de 9 a 12hs. "
         "Para armarla necesito que me pases el contacto de Ana Clara y me confirmes quiénes participan. "
         "Tené en cuenta que el lunes a las 10hs ya tenés la reunión con Mecha en la facultad 📅")
req = urllib.request.Request(
    f"http://127.0.0.1:{os.environ['ASISTENTE_INTERNAL_PORT']}/send-wa",
    data=json.dumps({"to": wa, "body": texto, "usuarioId": int(uid), "nombre": "Gabriela Echaniz"}).encode(),
    headers={"x-intensa-secret": os.environ.get("ASISTENTE_INTERNAL_SECRET",""),
             "Content-Type": "application/json"}, method="POST")
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        print("send-wa:", r.status, r.read().decode())
except urllib.error.HTTPError as e:
    print("send-wa FALLO:", e.code, e.read().decode()); sys.exit(1)
PYEOF
