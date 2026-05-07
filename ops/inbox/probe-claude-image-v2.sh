#!/bin/bash
set +e

WORKDIR=/tmp/maria-imgtest
rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"
IMG="$WORKDIR/evento.png"

echo "── 1. Generar PNG con Python (Pillow) ──"
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
print("PNG creado OK")
PY
ls -la "$IMG"
echo

echo "── 2. claude --help completo: filtrar permission/allow ──"
claude --help 2>&1 | grep -iE 'permission|allow|disallow|skip-permissions|deny|tool' | head -30
echo

echo "── 3. PRUEBA A: --allowedTools Read + @path ──"
PROMPT_A="lee la imagen @${IMG} y respondé SOLO JSON {titulo,fecha,hora,lugar} sin claves ni markdown"
echo "$PROMPT_A" | timeout 90 claude -p --allowedTools "Read" 2>&1 | head -30
echo "  --- fin A ---"
echo

echo "── 4. PRUEBA B: --dangerously-skip-permissions + @path ──"
echo "$PROMPT_A" | timeout 90 claude -p --dangerously-skip-permissions 2>&1 | head -30
echo "  --- fin B ---"
echo

echo "── 5. PRUEBA C: sin @, mencionando el path como texto, con Read habilitada ──"
PROMPT_C="leé la imagen ubicada en ${IMG} y respondé SOLO JSON con titulo, fecha, hora, lugar"
echo "$PROMPT_C" | timeout 90 claude -p --allowedTools "Read" 2>&1 | head -30
echo "  --- fin C ---"
echo

echo "── 6. cleanup ──"
rm -rf "$WORKDIR"
