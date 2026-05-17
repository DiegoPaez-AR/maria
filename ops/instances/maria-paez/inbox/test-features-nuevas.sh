#!/bin/bash
set +e
set -a; . /root/secretaria/config/instances/maria-paez.conf; set +a
cd /root/secretaria

echo "═══ 1) Tablas nuevas existen en DB ═══"
sqlite3 "$MARIA_DB" ".tables" | tr ' ' '\n' | grep -E 'follow_ups|notas_contacto' | head

echo ""
echo "═══ 2) Schema de follow_ups y notas_contacto ═══"
sqlite3 "$MARIA_DB" "PRAGMA table_info(follow_ups)"
echo ""
sqlite3 "$MARIA_DB" "PRAGMA table_info(notas_contacto)"

echo ""
echo "═══ 3) Contenido inicial ═══"
echo "follow_ups:"
sqlite3 "$MARIA_DB" "SELECT COUNT(*) AS n FROM follow_ups"
echo "notas_contacto:"
sqlite3 -header -column "$MARIA_DB" "SELECT n.id, u.nombre AS user, c.nombre AS contacto, substr(n.nota,1,80) AS nota_excerpt, n.actualizado FROM notas_contacto n JOIN usuarios u ON u.id=n.usuario_id JOIN contactos c ON c.id=n.contacto_id ORDER BY n.id DESC LIMIT 10"

echo ""
echo "═══ 4) Test de mem.buscarEnHistorial ═══"
timeout 20s node -e "
const mem = require('./memory');
const r = mem.buscarEnHistorial({ usuarioId: 1, query: 'Movistar', dias: 60, max: 5 });
console.log('  resultados:', r.length);
r.slice(0,3).forEach(e => console.log(\`  - [\${e.timestamp}] \${e.canal}/\${e.direccion} \${e.de||''}: \${(e.cuerpo||'').slice(0,80)}\`));
"

echo ""
echo "═══ 5) Test de providers.forUser y forMaria ═══"
timeout 20s node -e "
(async () => {
  const providers = require('./providers');
  const usuarios = require('./usuarios');
  const diego = usuarios.obtener(1);
  const p = await providers.forUser(diego);
  console.log('  forUser(Diego).kind:', p.kind);
  const m = await providers.forMaria();
  console.log('  forMaria().kind:', m.kind);
  const cid = await m.getMariaCalendarId();
  console.log('  forMaria.getMariaCalendarId:', cid);
})();
"

echo ""
echo "═══ 6) Test de vault (si MARIA_VAULT_KEY seteada) ═══"
if [ -n "$MARIA_VAULT_KEY" ]; then
  node -e "console.log('  vault.autoTest:', JSON.stringify(require('./vault').autoTest()))"
else
  echo "  MARIA_VAULT_KEY no seteada (esperado, vault.js no se usa todavía)"
fi

echo ""
echo "═══ 7) healthcheck end-to-end ═══"
bash ops/healthcheck.sh
echo "  exit: $?"

echo ""
echo "═══ 8) Verificar loops registrados en pm2 ═══"
pm2 logs maria-paez --lines 60 --nostream 2>&1 | tac | awk '/iniciando…/{p=1} p' | tac | grep -E 'arrancando|activo,' | tail -20

echo ""
echo "═══ 9) Recordar primera nota curada generada ═══"
sqlite3 "$MARIA_DB" "SELECT 'Notas curadas hasta ahora: ' || COUNT(*) FROM notas_contacto"
