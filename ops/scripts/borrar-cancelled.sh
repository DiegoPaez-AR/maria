#!/bin/bash
# Cron diario — archiva y borra clientes cancelled hace +90 días.
# Crontab line:
#   0 4 * * * /root/secretaria/ops/scripts/borrar-cancelled.sh >> /root/secretaria/ops/.borrar-cancelled.log 2>&1

set -e
cd /root/secretaria

echo "═══ $(date -Iseconds) ═══"

# Llamar a un script Node corto que use el mismo módulo archive.js del intensa-api
node <<'JS'
process.env.CONTROL_DB = '/root/secretaria/state/control/control.sqlite';
process.env.ARCHIVE_DB = '/root/secretaria/state/control/archive.sqlite';

const path = require('path');
const apiRoot = '/root/secretaria/ops/backend/intensa-api';
process.chdir(apiRoot);

const db = require(path.join(apiRoot, 'lib/db'));
const archive = require(path.join(apiRoot, 'lib/archive'));

db.init();

const c = db.control();
const candidatos = c.prepare(`
  SELECT * FROM clientes
  WHERE estado='cancelled'
    AND cancelado_en IS NOT NULL
    AND datetime(cancelado_en, '+90 days') < datetime('now')
`).all();

console.log(`Encontrados ${candidatos.length} clientes para archivar+borrar.`);

for (const cli of candidatos) {
  try {
    console.log(`  → archivando ${cli.id} (${cli.email})...`);
    archive.archivarCliente(cli);
    archive.borrarCliente(cli);
    console.log(`  ✓ ${cli.email} archivado y borrado.`);
  } catch (err) {
    console.error(`  ✗ ${cli.email}: ${err.message}`);
  }
}

db.close();
JS

echo "═══ DONE ═══"
