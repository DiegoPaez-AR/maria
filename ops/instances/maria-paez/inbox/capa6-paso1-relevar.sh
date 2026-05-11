#!/bin/bash
set +e
ROOT=/root/secretaria

echo "=== a) procesos hijos de maria-paez ==="
PID=$(pm2 jlist 2>/dev/null | python3 -c "
import json,sys
ps=json.load(sys.stdin)
for p in ps:
    if p.get('name')=='maria-paez':
        print(p.get('pid'))
        break")
echo "  PID maria-paez: $PID"
if [ -n "$PID" ]; then
  echo "  hijos:"
  pgrep -P $PID 2>/dev/null | while read child; do
    echo "    $child  $(ps -p $child -o comm= 2>/dev/null)"
  done
  echo "  open files (resumen, ignorando devices):"
  ls -la /proc/$PID/cwd 2>&1 | tail -1
  echo "  --- FDs apuntando a /root, /etc, /usr (sample) ---"
  ls -la /proc/$PID/fd/ 2>/dev/null | grep -E '/(root|etc|usr|home|opt)/' | head -20
fi
echo

echo "=== b) chequear si maria-svc ya existe ==="
if id maria-svc >/dev/null 2>&1; then
  echo "  maria-svc EXISTE: $(id maria-svc)"
else
  echo "  maria-svc no existe — creando..."
  useradd -r -s /usr/sbin/nologin -d /home/maria-svc -m maria-svc
  echo "  creado: $(id maria-svc)"
fi
echo

echo "=== c) setfacl disponible? ==="
command -v setfacl >/dev/null 2>&1 || apt-get install -y acl 2>&1 | tail -3
command -v setfacl >/dev/null 2>&1 && echo "  setfacl: $(setfacl --version 2>&1 | head -1)"
echo

echo "=== d) ACLs setup (idempotente) ==="
# /root debe ser entrable por maria-svc (no leer, solo entrar)
setfacl -m u:maria-svc:rx /root
# /root/.claude/ y subdirs: maria-svc rwx (Claude actualiza state)
setfacl -R -m u:maria-svc:rwX /root/.claude/ 2>/dev/null
setfacl -d -m u:maria-svc:rwX /root/.claude/ 2>/dev/null  # default ACL para nuevos
setfacl -m u:maria-svc:rw /root/.claude.json
# Backup files también: maria-svc puede leer, escribir si Claude rota
setfacl -R -m u:maria-svc:rwX /root/.claude/backups/ 2>/dev/null
# Cache: idem
mkdir -p /root/.cache/claude-cli-nodejs
setfacl -R -m u:maria-svc:rwX /root/.cache/claude-cli-nodejs 2>/dev/null
setfacl -d -m u:maria-svc:rwX /root/.cache/claude-cli-nodejs 2>/dev/null
setfacl -m u:maria-svc:rx /root/.cache  # entrar al cache dir
# /root/secretaria/: rx recursivo para todo (leer código)
setfacl -R -m u:maria-svc:rX /root/secretaria 2>/dev/null
setfacl -d -m u:maria-svc:rX /root/secretaria 2>/dev/null
# Subdirs que necesitan WRITE (state, ops, logs propios)
setfacl -R -m u:maria-svc:rwX /root/secretaria/state/ 2>/dev/null
setfacl -d -m u:maria-svc:rwX /root/secretaria/state/ 2>/dev/null
setfacl -R -m u:maria-svc:rwX /root/secretaria/ops/ 2>/dev/null
setfacl -d -m u:maria-svc:rwX /root/secretaria/ops/ 2>/dev/null
echo "  ACLs aplicadas. Verificación:"
getfacl /root 2>&1 | grep maria-svc
getfacl /root/.claude.json 2>&1 | grep maria-svc
getfacl /root/secretaria 2>&1 | grep maria-svc
getfacl /root/secretaria/state 2>&1 | grep maria-svc
echo

echo "=== e) DRY-RUN: maria-svc puede entrar a /root/secretaria? ==="
sudo -u maria-svc bash -c "cd /root/secretaria && pwd && ls | head -5" 2>&1
echo

echo "=== f) DRY-RUN: maria-svc puede leer la DB de la instancia? ==="
sudo -u maria-svc bash -c "ls -la /root/secretaria/state/maria-paez/db/ 2>&1 | head -5; sqlite3 /root/secretaria/state/maria-paez/db/maria.sqlite 'SELECT COUNT(*) FROM contactos' 2>&1" 2>&1
echo

echo "=== g) DRY-RUN: maria-svc puede invocar claude -p? ==="
sudo -u maria-svc bash -c "echo 'Decime hola en una palabra.' | timeout 60 claude -p --allowedTools WebSearch --disallowedTools Bash --disallowedTools Edit --disallowedTools Write 2>&1 | head -5"
echo

echo "=== h) DRY-RUN: maria-svc puede invocar claude bajo bwrap? ==="
sudo -u maria-svc bash -c "
echo 'Decime hola en una palabra.' | timeout 60 bwrap \
  --unshare-all --share-net \
  --proc /proc --dev /dev \
  --tmpfs /tmp --tmpfs /home --tmpfs /var --tmpfs /opt --tmpfs /srv --tmpfs /mnt --tmpfs /media \
  --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64 --ro-bind /bin /bin --ro-bind /sbin /sbin \
  --ro-bind /etc/resolv.conf /etc/resolv.conf --ro-bind /etc/ssl /etc/ssl --ro-bind /etc/ca-certificates /etc/ca-certificates --ro-bind /etc/nsswitch.conf /etc/nsswitch.conf --ro-bind /etc/hosts /etc/hosts --ro-bind /etc/passwd /etc/passwd --ro-bind /etc/group /etc/group \
  --bind /root/.claude /root/.claude --ro-bind /root/.claude.json /root/.claude.json --bind /root/.cache/claude-cli-nodejs /root/.cache/claude-cli-nodejs \
  --setenv HOME /root --setenv PATH /usr/local/bin:/usr/bin:/bin \
  -- claude -p \
  --allowedTools WebSearch \
  --disallowedTools Bash --disallowedTools Edit --disallowedTools Write \
  2>&1 | head -10
"
echo

echo "=== i) CHROME bajo maria-svc — necesita user namespaces? ==="
sudo -u maria-svc bash -c "/usr/bin/google-chrome --headless --disable-gpu --dump-dom about:blank 2>&1 | head -5"
echo
echo "=== veredicto del paso 1 ==="
echo "  Si todos los DRY-RUNs anteriores devolvieron 'hola' o JSON limpio, el paso 2 (pm2 user-switch) es seguro."
echo "  Si Chrome falló por sandbox issue, hay que decidir: pasar --no-sandbox (degradado) o habilitar user namespaces."
