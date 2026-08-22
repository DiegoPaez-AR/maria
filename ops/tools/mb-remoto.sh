#!/bin/bash
# mb-remoto.sh — control remoto de MariaBridge desde el VPS (2026-08-22).
# El screenshot se COPIA AL REPO para que Claude pueda verlo con su tool Read
# (no puede fetchear URLs). Ese era el eslabón que faltaba para el deploy 100%
# remoto: shot → mirar → tap en la coordenada exacta.
#
# Uso:
#   bash ops/tools/mb-remoto.sh shot            # captura → ops/instances/<slug>/shots/ultima.png
#   bash ops/tools/mb-remoto.sh tap 360 883
#   bash ops/tools/mb-remoto.sh nodos|home|ping
#   bash ops/tools/mb-remoto.sh estado          # últimos comandos y resultados
set -e
cd /root/secretaria
SLUG="${ASISTENTE_SLUG:-maria-paez}"
SHOTS="ops/instances/$SLUG/shots"
ACCION="${1:?uso: mb-remoto.sh {shot|tap X Y|nodos|home|ping|despertar|estado}}"

_esperar_resultado() {  # $1 = id, espera hasta 90s
  for i in $(seq 1 18); do
    sleep 5
    R=$(node -e "
      const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
      const r=db.prepare('SELECT estado,resultado FROM mb_control WHERE id=?').get($1); db.close();
      if (r && r.estado!=='pendiente' && r.estado!=='enviado') console.log(r.estado+'|'+(r.resultado||''));
    ")
    [ -n "$R" ] && { echo "$R"; return 0; }
  done
  echo "timeout|sin respuesta en 90s"
}

case "$ACCION" in
  estado)
    node -e "
      const db=require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB,{readonly:true});
      db.prepare('SELECT id,cmd,estado,substr(resultado,1,300) r FROM mb_control ORDER BY id DESC LIMIT 8').all()
        .reverse().forEach(x=>console.log('#'+x.id,x.cmd,'['+x.estado+']',(x.r||'').slice(0,280))); db.close();"
    ;;
  shot)
    ID=$(node -e "console.log(require('/root/secretaria/mb-control').encolar('shot'))")
    echo "comando #$ID (shot) encolado — esperando…"
    RES=$(_esperar_resultado "$ID")
    echo "$RES"
    URL=$(echo "$RES" | grep -oE 'https://[^ ]+\.png' || true)
    if [ -n "$URL" ]; then
      mkdir -p "$SHOTS"
      cp "/var/www/intensa.io/_dl/$(basename "$URL")" "$SHOTS/ultima.png"
      echo "captura copiada al repo: $SHOTS/ultima.png (se pushea en el próximo tick)"
    fi
    ;;
  tap)
    X="${2:?falta X}"; Y="${3:?falta Y}"
    ID=$(node -e "console.log(require('/root/secretaria/mb-control').encolar('tap',{x:$X,y:$Y}))")
    echo "comando #$ID (tap $X,$Y) encolado — esperando…"
    _esperar_resultado "$ID"
    ;;
  nodos|home|ping|despertar)
    ID=$(node -e "console.log(require('/root/secretaria/mb-control').encolar('$ACCION'))")
    echo "comando #$ID ($ACCION) encolado — esperando…"
    _esperar_resultado "$ID"
    ;;
  *) echo "acción desconocida: $ACCION"; exit 1;;
esac
