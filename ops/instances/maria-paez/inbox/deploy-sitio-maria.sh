#!/bin/bash
# Deploy intensa.io: FAQ de Maria +3 entradas (ejemplos de uso, lenguaje
# natural, horario de soporte 8x5) y se quitó la card "Equipo chico".
set +e
echo "fecha: $(date -Is)"
cd /root/secretaria || { echo "ERROR cd"; exit 1; }
echo "=== HEAD del repo ==="
git log -1 --format='%h %s' | cat
echo
echo "=== deploy.sh ==="
bash ops/sites/intensa.io/deploy.sh 2>&1
RC=$?
echo
echo "=== verificación intensa.io/maria/ (exit deploy.sh=$RC) ==="
curl -sk -H "Host: intensa.io" -o /dev/null -w "  /maria/         HTTPS %{http_code}\n" https://127.0.0.1/maria/
curl -sk -H "Host: intensa.io" -o /dev/null -w "  /maria/script.js HTTPS %{http_code}\n" "https://127.0.0.1/maria/script.js"
HTML=$(curl -sk -H "Host: intensa.io" https://127.0.0.1/maria/)
JS=$(curl -sk -H "Host: intensa.io" "https://127.0.0.1/maria/script.js")
echo "  FAQ nuevo en HTML servido: faq.7.q x$(echo "$HTML" | grep -c 'faq.7.q') · faq.9.q x$(echo "$HTML" | grep -c 'faq.9.q')"
echo "  caso.4 en HTML servido (debe ser 0): $(echo "$HTML" | grep -c 'caso.4')"
echo "  claves nuevas en JS servido: faq.9.a x$(echo "$JS" | grep -c 'faq.9.a')"
echo "  caso.4 en JS servido (debe ser 0): $(echo "$JS" | grep -c 'caso.4')"
