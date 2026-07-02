#!/bin/bash
# Inventario de secrets: SOLO nombres de keys + longitud del valor.
# NUNCA imprime valores (el outbox va a git).
inv() {
  local f="$1"
  echo "── $f ──"
  if [ ! -f "$f" ]; then echo "  (no existe)"; return; fi
  echo "  perms=$(stat -c '%a %U' "$f")"
  grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$f" | while IFS= read -r line; do
    k="${line%%=*}"
    v="${line#*=}"
    v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
    printf "  %-35s len=%s\n" "$k" "${#v}"
  done
}
inv /root/secretaria/config/instances/maria-paez.conf
inv /root/secretaria/.env-intensa-api
echo "── /root/secretaria/.backup-pass ──"
[ -f /root/secretaria/.backup-pass ] && echo "  existe, len=$(tr -d '\n' < /root/secretaria/.backup-pass | wc -c), perms=$(stat -c '%a' /root/secretaria/.backup-pass)" || echo "  (no existe)"
echo "── otros .env / .conf sueltos ──"
ls -la /root/secretaria/ | grep -E '^\-.*\.(env|conf|pass|key|secret)' || true
ls -la /root/secretaria/config/ 2>/dev/null
