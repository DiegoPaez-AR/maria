#!/bin/bash
set -u
cd /root/secretaria

echo "═══ Smoke construirPrompt con API correcta de usuarios ═══"
node <<'JS'
process.env.MARIA_DB = process.env.MARIA_DB || '/root/secretaria/state/maria-paez/db/maria.sqlite';
(async () => {
  try {
    const usuarios = require('/root/secretaria/usuarios');
    console.log('usuarios exports:', Object.keys(usuarios).join(','));
    const activos = usuarios.listarActivos();
    const owner = activos.find(u => u.rol === 'owner') || activos[0];
    console.log('owner:', owner.nombre, 'id:', owner.id, 'tz:', owner.tz);

    const pb = require('/root/secretaria/prompt-builder');
    const entrada = {
      canal: 'whatsapp',
      de: owner.wa_lid || owner.wa_cus,
      nombre: owner.nombre,
      cuerpo: '¿probando smoke test?',
      timestamp: new Date().toISOString(),
    };
    const prompt = await pb.construirPrompt({ canal: 'whatsapp', usuario: owner, entrada });
    console.log(`✓ construirPrompt OK; length: ${prompt.length} chars`);

    const horaArt = parseInt(new Date().toLocaleString('es-AR', { timeZone: owner.tz || 'America/Argentina/Buenos_Aires', hour: '2-digit', hour12: false }), 10);
    console.log(`hora ART actual: ${horaArt}h`);

    const expectMadrugada = horaArt >= 0 && horaArt < 6;
    const tieneMadrugada = prompt.includes('madrugada') || prompt.includes('00-06hs');
    console.log(`  ${tieneMadrugada === expectMadrugada ? '✓' : '⚠'} aviso madrugada (esperado=${expectMadrugada}, presente=${tieneMadrugada})`);

    const tieneFechaCompleta = prompt.includes('CONFIRMACIÓN CON FECHA COMPLETA');
    console.log(`  ${tieneFechaCompleta ? '✓' : '✗'} regla fecha completa en confirmación: ${tieneFechaCompleta}`);

    // Ver primeros 1000 chars del prompt para confirmar que arranca con la sección fecha-hora correcta
    console.log('\n--- preview prompt ---');
    console.log(prompt.slice(0, 500));
    console.log('--- ... ---');
    // Buscar la regla nueva
    const idx = prompt.indexOf('CONFIRMACIÓN CON FECHA COMPLETA');
    if (idx > -1) {
      console.log('\n--- preview regla nueva ---');
      console.log(prompt.slice(Math.max(0, idx - 100), idx + 400));
    }
  } catch (err) {
    console.error('✗ SMOKE FALLÓ:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
JS
