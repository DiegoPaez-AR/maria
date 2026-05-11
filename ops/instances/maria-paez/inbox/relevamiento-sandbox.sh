#!/bin/bash
set +e

echo "=== a) sandbox tools ==="
for cmd in bwrap bubblewrap firejail unshare; do
  if command -v "$cmd" >/dev/null 2>&1; then
    echo "  $cmd: $(command -v $cmd) — $($cmd --version 2>&1 | head -1)"
  else
    echo "  $cmd: NO INSTALADO"
  fi
done
apt list --installed 2>/dev/null | grep -iE 'bubblewrap|firejail' | head -5
echo

echo "=== b) Claude Code: paths de auth/config ==="
which claude
claude --version 2>&1 | head -1
echo "Variables CLAUDE_*:"
env | grep -iE '^CLAUDE_|^ANTHROPIC_' | sed 's/=.*=/=<REDACTED>=/' || echo "  (ninguna)"
echo "Files típicos:"
for d in /root/.claude /root/.config/claude /root/.cache/claude /root/.anthropic /root/.config/anthropic; do
  if [ -e "$d" ]; then
    echo "  EXISTE: $d"
    ls -la "$d" 2>&1 | head -10
  fi
done
echo "Búsqueda más amplia (paths con 'claude' bajo /root, primeros 15, sin secretos):"
find /root -maxdepth 4 -iname '*claude*' -printf '  %TY-%Tm-%Td %p (%s bytes, mode=%m)\n' 2>/dev/null | head -15
echo

echo "=== c) Cómo se invoca claude desde Maria ==="
echo "CLAUDE_BIN env: ${CLAUDE_BIN:-(no set, default 'claude')}"
echo "Wrapper script?:"
file $(command -v claude) 2>&1 | head -3
head -5 $(command -v claude) 2>/dev/null
echo

echo "=== d) Chrome path ==="
ls -la /usr/bin/google-chrome 2>&1 | head -3
google-chrome --version 2>&1 | head -1
echo

echo "=== e) pm2 estado actual ==="
pm2 jlist 2>/dev/null | python3 -c "
import json,sys
ps=json.load(sys.stdin)
for p in ps:
    e=p.get('pm2_env',{})
    print(f\"  {p.get('name')}: status={e.get('status')} restarts={e.get('restart_time')} exec_mode={e.get('exec_mode')} uid={e.get('uid','?')}\")"
echo
echo "=== f) test rápido: claude bajo bwrap (si está disponible) ==="
if command -v bwrap >/dev/null 2>&1; then
  echo "Probando bwrap básico:"
  bwrap --ro-bind /usr /usr --ro-bind /etc /etc --ro-bind /lib /lib --ro-bind /lib64 /lib64 --proc /proc --dev /dev --tmpfs /tmp --tmpfs /root --tmpfs /home -- bash -c "echo OK_BWRAP_SHELL; ls /root | head -3; ls /tmp | head -3" 2>&1 | head -10
else
  echo "  bwrap no instalado, skip"
fi
