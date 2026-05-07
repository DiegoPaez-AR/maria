#!/bin/bash
# Probar si claude -p (no-interactivo) lee imágenes vía @path o necesita otra forma.
set +e

WORKDIR=/tmp/maria-imgtest
rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"
IMG="$WORKDIR/evento.png"

echo "── 1. Generando imagen de prueba con ImageMagick ──"
# String simple que claude debería poder leer
convert -size 600x200 xc:white -gravity center \
  -font DejaVu-Sans -pointsize 22 \
  -fill black -annotate 0 "Conferencia AI 2026\nViernes 15 de mayo, 18hs\nCentro Cultural Recoleta" \
  "$IMG" 2>&1
ls -la "$IMG" 2>&1
echo

echo "── 2. claude --version ──"
claude --version 2>&1
echo

echo "── 3. PRUEBA A: pasar @path en el texto del prompt por stdin ──"
PROMPT_A="leé el siguiente flyer de evento y respondé SOLO con un JSON {\"titulo\":\"\",\"fecha\":\"\",\"hora\":\"\",\"lugar\":\"\"}: @${IMG}"
echo "  prompt: $PROMPT_A"
echo "  --- output ---"
echo "$PROMPT_A" | claude -p 2>&1 | head -30
echo "  --- fin output ---"
echo

echo "── 4. PRUEBA B: pasar el path absoluto sin @ ──"
PROMPT_B="leé el flyer de evento en el archivo ${IMG} y respondé SOLO JSON {\"titulo\":\"\",\"fecha\":\"\",\"hora\":\"\",\"lugar\":\"\"}"
echo "$PROMPT_B" | claude -p 2>&1 | head -30
echo "  --- fin output B ---"
echo

echo "── 5. PRUEBA C: --help para ver flags relacionados con imagen / file / image ──"
claude --help 2>&1 | grep -iE 'image|file|attach|input|media' | head -20
echo

echo "── 6. cleanup ──"
rm -rf "$WORKDIR"
