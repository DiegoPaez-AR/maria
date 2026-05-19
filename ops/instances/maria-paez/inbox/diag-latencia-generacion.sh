#!/bin/bash
# diag-latencia-generacion.sh — mide costo real: generación de respuesta + turns + thinking.
set -uo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"
echo "═══ DIAG GENERACIÓN — $(date '+%Y-%m-%d %H:%M:%S %z') ═══"

# prompt ~50k de relleno + pedido de generación realista (respuesta JSON de tamaño medio)
P=$(mktemp)
{
  echo "Sos Maria, una asistente. Abajo hay contexto y al final una instrucción."
  yes "Contexto de relleno: historial, agenda y libreta de contactos simulados para aproximar el tamano real del prompt de Maria." | head -430
  echo 'INSTRUCCION: Un contacto te escribio por WhatsApp para coordinar una reunion el viernes 16hs. Redacta una respuesta cordial de unas 150 palabras confirmando, y devolve SOLO un JSON con esta forma exacta: {"respuesta":"<texto>"} sin nada mas.'
} > "$P"
echo "prompt de prueba: $(wc -c < "$P") chars"
echo

parse='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{let o=JSON.parse(s);let u=o.usage||{};let mu=o.modelUsage||{};let m=Object.keys(mu).join(",")||o.model||"?";let ot=u.output_tokens||0;let it=u.input_tokens||0;let res=(o.result||"");let apims=o.duration_api_ms||0;console.log("modelo="+m);console.log("  turns="+(o.num_turns||"?")+"  api="+apims+"ms  total="+(o.duration_ms||"?")+"ms");console.log("  tokens: in="+it+"  out="+ot+"  → "+(ot&&apims?(ot/(apims/1000)).toFixed(1):"?")+" tok/s");console.log("  result_chars="+res.length+"  cost=$"+(o.total_cost_usd!=null?o.total_cost_usd.toFixed(4):"?")+"  err="+(o.is_error||false));console.log("  result[:120]="+JSON.stringify(res.slice(0,120)));}catch(e){console.log("  parse-fail: "+s.slice(0,200));}});'

bench() {
  local label="$1" model="$2"
  local args=(-p --output-format json)
  [ -n "$model" ] && args+=(--model "$model")
  local t0 t1 wall J
  echo "── $label ──"
  t0=$(date +%s.%N)
  J=$(timeout 150 claude "${args[@]}" < "$P" 2>/tmp/_e || true)
  t1=$(date +%s.%N)
  wall=$(awk -v a="$t0" -v b="$t1" 'BEGIN{printf "%.1f", b-a}')
  echo "  wall=${wall}s"
  printf '%s' "$J" | node -e "$parse"
  [ -s /tmp/_e ] && echo "  stderr: $(head -c160 /tmp/_e | tr -d '\n')"
  echo
}
bench "default (sonnet)" ""
bench "--model haiku"    "haiku"
rm -f "$P"
echo "═══ FIN — $(date '+%H:%M:%S') ═══"
