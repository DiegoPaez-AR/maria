# ops/ — canal bidireccional VPS ↔ Cowork

Git es el transporte. El cron del VPS corre cada minuto y hace tres cosas:

1. **Pull del repo**. Si vinieron cambios en código (`.js`, `instrucciones.txt`, `package.json`, etc.), hace `pm2 restart maria --update-env`.
2. **Ejecuta inbox**. Por cada `ops/inbox/*.sh` pendiente, lo corre y deja el stdout+stderr en `ops/outbox/<nombre>.out`. Después lo borra del inbox.
3. **Snapshots**. Dumpea estado del VPS (`pm2 logs`, queries de SQLite con eventos recientes, pendientes abiertos, hechos, mensajes programados) a `ops/snapshots/`. Commitea y pushea todo.

## Cómo lo uso yo (Claude)

- Para ejecutar un comando en el VPS: escribo `ops/inbox/<nombre>.sh`, commit, push. En ≤60s el VPS lo ejecuta y yo leo `ops/outbox/<nombre>.out` en mi próximo pull.
- Para ver estado en vivo: leo `ops/snapshots/*.txt` — se refrescan cada minuto.

## Cómo lo usa Diego

- Nada. Se instala una vez y anda solo (cron).
- Si necesitás frenar el auto-deploy: `crontab -e` y comentá la línea. Para reactivar, descomentar.

## Archivos

```
ops/
├── cron.sh                 ← ejecutable, corre cada minuto desde crontab
├── inbox/                  ← Claude escribe scripts .sh acá
├── outbox/                 ← VPS deja outputs acá
├── snapshots/              ← VPS dumpea estado acá
│   ├── pm2-status.tsv
│   ├── pm2-logs.txt
│   ├── eventos-ultimos.txt
│   ├── pendientes-abiertos.txt
│   ├── hechos.txt
│   ├── programados.txt
│   └── .timestamp
└── README.md
```

## Instalación del cron (una sola vez)

```bash
chmod +x ops/cron.sh
(crontab -l 2>/dev/null | grep -v 'ops/cron.sh'; echo '* * * * * cd /root/secretaria && bash ops/cron.sh >> /root/secretaria/ops/.cron.log 2>&1') | crontab -
```

## Modelo de confianza

Cualquiera con acceso push al repo puede hacer RCE root en el VPS via `ops/inbox/`. El repo es privado y depende de 2FA de GitHub. Es equivalente a dar acceso ssh: `cron.sh` ya auto-pullea y hace `pm2 restart` ante cambios en código, así que el inbox no agrega superficie nueva.
