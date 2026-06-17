#!/bin/bash
set +e
echo "== corriendo deploy.sh del sitio =="
bash /root/secretaria/ops/sites/intensa.io/deploy.sh 2>&1 | tail -25
echo ""
echo "== verificación: el script.js servido ya NO tiene el mailto del CTA =="
grep -c "mailto:hola@intensa.io?subject=Plan" /var/www/intensa.io/maria/script.js 2>/dev/null && echo "(si dice 0, el fix está servido)"
echo "== y SÍ tiene el redirect a signup =="
grep -c "window.location.href = '/maria/signup/'" /var/www/intensa.io/maria/script.js 2>/dev/null
