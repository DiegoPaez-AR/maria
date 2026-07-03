#!/bin/bash
# Números del trial MCP desde el re-flip (2026-07-01 14:09 local). Solo lecturas.
node - <<'NODE'
const db = require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB, { readonly: true });
const desde = "2026-07-01 17:09:00"; // 14:09 ART en UTC
const q = (sql, ...a) => db.prepare(sql).get(...a);
const acciones = q(`SELECT COUNT(*) c FROM eventos WHERE canal='sistema' AND cuerpo LIKE 'acción %' AND timestamp >= ?`, desde).c;
const fallos = q(`SELECT COUNT(*) c FROM eventos WHERE canal='sistema' AND cuerpo LIKE 'acción FALLÓ%' AND timestamp >= ?`, desde).c;
const fallback = q(`SELECT COUNT(*) c FROM eventos WHERE tipo='mcp_fallback' AND timestamp >= ?`, desde).c;
const stale = q(`SELECT COUNT(*) c FROM eventos WHERE canal='sistema' AND cuerpo LIKE '%turno_obsoleto%' AND timestamp >= ?`, desde).c;
const gate = q(`SELECT COUNT(*) c FROM eventos WHERE tipo='security' AND cuerpo LIKE '%gate_tercero%' AND timestamp >= ?`, desde).c;
const turnos = q(`SELECT COUNT(*) c FROM eventos WHERE canal='whatsapp' AND direccion='entrante' AND timestamp >= ?`, desde).c;
console.log(`turnos WA entrantes: ${turnos}`);
console.log(`acciones ejecutadas: ${acciones} (fallos: ${fallos})`);
console.log(`mcp_fallback (miss de adopción): ${fallback}`);
console.log(`aborts turno_obsoleto: ${stale} · gate_tercero: ${gate}`);
db.close();
NODE
echo LISTO
