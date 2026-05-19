#!/bin/bash
set -u
cd /root/secretaria
echo "═══ Pull ═══"
git fetch -q origin main
git log --oneline -2

echo ""
echo "═══ Smoke runtime: simular envío de Maria a Rubén y verificar doble-log ═══"
node <<'JS'
process.env.MARIA_DB = process.env.MARIA_DB || '/root/secretaria/state/maria-paez/db/maria.sqlite';
(async () => {
  const mem = require('/root/secretaria/memory');
  const usuarios = require('/root/secretaria/usuarios');

  const diego = usuarios.listarActivos().find(u => u.rol === 'owner');
  const ruben = usuarios.listarActivos().find(u => /Rub/i.test(u.nombre));
  console.log('Diego id:', diego.id, '— Rubén id:', ruben.id, 'wa_cus:', ruben.wa_cus);

  // Cargar wa-send DIRECTAMENTE y hacer un fake send que NO toque WA real,
  // solo dispare la lógica de log con destino=Rubén y usuarioId=Diego.
  // Truco: monkey-patchear sendMessage para que devuelva ok inmediato.
  const fakeClient = { sendMessage: async () => null };
  const waSend = require('/root/secretaria/wa-send');

  const textoTest = `[SMOKE BUG F] mensaje fake ${new Date().toISOString()}`;

  // Pre: contar eventos del destinatario
  const evsAntesRuben = mem.contextoCrossCanal(ruben.id, { desdeHoras: 1, max: 50 });
  const countAntesRuben = (evsAntesRuben.match(/\[/g) || []).length;
  console.log('eventos Rubén (última hora) antes:', countAntesRuben);

  // Ejecutar envío con usuarioId=Diego
  try {
    const r = await waSend.enviarWADirecto(fakeClient, ruben.wa_cus, textoTest, {
      tag: 'smoke-bug-F',
      usuarioId: diego.id,
      metadata: { test: true },
    });
    console.log('enviarWADirecto OK:', r);
  } catch (err) {
    console.error('✗ enviarWADirecto falló:', err.message);
    process.exit(1);
  }

  // Post: ¿el evento aparece en historial de Rubén?
  const evsDespRuben = mem.contextoCrossCanal(ruben.id, { desdeHoras: 1, max: 50 });
  const countDespRuben = (evsDespRuben.match(/\[/g) || []).length;
  console.log('eventos Rubén (última hora) después:', countDespRuben);
  console.log('delta:', countDespRuben - countAntesRuben);

  const apareceEnRuben = evsDespRuben.includes('[SMOKE BUG F]');
  console.log(`  ${apareceEnRuben ? '✓' : '✗'} mensaje aparece en historial de RUBÉN (test crítico)`);

  // También verificar que aparece en historial de Diego (no debe haber regresado)
  const evsDespDiego = mem.contextoCrossCanal(diego.id, { desdeHoras: 1, max: 50 });
  const apareceEnDiego = evsDespDiego.includes('[SMOKE BUG F]');
  console.log(`  ${apareceEnDiego ? '✓' : '✗'} mensaje aparece en historial de DIEGO (no debe perderse)`);

  // Cleanup: borrar los 2 eventos test
  const Database = require('better-sqlite3');
  const db = new Database(process.env.MARIA_DB);
  const r = db.prepare(`DELETE FROM eventos WHERE cuerpo LIKE '[SMOKE BUG F]%'`).run();
  console.log(`  cleanup: borré ${r.changes} eventos de prueba`);
})();
JS

echo ""
echo "═══ pm2 reload --update-env ═══"
pm2 reload ecosystem.config.js --only maria-paez --update-env 2>&1 | tail -5
sleep 3
echo ""
pm2 logs maria-paez --lines 12 --nostream 2>&1 | tail -15
