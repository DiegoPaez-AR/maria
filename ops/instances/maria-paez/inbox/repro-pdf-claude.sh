#!/bin/bash
# Reproducir el error de Claude Code al leer un PDF de 14 páginas.
# Bajamos un PDF de prueba (tamaño y formato similares al de Doris/Diego)
# o usamos uno que aún esté en /tmp si quedó.
set +e
set -a; . /root/secretaria/config/instances/maria-paez.conf; set +a
cd /root/secretaria

echo "═══ 1) Archivos en /tmp/maria-attach-* (puede que ya esté borrado) ═══"
ls -la /tmp/maria-attach-*.pdf 2>&1 | tail -5

echo ""
echo "═══ 2) Audit calls de claude alrededor del PDF de las 20:18 ═══"
# Vemos si hay archivo de audit con prompts/respuestas
ls /root/secretaria/state/maria-paez/audit* 2>/dev/null
find /root/secretaria/state -name '*audit*' -o -name '*claude-call*' 2>/dev/null | head -5

echo ""
echo "═══ 3) Re-leer el evento claude_call del PDF (raw=356c — ese es el output) ═══"
# Buscar si hay metadata con el output completo
sqlite3 "$MARIA_DB" "
SELECT metadata_json
FROM eventos
WHERE id IN (4607, 4608)
"

echo ""
echo "═══ 4) Bajar un PDF de prueba (similar al brochure) — usamos un PDF público de 14+ pgs ═══"
TEST_PDF="/tmp/maria-attach-test-pdf-$(date +%s).pdf"
# Generamos uno con pandoc o reportlab si está disponible
python3 -c "
from reportlab.pdfgen import canvas
c = canvas.Canvas('$TEST_PDF', pagesize=(595, 842))
for i in range(14):
    c.drawString(100, 800, f'Página {i+1} de 14')
    c.drawString(100, 780, 'Esto es un PDF de prueba para reproducir el error de Maria.')
    c.drawString(100, 760, 'Las fechas del curso son: 1/jul, 8/jul, 15/jul, 22/jul, 29/jul.')
    c.showPage()
c.save()
print('PDF generado:', '$TEST_PDF')
" 2>&1 | tail -3
ls -la "$TEST_PDF" 2>/dev/null

echo ""
echo "═══ 5) Llamar a claude -p con el PDF — exactamente como lo hace Maria ═══"
PROMPT="Leé el archivo @$TEST_PDF y extraé todas las fechas que menciona."
echo "Prompt: $PROMPT"
echo ""
echo "--- output de claude ---"
timeout 60s bash -c "echo \"$PROMPT\" | claude -p --allowedTools WebSearch --allowedTools WebFetch --allowedTools Read --disallowedTools Bash --disallowedTools Edit --disallowedTools Write 2>&1" | head -50
echo "--- fin output ---"

# Limpiar
rm -f "$TEST_PDF"
