#!/bin/bash
# aplicar-max-thinking-512.sh — baja MAX_THINKING_TOKENS a 512 en maria-paez.
set -uo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"
echo "═══ APLICAR MAX_THINKING_TOKENS=512 — $(date '+%Y-%m-%d %H:%M %z') ═══"
CF=/root/secretaria/config/instances/maria-paez.conf
VAL=512
if [ ! -f "$CF" ]; then echo "✗ no existe $CF"; ls -la /root/secretaria/config/instances/ 2>/dev/null; exit 1; fi

BK="${CF}.bak-$(date +%Y%m%d-%H%M%S)"
cp "$CF" "$BK"; echo "backup: $BK"
echo "valor previo: $(grep -E '^[[:space:]]*MAX_THINKING_TOKENS=' "$CF" || echo '(no seteado)')"
if grep -qE '^[[:space:]]*MAX_THINKING_TOKENS=' "$CF"; then
  sed -i -E "s|^[[:space:]]*MAX_THINKING_TOKENS=.*|MAX_THINKING_TOKENS=${VAL}|" "$CF"
  echo "actualizado MAX_THINKING_TOKENS → ${VAL}"
else
  printf '\n# Cap de razonamiento extendido (latencia). Bajado a 512 el %s.\nMAX_THINKING_TOKENS=%s\n' "$(date +%Y-%m-%d)" "$VAL" >> "$CF"
  echo "agregado MAX_THINKING_TOKENS=${VAL}"
fi
echo
echo "── .conf (líneas relevantes) ──"
grep -nE 'ASISTENTE_SLUG|MAX_THINKING_TOKENS' "$CF" | sed 's/^/  /'

verify() {
  pm2 jlist 2>/dev/null | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{
    let a=JSON.parse(s); let p=a.find(x=>x.name==="maria-paez");
    if(!p){console.log("PROC_NOT_FOUND");return;}
    let pe=p.pm2_env||{}; let v=pe.MAX_THINKING_TOKENS;
    if(v===undefined && pe.env) v=pe.env.MAX_THINKING_TOKENS;
    console.log("status="+(pe.status||"?")+" restarts="+(pe.restart_time||"?")+" pid="+(p.pid||"?")+" MAX_THINKING_TOKENS="+(v!==undefined?v:"<UNSET>"));
  }catch(e){console.log("PARSE_FAIL "+e.message);}});'
}

cd /root/secretaria
echo
echo "── reload pm2 (ecosystem, solo maria-paez, --update-env) ──"
pm2 reload ecosystem.config.js --only maria-paez --update-env 2>&1 | tail -5
sleep 9
R1=$(verify); echo "  post-reload: $R1"

if ! echo "$R1" | grep -q "MAX_THINKING_TOKENS=512"; then
  echo
  echo "── reload no propagó el env → fallback delete+start vía ecosystem ──"
  pm2 delete maria-paez 2>&1 | tail -2
  pm2 start ecosystem.config.js --only maria-paez 2>&1 | tail -3
  sleep 10
  R2=$(verify); echo "  post-restart: $R2"
fi
pm2 save 2>&1 | tail -1

echo
echo "── estado final + log (¿WA reconectó sin QR?) ──"
pm2 logs maria-paez --nostream --lines 16 2>/dev/null | tail -16
echo
echo "═══ FIN — $(date '+%H:%M:%S') ═══"
