#!/bin/bash
set +e
echo "═══ Listar backups del 17-may (anteriores a rotación) ═══"
ls -la /root/secretaria/state/maria-paez/token.json.bak.* 2>/dev/null
ls -la /root/secretaria/state/maria-paez/token.json.enc.bak.* 2>/dev/null
ls -la /root/secretaria/config/instances/maria-paez.conf.bak.* 2>/dev/null

echo ""
echo "═══ Borrar ═══"
# Todos los backups del token (plano y .enc), incluyendo el de la rotación
for f in /root/secretaria/state/maria-paez/token.json.bak.* /root/secretaria/state/maria-paez/token.json.enc.bak.*; do
  [ -e "$f" ] || continue
  rm -v "$f"
done

# Backup del .conf con key vieja en plano
for f in /root/secretaria/config/instances/maria-paez.conf.bak.*; do
  [ -e "$f" ] || continue
  rm -v "$f"
done

echo ""
echo "═══ Verificación: ¿quedaron backups? ═══"
ls /root/secretaria/state/maria-paez/token.json* 2>&1
ls /root/secretaria/config/instances/maria-paez.conf* 2>&1
