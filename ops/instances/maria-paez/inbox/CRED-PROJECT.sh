#!/bin/bash
cd /root/secretaria && set -a; . config/instances/maria-paez.conf 2>/dev/null; set +a
CRED="${GOOGLE_CRED_PATH:-/root/secretaria/credentials.json}"
echo "cred path: $CRED"
python3 -c "
import json
d = json.load(open('$CRED'))
info = d.get('installed') or d.get('web')
print('project_id:', info.get('project_id'))
print('client_id:', info.get('client_id', '')[:30] + '...')
"
