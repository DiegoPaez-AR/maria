#!/bin/bash
# diag-thinking-caps.sh — matriz: thinking caps x modelos. Solo mide, no toca nada.
set -uo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"
echo "═══ DIAG THINKING CAPS — $(date '+%Y-%m-%d %H:%M:%S %z') ═══"

P=$(mktemp)
{
  echo "Sos Maria, una asistente personal. Abajo hay contexto (historial, agenda, libreta) y al final una instruccion."
  yes "Contexto de relleno representativo del tamano del prompt real de Maria: historial de conversaciones, agenda semanal y libreta de contactos del usuario." | head -460
  echo 'INSTRUCCION: Un contacto te escribio por WhatsApp para coordinar una reunion el viernes 16hs en la oficina. Redacta una respuesta cordial de unas 150 palabras confirmando, y devolve SOLO un JSON con la forma {"respuesta":"<texto>"} y nada mas.'
} > "$P"
echo "prompt de prueba: $(wc -c < "$P") chars   (input real-world va cacheado)"
echo

parse='let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{let o=JSON.parse(s);let u=o.usage||{};let mu=o.modelUsage||{};let m=Object.keys(mu).join(",")||o.model||"?";let ot=u.output_tokens||0;let it=u.input_tokens||0;let cr=u.cache_read_input_tokens||0;let cc=u.cache_creation_input_tokens||0;let api=o.duration_api_ms||0;let res=o.result||"";let tps=(ot&&api)?(ot/(api/1000)).toFixed(1):"?";console.log("  modelo="+m+"  turns="+(o.num_turns||"?")+"  is_error="+(o.is_error||false));console.log("  api="+api+"ms  total="+(o.duration_ms||"?")+"ms");console.log("  tokens_in="+it+" (cache_read="+cr+" cache_create="+cc+")  tokens_out="+ot+"  -> "+tps+" tok/s");console.log("  result_chars="+res.length+"  cost_usd=$"+(o.total_cost_usd!=null?o.total_cost_usd.toFixed(4):"?"));}catch(e){console.log("  parse-fail: "+s.slice(0,220));}});'

run() {
  local label="$1" cap="$2" model="$3" to="$4"
  local args=(-p --output-format json)
  [ -n "$model" ] && args+=(--model "$model")
  local t0 t1 wall J
  echo "── $label ──"
  t0=$(date +%s.%N)
  if [ -n "$cap" ]; then
    J=$( timeout "$to" env "MAX_THINKING_TOKENS=$cap" claude "${args[@]}" < "$P" 2>/tmp/_e || true )
  else
    J=$( timeout "$to" claude "${args[@]}" < "$P" 2>/tmp/_e || true )
  fi
  t1=$(date +%s.%N)
  wall=$(awk -v a="$t0" -v b="$t1" 'BEGIN{printf "%.1f", b-a}')
  echo "  wall=${wall}s"
  printf '%s' "$J" | node -e "$parse"
  [ -s /tmp/_e ] && echo "  stderr: $(head -c200 /tmp/_e | tr -d '\n')"
  echo
}

run "BASELINE — modelo default, SIN cap"      ""     ""                            120
run "CAP 1024 — modelo default"               "1024" ""                            90
run "CAP 0 (thinking off) — modelo default"   "0"    ""                            90
run "VIEJO — claude-3-5-haiku-20241022"       ""     "claude-3-5-haiku-20241022"   90
run "VIEJO — claude-3-5-sonnet-20241022"      ""     "claude-3-5-sonnet-20241022"  90
rm -f "$P"
echo "═══ FIN — $(date '+%H:%M:%S') ═══"
