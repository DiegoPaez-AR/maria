#!/bin/bash
set +e

WORKDIR=/tmp/maria-imgtest
rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"
IMG="$WORKDIR/evento.png"

echo "── 1. Instalar Pillow si falta ──"
python3 -c "import PIL" 2>/dev/null || {
  echo "  pip install Pillow..."
  pip install --break-system-packages -q Pillow 2>&1 | tail -3
}
python3 -c "from PIL import Image; print('  PIL OK')"

echo "── 2. Generar PNG ──"
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
print("  PNG creado OK")
PY
ls -la "$IMG"
file "$IMG"
echo

echo "── 3. PRUEBA: claude -p --allowedTools Read con @path ──"
PROMPT="leé la imagen @${IMG} (es un flyer de un evento) y respondé SOLO JSON con campos titulo, fecha, hora, lugar. Sin markdown, sin texto extra."
echo "  prompt: $PROMPT"
echo "  --- output ---"
echo "$PROMPT" | timeout 120 claude -p --allowedTools "Read" 2>&1 | head -20
echo "  --- fin ---"
echo

echo "── 4. cleanup ──"
rm -rf "$WORKDIR"
