#!/bin/bash
set +e

echo "── 0. instalar dependencias para generar PNG ──"
apt-get install -qy python3-pil 2>&1 | tail -3
python3 -c "import PIL; print('  PIL OK')" || { echo "FAIL: no se pudo instalar PIL"; exit 1; }

WORKDIR=/tmp/maria-imgtest
rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"
IMG="$WORKDIR/evento.png"

echo "── 1. Generar PNG ──"
python3 - <<'PY'
from PIL import Image, ImageDraw, ImageFont
img = Image.new('RGB', (800, 300), 'white')
d = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 32)
except Exception:
    font = ImageFont.load_default()
d.text((40, 40),  "Conferencia AI 2026", fill='black', font=font)
d.text((40, 100), "Viernes 15 de mayo, 18:00 hs", fill='black', font=font)
d.text((40, 160), "Centro Cultural Recoleta", fill='black', font=font)
d.text((40, 220), "Entrada libre", fill='black', font=font)
img.save("/tmp/maria-imgtest/evento.png")
print("  PNG OK")
PY
ls -la "$IMG"
echo

echo "── 2. PRUEBA — claude -p --allowedTools Read con @path ──"
PROMPT="leé la imagen @${IMG} (un flyer de un evento) y respondé SOLO un objeto JSON con campos titulo, fecha, hora, lugar. Sin markdown, sin texto extra."
echo "  --- output ---"
echo "$PROMPT" | timeout 120 claude -p --allowedTools "Read" 2>&1 | head -40
echo "  --- fin ---"
echo

echo "── 3. cleanup ──"
rm -rf "$WORKDIR"
