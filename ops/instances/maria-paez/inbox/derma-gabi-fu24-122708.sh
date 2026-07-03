#!/bin/bash
# 1) Recordatorio a Gabi por el turno de dermatología (follow-up #21, pedido de Diego)
# 2) Diagnóstico follow-up #24 (Ana Clara / gmail)
set -u
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"

echo "== usuarios: Gabriela =="
row=$(sqlite3 "$DB" "SELECT id||'|'||COALESCE(wa_cus,'') FROM usuarios WHERE nombre LIKE 'Gabriela%' AND activo=1 LIMIT 1")
USRID="${row%%|*}"; WA="${row#*|}"
echo "id=$USRID wa=$WA"
if [ "$WA" != "5491165286555@c.us" ]; then echo "ABORT wa inesperado"; exit 1; fi

python3 - "$USRID" "$WA" <<'PYEOF'
import json, sys, urllib.request, os
uid, wa = sys.argv[1], sys.argv[2]
texto = ("Gaby, ¿al final cancelás el turno de dermatología de hoy a las 18hs? "
         "Si me confirmás, lo borro del calendario 👍")
req = urllib.request.Request(
    f"http://127.0.0.1:{os.environ['ASISTENTE_INTERNAL_PORT']}/send-wa",
    data=json.dumps({"to": wa, "body": texto, "usuarioId": int(uid), "nombre": "Gabriela Echaniz"}).encode(),
    headers={"x-intensa-secret": os.environ.get("ASISTENTE_INTERNAL_SECRET",""),
             "Content-Type": "application/json"}, method="POST")
with urllib.request.urlopen(req, timeout=30) as r:
    print("send-wa:", r.status, r.read().decode())
PYEOF

echo "== follow_ups 19-24 =="
sqlite3 -header "$DB" "SELECT id, usuario_id, estado, esperando_de, esperando_canal, creado, vence_en, metadata_json FROM follow_ups WHERE id>=19;"
echo "== eventos gmail con a.zamora =="
sqlite3 "$DB" "SELECT id, timestamp, canal, direccion, de, substr(COALESCE(asunto,''),1,60), substr(cuerpo,1,200) FROM eventos WHERE (de LIKE '%zamora%' OR cuerpo LIKE '%zamora%' OR asunto LIKE '%zamora%') AND canal='gmail' ORDER BY id DESC LIMIT 6;"
