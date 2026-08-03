#!/bin/bash
cd /root/secretaria && set -a; . config/instances/maria-paez.conf 2>/dev/null; . config/secrets.conf 2>/dev/null; set +a
node auth-gmail.js url 2>&1 | tail -2
