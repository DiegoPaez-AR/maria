#!/bin/bash
# Verificar si poppler-utils está instalado y accesible
set +e

echo "═══ 1) pdftotext en sistema (host) ═══"
which pdftotext
pdftotext -v 2>&1 | head -3
echo ""

echo "═══ 2) dpkg / apt — poppler-utils instalado? ═══"
dpkg -l | grep -i poppler 2>&1 | head -5
echo ""

echo "═══ 3) Repetir test pero ADENTRO del bwrap (como hace Maria) ═══"
TEST_PDF="/tmp/maria-attach-test-bwrap-$(date +%s).pdf"
python3 -c "
from reportlab.pdfgen import canvas
c = canvas.Canvas('$TEST_PDF')
for i in range(14):
    c.drawString(100, 800, f'Pag {i+1}: las fechas son 1-jul, 8-jul, 15-jul')
    c.showPage()
c.save()
" 2>&1 | tail -3

# Replicar el bwrap exacto de claude-client.js + agregar el bind del PDF
bwrap \
  --unshare-all --share-net \
  --proc /proc --dev /dev --tmpfs /tmp \
  --tmpfs /home --tmpfs /var --tmpfs /opt --tmpfs /srv --tmpfs /mnt --tmpfs /media \
  --ro-bind /usr /usr \
  --ro-bind /bin /bin \
  --ro-bind /sbin /sbin \
  --ro-bind /etc/resolv.conf /etc/resolv.conf \
  --ro-bind /etc/ssl /etc/ssl \
  --ro-bind /etc/passwd /etc/passwd \
  --ro-bind /etc/group /etc/group \
  --bind /root/.claude /root/.claude \
  --ro-bind /root/.claude.json /root/.claude.json \
  --bind /root/.cache/claude-cli-nodejs /root/.cache/claude-cli-nodejs \
  --ro-bind /lib /lib \
  --ro-bind /lib64 /lib64 \
  --ro-bind "$TEST_PDF" "$TEST_PDF" \
  --chdir /root \
  -- bash -c "
    echo '--- dentro del bwrap ---'
    echo 'which pdftotext:' && which pdftotext
    echo 'ls del PDF:' && ls -la $TEST_PDF
    echo ''
    echo '--- Probar pdftotext ---'
    pdftotext $TEST_PDF - 2>&1 | head -10
  "

rm -f "$TEST_PDF"
