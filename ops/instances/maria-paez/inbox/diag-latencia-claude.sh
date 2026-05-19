#!/bin/bash
# diag-latencia-claude.sh — diagnóstico de latencia de las llamadas a Claude.
# Lo manda Claude (Cowork) por el canal asíncrono. Solo lee/mide, no toca código.
set -uo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"

echo "════════════════════════════════════════════════════════════"
echo " DIAG LATENCIA CLAUDE — $(date '+%Y-%m-%d %H:%M:%S %z')"
echo "════════════════════════════════════════════════════════════"

# ─── 1. ENTORNO ───────────────────────────────────────────────
echo
echo "── 1. ENTORNO ──────────────────────────────────────────────"
echo "node:    $(node --version 2>/dev/null || echo '?')"
echo -n "claude:  "; claude --version 2>/dev/null || echo '(no encontrado)'
echo "bin:     $(command -v claude 2>/dev/null || echo '?')"
echo "ANTHROPIC_API_KEY:     $([ -n "${ANTHROPIC_API_KEY:-}" ] && echo 'seteada (billing API)' || echo '<unset> → auth ~/.claude (Pro/Max)')"
echo "CLAUDE_SETTINGS_FILE:  ${CLAUDE_SETTINGS_FILE:-<unset>}"
echo "CLAUDE_TIMEOUT_MS:     ${CLAUDE_TIMEOUT_MS:-<default 480000>}"
echo "CLAUDE_IDLE_TIMEOUT_MS:${CLAUDE_IDLE_TIMEOUT_MS:-<default 90000>}"
echo "CLAUDE_ALLOWED_TOOLS:  ${CLAUDE_ALLOWED_TOOLS:-<default WebSearch,WebFetch,Read>}"
echo
echo "mcp-config.json activo:"
sed 's/^/  /' /root/secretaria/mcp-config.json 2>/dev/null || echo "  (no existe)"
echo
echo "playwright MCP en cache de npx:"
if ls -d ~/.npm/_npx/*/node_modules/@playwright/mcp 2>/dev/null | head -3 | sed 's/^/  ✓ /'; then :; else
  echo "  ✗ NO cacheado — npx resuelve/baja @playwright/mcp@latest en cada arranque de claude"
fi

# ─── 2. STATS DB — claude_call últimos 7 días ─────────────────
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"
echo
echo "── 2. CLAUDE_CALL HISTÓRICO (DB: $DB) ──────────────────────"
if [ ! -f "$DB" ]; then
  echo "  ✗ DB no encontrada"
else
  TSV=$(sqlite3 -separator '|' "$DB" \
    "SELECT timestamp, cuerpo FROM eventos
     WHERE cuerpo LIKE 'claude_call %'
       AND timestamp >= datetime('now','-7 days')
     ORDER BY timestamp;")
  echo "$TSV" | awk -F'|' '
  function pct(arr, n, p,   idx){ idx=int((p/100.0)*(n-1))+1; return arr[idx] }
  {
    ts=$1; body=$2;
    if (match(body, /claude_call ([a-z_-]+): ([0-9]+)ms prompt=([0-9]+)c raw=([0-9]+)c/, m)) {
      canal=m[1]; ms=m[2]+0; pc=m[3]+0; rc=m[4]+0;
      err=(body ~ /ERROR=/)?1:0;
      day=substr(ts,1,10);
      n++; allms[n]=ms; sum+=ms; if(ms>mx){mx=ms;mxts=ts;mxc=canal;mxpc=pc}
      cN[canal]++; cSum[canal]+=ms; if(ms>cMx[canal])cMx[canal]=ms;
      dN[day]++; dSum[day]+=ms; if(ms>dMx[day])dMx[day]=ms;
      errN+=err;
      # correlacion size→duracion
      b = (pc<20000)?"1.<20k" : (pc<40000)?"2.20-40k" : (pc<60000)?"3.40-60k" : (pc<80000)?"4.60-80k" : "5.>80k";
      bN[b]++; bSum[b]+=ms; if(ms>bMx[b])bMx[b]=ms; bPc[b]+=pc;
      # top slowest
      slowms[n]=ms; slowline[ms" "n]=ts" | "canal" | "ms"ms | prompt="pc"c | raw="rc"c"(err?" | ERROR":"");
    }
  }
  END{
    if(n==0){print "  (sin eventos claude_call en la ventana)"; exit}
    # sort durations
    for(i=1;i<=n;i++) s[i]=allms[i];
    for(i=1;i<=n;i++)for(j=i+1;j<=n;j++)if(s[j]<s[i]){t=s[i];s[i]=s[j];s[j]=t}
    printf "  total llamadas: %d   errores/timeouts: %d (%.1f%%)\n", n, errN, errN*100.0/n;
    printf "  duración (s):  min %.1f   p50 %.1f   p90 %.1f   p99 %.1f   max %.1f   avg %.1f\n",
      s[1]/1000, pct(s,n,50)/1000, pct(s,n,90)/1000, pct(s,n,99)/1000, s[n]/1000, sum/n/1000;
    print "";
    print "  POR CANAL:";
    for(c in cN) printf "    %-14s n=%-4d avg=%6.1fs  max=%6.1fs\n", c, cN[c], cSum[c]/cN[c]/1000, cMx[c]/1000;
    print "";
    print "  POR DÍA:";
    nd=0; for(d in dN) days[++nd]=d;
    for(i=1;i<=nd;i++)for(j=i+1;j<=nd;j++)if(days[j]<days[i]){t=days[i];days[i]=days[j];days[j]=t}
    for(i=1;i<=nd;i++){d=days[i]; printf "    %s  n=%-4d avg=%6.1fs  max=%6.1fs\n", d, dN[d], dSum[d]/dN[d]/1000, dMx[d]/1000}
    print "";
    print "  CORRELACIÓN tamaño-de-prompt → duración:";
    nb=0; for(b in bN) bk[++nb]=b;
    for(i=1;i<=nb;i++)for(j=i+1;j<=nb;j++)if(bk[j]<bk[i]){t=bk[i];bk[i]=bk[j];bk[j]=t}
    for(i=1;i<=nb;i++){b=bk[i]; printf "    prompt %-9s n=%-4d avg=%6.1fs  max=%6.1fs  (avg prompt=%dk c)\n",
      substr(b,3), bN[b], bSum[b]/bN[b]/1000, bMx[b]/1000, int(bPc[b]/bN[b]/1000)}
    print "";
    print "  10 LLAMADAS MÁS LENTAS:";
    cnt=0;
    for(k in slowline){ keys[++cnt]=k }
    # ordenar keys por ms desc (la key arranca con ms)
    for(i=1;i<=cnt;i++)for(j=i+1;j<=cnt;j++){
      ki=keys[i]+0; kj=keys[j]+0; if(kj>ki){t=keys[i];keys[i]=keys[j];keys[j]=t}
    }
    for(i=1;i<=cnt && i<=10;i++) print "    "slowline[keys[i]];
  }'
fi

# ─── 3. MICROBENCHMARK — overhead del MCP de playwright ───────
echo
echo "── 3. MICROBENCHMARK claude -p (prompt trivial) ────────────"
echo "   Mide el piso de latencia: arranque de CLI + (carga de MCP)."
echo "   Cada corrida: prompt 'Respondé solo OK'. timeout 100s."
PROMPT='Respondé únicamente con la palabra OK y nada más.'
bench() {
  local label="$1"; shift
  local t0 t1 dt out rc
  t0=$(date +%s.%N)
  out=$(printf '%s' "$PROMPT" | timeout 100 claude -p "$@" 2>/tmp/_bencherr || true)
  rc=$?
  t1=$(date +%s.%N)
  dt=$(awk -v a="$t0" -v b="$t1" 'BEGIN{printf "%.1f", b-a}')
  out=$(printf '%s' "$out" | tr -d '\n' | cut -c1-50)
  printf "   %-32s %7ss  rc=%-3d out=[%s]\n" "$label" "$dt" "$rc" "$out"
  if [ "$rc" != "0" ]; then echo "        stderr: $(head -c200 /tmp/_bencherr | tr -d '\n')"; fi
}
MCP=/root/secretaria/mcp-config.json
bench "CON mcp-config (corrida 1/cold)" --mcp-config "$MCP"
bench "CON mcp-config (corrida 2/warm)" --mcp-config "$MCP"
bench "SIN mcp-config (corrida 1)"
bench "SIN mcp-config (corrida 2)"

echo
echo "════════════════════════════════════════════════════════════"
echo " FIN DIAG — $(date '+%H:%M:%S')"
echo "════════════════════════════════════════════════════════════"
