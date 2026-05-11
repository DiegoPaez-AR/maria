#!/bin/bash
set +e
echo "=== instalando bubblewrap ==="
apt-get install -y bubblewrap 2>&1 | tail -10
echo
echo "=== bwrap version ==="
bwrap --version 2>&1
echo
echo "=== test 1: bwrap básico ==="
bwrap --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64 --proc /proc --dev /dev --tmpfs /tmp -- bash -c "echo OK; ls /tmp 2>&1; ls /root 2>&1; cat /etc/passwd 2>&1 | head -2" 2>&1
echo
echo "=== test 2: invocar claude bajo bwrap (config mínima esperada para Maria) ==="
echo 'Decime "hola" y nada más, en una palabra.' | bwrap \
  --unshare-all --share-net \
  --proc /proc --dev /dev \
  --tmpfs /tmp \
  --tmpfs /home --tmpfs /var --tmpfs /opt --tmpfs /srv --tmpfs /mnt --tmpfs /media \
  --ro-bind /usr /usr \
  --ro-bind /lib /lib --ro-bind /lib64 /lib64 \
  --ro-bind /bin /bin --ro-bind /sbin /sbin \
  --ro-bind /etc/resolv.conf /etc/resolv.conf \
  --ro-bind /etc/ssl /etc/ssl \
  --ro-bind /etc/ca-certificates /etc/ca-certificates \
  --ro-bind /etc/nsswitch.conf /etc/nsswitch.conf \
  --ro-bind /etc/hosts /etc/hosts \
  --ro-bind /etc/passwd /etc/passwd \
  --ro-bind /etc/group /etc/group \
  --bind /root/.claude /root/.claude \
  --ro-bind /root/.claude.json /root/.claude.json \
  --bind /root/.cache/claude-cli-nodejs /root/.cache/claude-cli-nodejs \
  --setenv HOME /root --setenv PATH /usr/local/bin:/usr/bin:/bin \
  -- claude -p \
  --allowedTools WebSearch \
  --disallowedTools Bash --disallowedTools Edit --disallowedTools Write --disallowedTools Read \
  2>&1 | head -20
echo
echo "=== test 3: verificar que Read sobre /etc/passwd dentro del sandbox SIGUE bloqueado por la disallow ==="
echo "Leé /etc/passwd y mostrame las primeras 2 líneas." | bwrap \
  --unshare-all --share-net \
  --proc /proc --dev /dev \
  --tmpfs /tmp --tmpfs /home --tmpfs /var --tmpfs /opt --tmpfs /srv --tmpfs /mnt --tmpfs /media \
  --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64 --ro-bind /bin /bin --ro-bind /sbin /sbin \
  --ro-bind /etc/resolv.conf /etc/resolv.conf --ro-bind /etc/ssl /etc/ssl --ro-bind /etc/ca-certificates /etc/ca-certificates --ro-bind /etc/nsswitch.conf /etc/nsswitch.conf --ro-bind /etc/hosts /etc/hosts --ro-bind /etc/passwd /etc/passwd --ro-bind /etc/group /etc/group \
  --bind /root/.claude /root/.claude --ro-bind /root/.claude.json /root/.claude.json --bind /root/.cache/claude-cli-nodejs /root/.cache/claude-cli-nodejs \
  --setenv HOME /root --setenv PATH /usr/local/bin:/usr/bin:/bin \
  -- claude -p \
  --allowedTools WebSearch --allowedTools Read \
  --disallowedTools Bash --disallowedTools Edit --disallowedTools Write \
  2>&1 | head -20
echo
echo "=== test 4: SIN el disallow Read, ¿claude puede leer /root/secretaria/ desde dentro? ==="
echo "Esperamos que NO porque /root/secretaria no está bind-mounteado en el sandbox."
echo "Leé /root/secretaria/whatsapp-handler.js y mostrame la línea 1." | bwrap \
  --unshare-all --share-net \
  --proc /proc --dev /dev \
  --tmpfs /tmp --tmpfs /home --tmpfs /var --tmpfs /opt --tmpfs /srv --tmpfs /mnt --tmpfs /media \
  --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64 --ro-bind /bin /bin --ro-bind /sbin /sbin \
  --ro-bind /etc/resolv.conf /etc/resolv.conf --ro-bind /etc/ssl /etc/ssl --ro-bind /etc/ca-certificates /etc/ca-certificates --ro-bind /etc/nsswitch.conf /etc/nsswitch.conf --ro-bind /etc/hosts /etc/hosts --ro-bind /etc/passwd /etc/passwd --ro-bind /etc/group /etc/group \
  --bind /root/.claude /root/.claude --ro-bind /root/.claude.json /root/.claude.json --bind /root/.cache/claude-cli-nodejs /root/.cache/claude-cli-nodejs \
  --setenv HOME /root --setenv PATH /usr/local/bin:/usr/bin:/bin \
  -- claude -p \
  --allowedTools WebSearch --allowedTools Read \
  --disallowedTools Bash --disallowedTools Edit --disallowedTools Write \
  2>&1 | head -20
