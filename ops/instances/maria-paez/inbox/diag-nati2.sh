#!/bin/bash
cd /root/secretaria
echo "── outbox completo reciente ──"
timeout 25 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
cols=[r[1] for r in db.execute("PRAGMA table_info(wa_outbox)")]
print("  columnas:", cols)
for r in db.execute("SELECT * FROM wa_outbox ORDER BY id DESC LIMIT 5"):
    d=dict(r); d['texto']=(d.get('texto') or '')[:60]
    print("  ", d)
db.close()
PY
echo ""
echo "── logs del envío a Nati ──"
timeout 20 grep -nE "5491150105262|Nati|Natali" /root/.pm2/logs/maria-paez-out.log | tail -20
echo ""
echo "── qué sirvió el teléfono (pendiente.txt) ──"
timeout 15 grep -E "\[MB" /root/.pm2/logs/maria-paez-out.log | tail -12
echo ""
echo "── ventana horaria / hora del VPS ──"
date; timeout 15 node -e "
const e=process.env;
console.log('  ventana', e.WA_VENTANA_DESDE||'(default)', '-', e.WA_VENTANA_HASTA||'(default)');
console.log('  WA_WARMUP=', e.WA_WARMUP, ' WA_SALIENTE_OFF=', e.WA_SALIENTE_OFF);
const o=require('/root/secretaria/wa-outbox');
console.log('  siguiente() devuelve:', JSON.stringify(o.siguiente&&o.siguiente()||null).slice(0,200));"
echo LISTO
