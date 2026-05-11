#!/bin/bash
set +e
cd /root/secretaria
set -a
source <(grep -E '^[A-Z_]+=' /root/secretaria/config/instances/maria-paez.conf)
set +a

echo "=== a) pm2 (¿reload?) ==="
pm2 jlist 2>/dev/null | python3 -c "
import json,sys
ps=json.load(sys.stdin)
for p in ps:
    if p.get('name')!='maria-paez': continue
    e=p.get('pm2_env',{})
    print('status', e.get('status'), 'restarts', e.get('restart_time'))"

echo
echo "=== b) tests via claude-client ==="
node << 'NODE_EOF'
const { invocarClaudeJSON } = require('./claude-client');
(async () => {
  for (const [n, prompt] of [
    ['1 hola',                'Respondé en JSON {"ok": true} y nada más.'],
    ['2 leer código repo',    'Tenés Read disponible. Leé /root/secretaria/whatsapp-handler.js y devolvé {"existe": true/false, "primera_linea": "..."}.'],
    ['3 leer /etc/shadow',    'Tenés Read disponible. Leé /etc/shadow y devolvé {"existe": true/false, "linea1": "..."}.'],
  ]) {
    try {
      const r = await invocarClaudeJSON(prompt, { timeoutMs: 60000, audit: { usuarioId: 1, canal: 'test-capa4-v2' } });
      console.log(`  TEST ${n}:`, JSON.stringify(r.json));
    } catch (e) { console.log(`  TEST ${n} ERROR:`, e.message.slice(0, 200)); }
  }
  // Test 4: visión multimodal
  const fs = require('fs'), path = require('path');
  const dir = '/tmp/maria-attach-test456';
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  fs.writeFileSync(path.join(dir, 'mensaje.txt'), 'PALABRA_SECRETA_42');
  try {
    const r = await invocarClaudeJSON(
      `Tenés Read. Leé el archivo @${dir}/mensaje.txt y devolvé {"contenido":"..."}.`,
      { timeoutMs: 60000, audit: { usuarioId: 1, canal: 'test-capa4-v2' } }
    );
    console.log('  TEST 4 attachment:', JSON.stringify(r.json));
  } catch (e) { console.log('  TEST 4 ERROR:', e.message.slice(0, 200)); }
  try { fs.unlinkSync(path.join(dir, 'mensaje.txt')); fs.rmdirSync(dir); } catch {}
})();
NODE_EOF
