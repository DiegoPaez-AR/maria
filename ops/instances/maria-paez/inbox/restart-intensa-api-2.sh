#!/bin/bash
set -u
pm2 restart intensa-api 2>&1 | tail -1
sleep 3
curl -s -m 5 http://127.0.0.1:4080/health 2>/dev/null || pm2 jlist | python3 -c "
import json,sys
print([p.get('pm2_env',{}).get('status') for p in json.load(sys.stdin) if p.get('name')=='intensa-api'])
"
