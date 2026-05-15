#!/bin/bash
# Extraer project_id y client_id (NO secrets) del credentials.json
# para que Diego pueda identificar el proyecto correcto en Cloud Console.
set +e

CRED=/root/secretaria/state/maria-paez/credentials.json

python3 <<'PYEOF'
import json
c = json.load(open('/root/secretaria/state/maria-paez/credentials.json'))
root = c.get('installed') or c.get('web') or c
print('Campos del OAuth client (sin secret):')
for k in ['client_id', 'project_id', 'auth_uri', 'token_uri', 'redirect_uris', 'auth_provider_x509_cert_url']:
    v = root.get(k)
    if v is not None:
        print(f'  {k:30s} = {v}')

cid = root.get('client_id', '')
# El project_id está al inicio del client_id: <project-id>-<hash>.apps.googleusercontent.com
if cid and '-' in cid:
    head = cid.split('-')[0]
    print(f'\nproject_id derivado del client_id: {head}')

# Si project_id viene explícito, usar ese
pid = root.get('project_id')
if pid:
    print(f'project_id explícito en credentials.json: {pid}')
    print(f'\nURL directa al proyecto en Cloud Console:')
    print(f'  https://console.cloud.google.com/apis/credentials/consent?project={pid}')
PYEOF
