#!/bin/bash
# Encontrar todos los lugares en el VPS donde está el token (ghp_) actual.
# Solo lee. No modifica.
set +e

echo "═══ Buscar ghp_ en .git/config del repo ═══"
grep -E 'ghp_[A-Za-z0-9]+' /root/secretaria/.git/config 2>/dev/null | sed -E 's/(ghp_[A-Za-z0-9]{4})[A-Za-z0-9]+/\1***/g'

echo ""
echo "═══ ~/.git-credentials ═══"
ls -la /root/.git-credentials 2>/dev/null
if [ -f /root/.git-credentials ]; then
  cat /root/.git-credentials | sed -E 's/(ghp_[A-Za-z0-9]{4})[A-Za-z0-9]+/\1***/g'
fi

echo ""
echo "═══ ~/.gitconfig ═══"
ls -la /root/.gitconfig 2>/dev/null
if [ -f /root/.gitconfig ]; then
  cat /root/.gitconfig | sed -E 's/(ghp_[A-Za-z0-9]{4})[A-Za-z0-9]+/\1***/g'
fi

echo ""
echo "═══ credential helper configurado ═══"
git config --list --show-origin 2>/dev/null | grep -i credential
git -C /root/secretaria config --list --show-origin 2>/dev/null | grep -i credential

echo ""
echo "═══ Otros lugares con ghp_ en /root ═══"
grep -rlE 'ghp_[A-Za-z0-9]+' /root/secretaria 2>/dev/null | grep -v node_modules | grep -v '/state/_old/' | head -20
echo "---fuera de /root/secretaria, dentro de /root---"
find /root -maxdepth 3 -type f \( -name '.git-credentials' -o -name '*.token' -o -name '.gitconfig' -o -name 'config' \) 2>/dev/null | xargs -I{} grep -l 'ghp_' {} 2>/dev/null

echo ""
echo "═══ ¿/root/veritas también usa el mismo token? ═══"
grep -E 'ghp_[A-Za-z0-9]+' /root/veritas/.git/config 2>/dev/null | sed -E 's/(ghp_[A-Za-z0-9]{4})[A-Za-z0-9]+/\1***/g'

echo ""
echo "═══ Token actual (primeros 8 chars solo, para verificar identidad) ═══"
grep -oE 'ghp_[A-Za-z0-9]{8}' /root/secretaria/.git/config 2>/dev/null | head -1 | sed 's/\(ghp_....\).*/\1***/'
