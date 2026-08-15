#!/bin/bash
cd /root/secretaria
SECRET=$(grep -E '^ASISTENTE_INTERNAL_SECRET=' config/secrets.conf | cut -d= -f2- | tr -d '"')
PORT=$(grep -E '^ASISTENTE_INTERNAL_PORT=' config/instances/maria-paez.conf | cut -d= -f2- | tr -d '"')
DIEGO_WA=$(node -e "const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true}); console.log(db.prepare('SELECT wa_cus FROM usuarios WHERE id=1').get().wa_cus); db.close();")
echo "── test de salida a Diego ($( echo $DIEGO_WA | tail -c 8)) ──"
curl -s -m 40 -X POST "http://127.0.0.1:$PORT/accion" -H "x-intensa-secret: $SECRET" -H 'Content-Type: application/json' \
  -d "{\"usuarioId\":1,\"accion\":{\"tipo\":\"enviar_wa\",\"a\":\"$DIEGO_WA\",\"texto\":\"✅ Prueba de canal de salida (Tasker) — $(date '+%H:%M'). Si te llegó este mensaje, Maria→vos por WhatsApp está OK.\"},\"canalOrigen\":\"whatsapp\"}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('encolado:', d.get('ok'), ('| '+str(d.get('error'))[:80]) if not d.get('ok') else '')"
echo ""
echo "── transcripción completa con Ulises ──"
node -e "
const db = require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB, {readonly:true});
const rows = db.prepare(\"SELECT timestamp, direccion, cuerpo FROM eventos WHERE canal='whatsapp' AND (de LIKE '%41935177%' OR (usuario_id=18 AND direccion='saliente' AND cuerpo IS NOT NULL)) AND timestamp >= '2026-08-14 21:00:00' ORDER BY id\").all();
// filtrar salientes que fueron a Gabriela (no a Ulises): los salientes a Ulises están en wa_outbox también, pero eventos loguea 'de'
const out = db.prepare(\"SELECT timestamp, texto FROM wa_outbox WHERE numero LIKE '%41935177%' ORDER BY id\").all?.() || [];
const entr = db.prepare(\"SELECT timestamp, cuerpo FROM eventos WHERE de LIKE '%41935177%' AND direccion='entrante' ORDER BY id\").all();
const todo = [
  ...entr.map(r => ({ts: r.timestamp, quien: 'ULISES', txt: r.cuerpo})),
  ...db.prepare(\"SELECT creado ts, texto txt FROM wa_outbox WHERE numero LIKE '%41935177%' ORDER BY id\").all().map(r => ({ts: r.ts, quien: 'MARIA', txt: r.txt})),
].sort((a,b) => a.ts.localeCompare(b.ts));
todo.forEach(m => console.log('['+m.ts.slice(11,16)+'] '+m.quien+': '+m.txt.replace(/\n/g,' ')+'\n'));
db.close();
"
echo LISTO
