#!/bin/bash
# Diagnóstico WA caído + credentials.json faltante. Solo lee.
set +e

echo "═══ Hora actual VPS ═══"
date -Iseconds

echo ""
echo "═══ Buscar credentials.json ═══"
find /root -name 'credentials.json' 2>/dev/null | head -20
echo "---candidatos json---"
find /root/secretaria -maxdepth 3 -name '*.json' 2>/dev/null | grep -iE 'cred|oauth|token' | head -20
echo "---root de secretaria---"
ls -la /root/secretaria/ | grep -iE 'cred|oauth|token|\.json'

echo ""
echo "═══ state/maria-paez/ ═══"
ls -la /root/secretaria/state/maria-paez/ 2>/dev/null
find /root/secretaria/state/maria-paez -maxdepth 3 -type d 2>/dev/null

echo ""
echo "═══ Dir sesión WA ═══"
find /root/secretaria -maxdepth 4 -type d \( -name '*wwebjs*' -o -name 'wa-session*' -o -name 'whatsapp-session*' -o -name '.wwebjs*' \) 2>/dev/null

echo ""
echo "═══ Config maria-paez.conf (sin secretos) ═══"
cat /root/secretaria/config/instances/maria-paez.conf 2>/dev/null | grep -vE '^#' | grep -vE 'KEY|SECRET|TOKEN|PASSWORD' | head -40

echo ""
echo "═══ pm2 jlist resumido ═══"
pm2 jlist 2>/dev/null | python3 -c "
import json, sys
try:
    ps = json.load(sys.stdin)
    for p in ps:
        if p.get('name') != 'maria-paez': continue
        e = p.get('pm2_env', {})
        print(f\"name={p['name']} pid={p.get('pid')} status={e.get('status')} restarts={e.get('restart_time')}\")
        print(f\"  cwd={e.get('pm_cwd')}\")
        print(f\"  script={e.get('pm_exec_path')}\")
        print(f\"  MARIA_DB={e.get('env',{}).get('MARIA_DB')}\")
        print(f\"  MARIA_STATE_DIR={e.get('env',{}).get('MARIA_STATE_DIR')}\")
except Exception as ex:
    print(f'error: {ex}')
"

echo ""
echo "═══ pm2 logs maria-paez --lines 200 (en vivo) ═══"
pm2 logs maria-paez --lines 200 --nostream 2>&1 | tail -200

echo ""
echo "═══ Tail err log ═══"
ls -la ~/.pm2/logs/ 2>/dev/null | grep -i maria-paez
tail -80 ~/.pm2/logs/maria-paez-error.log 2>/dev/null

echo ""
echo "═══ QR en logs ═══"
pm2 logs maria-paez --lines 500 --nostream 2>&1 | grep -B1 -A2 -iE 'QR|qrcode' | tail -40
