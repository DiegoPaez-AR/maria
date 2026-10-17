#!/bin/bash
# Solo lectura: ¿el token del remote del VPS sigue valiendo? (sin imprimirlo)
OUT=/var/www/intensa.io/_dl/diag-d542f22af36801a3.txt
[ -f "$OUT" ] && exit 0
rm -f /var/www/intensa.io/_dl/diag-2e133eb55968a67c.txt
{
cd /root/secretaria
T=$(git remote get-url --push origin | sed -E 's#https://([^@]*)@.*#\1#; s#^[^:]*:##')
echo "prefijo: ${T:0:4}  largo: ${#T}  sha: $(printf %s "$T" | sha256sum | cut -c1-10)  (mac: 490794f2a8)"
curl -sS -m 20 -D - -o /tmp/gh-user.json -H "Authorization: token $T" https://api.github.com/user | grep -i -E "^HTTP|x-oauth-scopes|token-expiration|x-ratelimit-remaining"
grep -o '"login": *"[^"]*"' /tmp/gh-user.json; rm -f /tmp/gh-user.json
curl -sS -m 20 -o /dev/null -w "repo perms: %{http_code}\n" -H "Authorization: token $T" https://api.github.com/repos/DiegoPaez-AR/maria
curl -sS -m 20 -H "Authorization: token $T" https://api.github.com/repos/DiegoPaez-AR/maria | grep -A4 '"permissions"' | tr -d '\n '; echo
echo "git: $(git --version)"
} > "$OUT" 2>&1
chmod 644 "$OUT"
