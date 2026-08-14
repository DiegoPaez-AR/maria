#!/bin/bash
cd /root/secretaria
SECRET=$(grep -E '^ASISTENTE_INTERNAL_SECRET=' config/secrets.conf | cut -d= -f2- | tr -d '"')
HOOK=$(grep -hE '^WA_HOOK_SECRET=' config/secrets.conf config/instances/maria-paez.conf 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"')
PORT=$(grep -E '^ASISTENTE_INTERNAL_PORT=' config/instances/maria-paez.conf | cut -d= -f2- | tr -d '"')
FULCO="5491126829596"
MSG="Hola María. El viernes 21/8 de 9 a 12hs estaría perfecto."
echo "── replay Fulco: $MSG"
R=$(curl -s -m 150 -X POST "http://127.0.0.1:$PORT/wa-hook/$HOOK" -H 'Content-Type: application/json' \
  -d "{\"query\":{\"sender\":\"$FULCO\",\"message\":$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$MSG")}}")
echo "$R" | python3 -c "
import json,sys
d = json.load(sys.stdin)
reps = [r.get('message','') for r in d.get('replies',[])]
print(f'respuestas: {len(reps)}')
for r in reps: print('→', r[:180].replace(chr(10),' '))
open('/tmp/replay-f.txt','w').write(chr(10).join(reps))
"
while IFS= read -r linea; do
  [ -z "$linea" ] && continue
  curl -s -m 60 -X POST "http://127.0.0.1:$PORT/accion" -H "x-intensa-secret: $SECRET" -H 'Content-Type: application/json' \
    -d "{\"usuarioId\":2,\"accion\":{\"tipo\":\"enviar_wa\",\"a\":\"$FULCO@c.us\",\"texto\":$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$linea")},\"canalOrigen\":\"whatsapp\"}" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print('entrega a Fulco:', 'OK' if d.get('ok') else 'FALLO: '+str(d.get('error'))[:80])"
done < /tmp/replay-f.txt
rm -f /tmp/replay-f.txt
echo LISTO
