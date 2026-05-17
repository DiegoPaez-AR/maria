#!/bin/bash
# Verifica Fase 1 multi-provider: archivos en su lugar, columnas DB nuevas,
# Maria arrancó OK con el código refactoreado.
set +e
set -a; . /root/secretaria/config/instances/maria-paez.conf; set +a

echo "═══ 1) Archivos nuevos en repo ═══"
ls -la /root/secretaria/vault.js /root/secretaria/providers/index.js /root/secretaria/providers/google.js 2>&1

echo ""
echo "═══ 2) Columnas nuevas en usuarios ═══"
sqlite3 -header -column "$MARIA_DB" "PRAGMA table_info(usuarios)" | grep -E 'calendar_provider|calendar_auth_json'

echo ""
echo "═══ 3) Distribución de calendar_provider entre users activos ═══"
sqlite3 -header -column "$MARIA_DB" "
SELECT calendar_provider, COUNT(*) AS n
FROM usuarios WHERE activo=1
GROUP BY calendar_provider
"

echo ""
echo "═══ 4) Maria status + último arranque ═══"
pm2 jlist 2>/dev/null | python3 -c "
import json, sys, time
ps = json.load(sys.stdin)
for p in ps:
    if p.get('name') != 'maria-paez': continue
    e = p.get('pm2_env', {})
    up_ms = e.get('pm_uptime', 0)
    up_s = (time.time()*1000 - up_ms) / 1000
    print(f\"  pid={p.get('pid')} status={e.get('status')} restarts={e.get('restart_time')} uptime={int(up_s)}s\")
"

echo ""
echo "═══ 5) Test funcional: llamar providers desde Node ═══"
cd /root/secretaria
timeout 30s node -e "
(async () => {
  try {
    const providers = require('./providers');
    const usuarios = require('./usuarios');
    const diego = usuarios.obtener(1);
    console.log('  calendar_provider Diego:', diego.calendar_provider);
    console.log('  calendar_auth_json Diego:', diego.calendar_auth_json === null ? 'NULL (esperado para Google)' : 'tiene blob');
    const provider = await providers.forUser(diego);
    console.log('  provider.kind:', provider.kind);
    const eventos = await provider.listarEventosProximos({ dias: 1, max: 3, calendarId: diego.calendar_id });
    console.log(\`  listarEventosProximos OK: \${eventos.length} eventos\`);
    if (eventos[0]) console.log(\`  primero: \${eventos[0].summary} @ \${eventos[0].start}\`);
    // Test forMaria
    const mp = await providers.forMaria();
    console.log('  forMaria provider.kind:', mp.kind);
    const calMaria = await mp.getMariaCalendarId();
    console.log('  getMariaCalendarId:', calMaria);
  } catch (err) {
    console.error('  ERROR:', err.message);
    process.exit(1);
  }
})();
"

echo ""
echo "═══ 6) Errores recientes en logs post-reload ═══"
pm2 logs maria-paez --lines 100 --nostream 2>&1 | tac | awk '/iniciando…/{p=1} p' | tac | \
  grep -iE 'error|falló|failed|fatal|throw|cannot' | head -10 || echo "(sin errores nuevos)"
