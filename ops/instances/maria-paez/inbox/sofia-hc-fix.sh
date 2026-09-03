#!/bin/bash
cd /root/secretaria
echo "── detalle del fallo google_oauth ──"
python3 -c "import json;d=json.load(open('ops/instances/sofia-bruscoli/snapshots/HEALTHCHECK-ALERT.json'));print(' ', json.dumps(d['checks'].get('google_oauth'))[:300])" 2>&1
echo "── healthcheck sofia con el fix ──"
ASISTENTE_SLUG=sofia-bruscoli bash ops/healthcheck.sh 2>/dev/null | python3 -c "import json,sys;d=json.load(sys.stdin);print(' ', {k:v.get('ok') for k,v in d['checks'].items()})"
echo "── notify a mano (debería mandar 'recuperado' a Diego, no a Noelia) ──"
bash ops/scripts/healthcheck-notify.sh 2>&1 | tail -4
sleep 5; grep -E "wa-send.*(entregado|Noelia|Diego)" /root/.pm2/logs/sofia-bruscoli-out.log /root/.pm2/logs/maria-paez-out.log | tail -3 | cut -c1-200
echo "── libreta de Sofia ──"
sqlite3 /root/secretaria/state/sofia-bruscoli/db/maria.sqlite "select count(*) from contactos"
echo LISTO
