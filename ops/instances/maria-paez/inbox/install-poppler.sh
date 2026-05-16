#!/bin/bash
# Instala poppler-utils para que Claude Code pueda procesar PDFs.
# /usr ya está bind-mounteado read-only en el sandbox bwrap, así que
# cualquier binario que se instale en /usr/bin queda automáticamente
# accesible adentro del sandbox sin tener que cambiar claude-client.js.
set +e

echo "═══ Estado previo ═══"
which pdftotext 2>&1
echo ""

echo "═══ apt update (silencioso, solo errores) ═══"
DEBIAN_FRONTEND=noninteractive apt-get update -qq 2>&1 | tail -5

echo ""
echo "═══ apt install -y poppler-utils ═══"
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends poppler-utils 2>&1 | tail -10

echo ""
echo "═══ Verificación ═══"
which pdftotext
pdftotext -v 2>&1 | head -2
echo ""
echo "Binarios de poppler-utils instalados:"
dpkg -L poppler-utils 2>/dev/null | grep '/bin/' | head -20

echo ""
echo "═══ Test dentro del bwrap (con --ro-bind /usr) ═══"
TEST_PDF="/tmp/maria-attach-test-poppler-$(date +%s).pdf"
python3 -c "
from reportlab.pdfgen import canvas
c = canvas.Canvas('$TEST_PDF')
for i in range(3):
    c.drawString(100, 800, f'Pag {i+1}: fechas 1-jul, 8-jul, 15-jul')
    c.showPage()
c.save()
" 2>&1 | tail -3

bwrap --unshare-all --share-net --proc /proc --dev /dev --tmpfs /tmp \
  --ro-bind /usr /usr --ro-bind /bin /bin --ro-bind /sbin /sbin \
  --ro-bind /lib /lib --ro-bind /lib64 /lib64 \
  --ro-bind /etc/resolv.conf /etc/resolv.conf --ro-bind /etc/ssl /etc/ssl \
  --ro-bind /etc/passwd /etc/passwd --ro-bind /etc/group /etc/group \
  --ro-bind "$TEST_PDF" "$TEST_PDF" \
  --chdir /root \
  -- pdftotext "$TEST_PDF" - 2>&1 | head -10

rm -f "$TEST_PDF"
