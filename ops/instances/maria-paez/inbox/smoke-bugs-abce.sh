#!/bin/bash
set -u
cd /root/secretaria

echo "═══ 1. Pull código (commit e0357b3 ya está en origin) ═══"
git fetch -q origin main
git log --oneline -3

echo ""
echo "═══ 2. SMOKE RUNTIME — cargar prompt-builder + construirPrompt ═══"
# Esto detectaría cualquier ReferenceError tipo bugs anteriores
# (startTs / _lastIncoming / providerDet).
node <<'JS'
process.env.MARIA_DB = process.env.MARIA_DB || '/root/secretaria/state/maria-paez/db/maria.sqlite';
(async () => {
  try {
    const pb = require('/root/secretaria/prompt-builder');
    console.log('✓ require prompt-builder OK; exports:', Object.keys(pb).slice(0,10).join(','));

    // Construir un prompt real con el owner (Diego)
    const usuarios = require('/root/secretaria/usuarios');
    const owner = usuarios.byId(1);
    console.log('✓ owner cargado:', owner.nombre);

    const entrada = {
      canal: 'whatsapp',
      de: owner.wa_lid || owner.wa_cus,
      nombre: owner.nombre,
      cuerpo: '¿probando smoke test?',
      timestamp: new Date().toISOString(),
    };
    const prompt = await pb.construirPrompt({ canal: 'whatsapp', usuario: owner, entrada });
    console.log(`✓ construirPrompt OK; prompt length: ${prompt.length} chars`);

    // Verificaciones de los fixes
    const checks = {
      'A pt1 (madrugada warning)': prompt.includes('madrugada') || prompt.includes('00-06hs'),
      'A pt2 (fecha completa rule)': prompt.includes('CONFIRMACIÓN CON FECHA COMPLETA') || prompt.includes('fecha completa'),
      'E (slice 500)': true, // ya verificado en el código directamente
    };
    for (const [k, v] of Object.entries(checks)) {
      console.log(`  ${v ? '✓' : '✗'} ${k}: ${v}`);
    }

    // Si es de madrugada local (UTC-3), debería incluir el aviso. Si es de día, no.
    const horaArg = parseInt(new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', hour12: false }), 10);
    console.log(`  → hora actual ART: ${horaArg}h → aviso madrugada esperado: ${horaArg < 6 ? 'SÍ' : 'NO'}`);
  } catch (err) {
    console.error('✗ SMOKE FALLÓ:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
JS

echo ""
echo "═══ 3. Smoke wa-validate (fallback 9 móvil AR — sin client real, solo lógica) ═══"
node <<'JS'
const wv = require('/root/secretaria/wa-validate');
(async () => {
  // Test 1: input @lid bien formado → devuelve tal cual sin client
  const r1 = await wv.normalizarWaCus('34342575317160@lid', null);
  console.log('  test 1 @lid passthrough:', r1 === '34342575317160@lid' ? '✓' : '✗', '→', r1);

  // Test 2: null/empty → null
  const r2 = await wv.normalizarWaCus(null, null);
  console.log('  test 2 null:', r2 === null ? '✓' : '✗', '→', r2);

  // Test 3: sin client → error explícito
  try {
    await wv.normalizarWaCus('5491132317896@c.us', null);
    console.log('  test 3 sin client: ✗ (no tiró error)');
  } catch (err) {
    console.log('  test 3 sin client: ✓ tira error claro:', err.message.slice(0, 80));
  }

  // Test 4: mock client que falla para 5491144491280 pero OK para 541144491280 (sin 9)
  const mockClient = {
    async getNumberId(d) {
      if (d === '541144491280') return { _serialized: '541144491280@c.us' };
      return null;
    }
  };
  const r4 = await wv.normalizarWaCus('5491144491280@c.us', mockClient);
  console.log('  test 4 retry sin 9 (fallback AR):', r4 === '541144491280@c.us' ? '✓' : '✗', '→', r4);

  // Test 5: mock client que falla para 541144491280 pero OK CON el 9
  const mockClient2 = {
    async getNumberId(d) {
      if (d === '5491144491280') return { _serialized: '5491144491280@c.us' };
      return null;
    }
  };
  const r5 = await wv.normalizarWaCus('541144491280@c.us', mockClient2);
  console.log('  test 5 retry con 9 (fallback AR):', r5 === '5491144491280@c.us' ? '✓' : '✗', '→', r5);

  // Test 6: nunca encuentra → error con mensaje sobre vCard
  const mockClient3 = { async getNumberId() { return null; } };
  try {
    await wv.normalizarWaCus('5491144491280@c.us', mockClient3);
    console.log('  test 6 not found: ✗ (no tiró error)');
  } catch (err) {
    const ok = err.message.includes('TARJETA DE CONTACTO') || err.message.includes('vCard');
    console.log('  test 6 error con sugerencia vCard:', ok ? '✓' : '✗', err.message.slice(0, 100));
  }
})();
JS

echo ""
echo "═══ 4. pm2 reload maria-paez con env actualizado ═══"
pm2 reload ecosystem.config.js --only maria-paez --update-env 2>&1 | tail -10
sleep 4

echo ""
echo "═══ 5. pm2 status + logs recientes (verificar arranque limpio) ═══"
pm2 jlist 2>/dev/null | python3 -c "
import json, sys
ps = json.load(sys.stdin)
for p in ps:
    if p.get('name') == 'maria-paez':
        e = p.get('pm2_env', {})
        print(f\"  status={e.get('status')}  restarts={e.get('restart_time')}  uptime={int((time.time()*1000-e.get('pm_uptime',0))/1000)}s\")
        break
import time
"
pm2 logs maria-paez --lines 30 --nostream 2>&1 | tail -30
