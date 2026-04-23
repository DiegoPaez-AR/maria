#!/usr/bin/env bash
# Verifica que el deploy de Capa 1 + Capa 2 + Capa 3 haya tomado bien.
# Capa 1: lookup programático en contactos cross-usuario (mem.buscarContactoCrossUsuario)
# Capa 2: historiales cross-usuario al LLM pre-pass (historialesDeTodosLosUsuarios)
# Capa 3: herramienta buscar_contacto_global (owner-only) en executor + prompt
set -u

cd /root/secretaria

echo "=== pm2 status ==="
pm2 status --no-color || true

echo
echo "=== pm2 describe maria (status + created_at + pid) ==="
pm2 describe maria 2>/dev/null | \
  grep -E '(status|uptime|restart time|created at|pid)' | head -10 || true

echo
echo "=== último commit ==="
git log -1 --oneline

echo
echo "=== node --check de archivos tocados ==="
for f in memory.js context-fetcher.js unknown-flow.js executor.js prompt-builder.js; do
  printf "%-22s " "$f"
  node --check "$f" && echo OK || echo FAIL
done

echo
echo "─── CAPA 1: buscarContactoCrossUsuario ─────────────────────────────────"
echo
echo "=== memory.js: helper exportado ==="
grep -nE 'buscarContactoCrossUsuario|_matchNumeroFlex' memory.js | head -10

echo
echo "=== unknown-flow.js: _lookupEnContactos hookeado antes del LLM ==="
grep -nE '_lookupEnContactos|matcheo por libreta' unknown-flow.js | head -15

echo
echo "─── CAPA 2: historialesDeTodosLosUsuarios ──────────────────────────────"
echo
echo "=== context-fetcher.js: helper + export ==="
grep -nE 'historialesDeTodosLosUsuarios|historialUsuarioConMaria' context-fetcher.js | head -10

echo
echo "=== unknown-flow.js: seccionHistUsuarios (reemplazó seccionHistOwner) ==="
grep -nE 'seccionHistUsuarios|HISTORIAL WA MARIA ↔' unknown-flow.js | head -10
echo "(esperamos 0 referencias a seccionHistOwner)"
grep -cE 'seccionHistOwner' unknown-flow.js

echo
echo "─── CAPA 3: buscar_contacto_global (owner-only) ────────────────────────"
echo
echo "=== executor.js: switch + función ==="
grep -nE "case 'buscar_contacto_global'|function _buscarContactoGlobal|buscarContactoCrossUsuario" executor.js

echo
echo "=== prompt-builder.js: declarada + excepción aislamiento ==="
grep -nE 'buscar_contacto_global|EXCEPCIÓN para vos .owner.|libreta es metadata' prompt-builder.js | head -10

echo
echo "─── Dry-run funcional Capa 1 + Capa 3 ──────────────────────────────────"
echo
echo "=== smoke test: buscarContactoCrossUsuario({nombre:'%a%'}) y (whatsapp por dígitos) ==="
node -e "
try {
  const mem = require('./memory');
  const todos = mem.db.prepare('SELECT id, usuario_id, nombre, whatsapp, email FROM contactos').all();
  console.log('total_contactos_en_db=' + todos.length);
  if (todos.length === 0) {
    console.log('(DB sin contactos — no se puede probar match; esperable si aún no se creó ninguno)');
  } else {
    const c0 = todos[0];
    console.log('sample_contacto: id=' + c0.id + ' usuario=' + c0.usuario_id + ' nombre=\"' + c0.nombre + '\" wa=\"' + (c0.whatsapp||'') + '\" email=\"' + (c0.email||'') + '\"');
    const byName = mem.buscarContactoCrossUsuario({ nombre: c0.nombre });
    console.log('byName_matches=' + byName.length);
    if (c0.whatsapp) {
      const byWa = mem.buscarContactoCrossUsuario({ whatsapp: c0.whatsapp });
      console.log('byWa_matches=' + byWa.length);
      const digs = c0.whatsapp.replace(/\D+/g, '');
      if (digs.length >= 8) {
        const byDigs = mem.buscarContactoCrossUsuario({ whatsapp: digs });
        console.log('byDigitosSolos_matches=' + byDigs.length);
      }
    }
    if (c0.email) {
      const byMail = mem.buscarContactoCrossUsuario({ email: c0.email.toUpperCase() });
      console.log('byEmail_case_insensitive_matches=' + byMail.length);
    }
  }
  // ¿Mariela está?
  const mariela = mem.buscarContactoCrossUsuario({ nombre: 'Mariela' });
  console.log('mariela_matches=' + mariela.length);
  mariela.forEach(c => console.log('  → usuario_id=' + c.usuario_id + ' nombre=\"' + c.nombre + '\" wa=\"' + (c.whatsapp||'') + '\"'));
} catch (err) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
"

echo
echo "=== smoke test: executor buscar_contacto_global exige owner ==="
node -e "
try {
  const exec = require('./executor');
  // usuario fake no-owner
  const fakeCtx = { usuario: { id: 999999 } };
  exec.ejecutarAcciones([{ tipo: 'buscar_contacto_global', nombre: 'Diego' }], fakeCtx)
    .then(r => {
      const r0 = r[0];
      if (r0.ok) { console.log('FAIL: no rechazó a no-owner'); process.exit(1); }
      if (/solo el owner/i.test(r0.error)) {
        console.log('OK: rechazó con mensaje correcto — ' + r0.error);
      } else {
        console.log('UNEXPECTED error=' + r0.error);
      }
    })
    .catch(e => { console.error('exec throw:', e.message); process.exit(1); });
} catch (err) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
"

echo
echo "─── Contexto ───────────────────────────────────────────────────────────"
echo
echo "=== usuarios activos ==="
sqlite3 -header -column /root/secretaria/db/maria.sqlite "
  SELECT id, nombre, rol, wa_cus, email, (calendar_id IS NOT NULL) AS cal
  FROM usuarios WHERE activo=1 ORDER BY id;
" 2>/dev/null || true

echo
echo "=== contactos por usuario ==="
sqlite3 -header -column /root/secretaria/db/maria.sqlite "
  SELECT usuario_id, COUNT(*) AS n_contactos
  FROM contactos GROUP BY usuario_id ORDER BY usuario_id;
" 2>/dev/null || true

echo
echo "=== ¿Mariela está en contactos (de algún usuario)? ==="
sqlite3 -header -column /root/secretaria/db/maria.sqlite "
  SELECT id, usuario_id, nombre, whatsapp, email
  FROM contactos WHERE nombre LIKE '%mariela%' COLLATE NOCASE;
" 2>/dev/null || true

echo
echo "=== tail 40 OUT log ==="
tail -40 /root/.pm2/logs/maria-out.log 2>/dev/null || echo "(no hay out log)"

echo
echo "=== tail 20 ERR log ==="
tail -20 /root/.pm2/logs/maria-error.log 2>/dev/null || echo "(no hay err log)"

echo
echo "=== estado_usuario: prospectos/unknown pendientes ==="
sqlite3 -header -column /root/secretaria/db/maria.sqlite "
  SELECT usuario_id, clave, actualizado
  FROM estado_usuario
  WHERE clave LIKE 'unknown_pending:%' OR clave LIKE 'unknown:%';
" 2>/dev/null || true
