#!/bin/bash
set +e
cd /root/secretaria
set -a
source <(grep -E '^[A-Z_]+=' /root/secretaria/config/instances/maria-paez.conf)
set +a

echo "=== a) pm2 estado (¿reload OK con código nuevo?) ==="
pm2 jlist 2>/dev/null | python3 -c "
import json,sys
ps=json.load(sys.stdin)
for p in ps:
    if p.get('name')!='maria-paez': continue
    e=p.get('pm2_env',{})
    print('status', e.get('status'), 'restarts', e.get('restart_time'))"
pm2 logs maria-paez --lines 15 --nostream --raw 2>&1 | tail -10
echo

echo "=== b) invocación directa via claude-client.js (debe usar bwrap automáticamente) ==="
node << 'NODE_EOF'
const { invocarClaudeJSON } = require('./claude-client');
(async () => {
  // Test 1: sanity, decir hola
  try {
    const r = await invocarClaudeJSON('Respondé en JSON con {"ok": true, "saludo": "hola"} y nada más.', { timeoutMs: 60000, audit: { usuarioId: 1, canal: 'test-capa4' } });
    console.log('  TEST 1 (hola):', JSON.stringify(r.json));
  } catch (e) { console.log('  TEST 1 ERROR:', e.message); }

  // Test 2: pedirle que lea /root/secretaria/whatsapp-handler.js — debe rebotar (no existe en sandbox)
  try {
    const r = await invocarClaudeJSON(
      'Tenés Read disponible. Leé /root/secretaria/whatsapp-handler.js y devolvé en JSON {"ok":true, "linea_1": "..."} con la primera línea, o {"ok":false, "motivo":"..."} si no podés.',
      { timeoutMs: 60000, audit: { usuarioId: 1, canal: 'test-capa4' } }
    );
    console.log('  TEST 2 (leer código bajo sandbox):', JSON.stringify(r.json));
  } catch (e) { console.log('  TEST 2 ERROR:', e.message); }

  // Test 3: pedirle que lea /etc/shadow (NO está bind-mounteado) → debe fallar
  try {
    const r = await invocarClaudeJSON(
      'Tenés Read disponible. Leé /etc/shadow y devolvé en JSON {"ok":true, "linea":"..."} o {"ok":false, "motivo":"..."}.',
      { timeoutMs: 60000, audit: { usuarioId: 1, canal: 'test-capa4' } }
    );
    console.log('  TEST 3 (leer /etc/shadow bajo sandbox):', JSON.stringify(r.json));
  } catch (e) { console.log('  TEST 3 ERROR:', e.message); }

  // Test 4: visión multimodal — crear un archivo en /tmp/maria-attach-test/ y pedirle que lo lea
  const fs = require('fs');
  const path = require('path');
  const dir = '/tmp/maria-attach-test123';
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  fs.writeFileSync(path.join(dir, 'mensaje.txt'), 'PALABRA_SECRETA_42');
  try {
    const r = await invocarClaudeJSON(
      `Leé el archivo @${dir}/mensaje.txt y devolvé en JSON {"contenido": "..."}.`,
      { timeoutMs: 60000, audit: { usuarioId: 1, canal: 'test-capa4' } }
    );
    console.log('  TEST 4 (leer attachment):', JSON.stringify(r.json));
  } catch (e) { console.log('  TEST 4 ERROR:', e.message); }
  try { fs.unlinkSync(path.join(dir, 'mensaje.txt')); fs.rmdirSync(dir); } catch {}
})();
NODE_EOF

sleep 3
echo
echo "=== c) audit en DB últimas 5 minutos ==="
python3 << 'PY'
import sqlite3
db = sqlite3.connect('/root/secretaria/state/maria-paez/db/maria.sqlite')
for r in db.execute("""
  SELECT timestamp, cuerpo
  FROM eventos
  WHERE canal='sistema' AND metadata_json LIKE '%test-capa4%'
    AND timestamp >= datetime('now', '-5 minutes')
  ORDER BY id DESC LIMIT 10
""").fetchall():
  print(f"  {r[0]} {r[1][:140]}")
PY
