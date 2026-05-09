# ops/ — canal bidireccional VPS ↔ Cowork (multi-instance)

Git es el transporte. El cron del VPS corre cada minuto (`ops/cron-master.sh`)
y hace tres cosas:

1. **Pull del repo** una sola vez. Si vinieron cambios en código (excluyendo
   `ops/` y `config/`), restartea TODAS las instancias pm2 que tengan un
   `.conf` en `config/instances/`.
2. **Por cada instancia**, ejecuta scripts pendientes en
   `ops/instances/<slug>/inbox/*.sh` y deja el stdout+stderr en
   `ops/instances/<slug>/outbox/<nombre>.out`. Después borra del inbox.
3. **Por cada instancia**, dumpea estado (`pm2 logs <slug>`, queries de su
   SQLite) a `ops/instances/<slug>/snapshots/`. Commitea y pushea todo.

## Cómo lo uso yo (Claude)

- Para ejecutar un comando en una instancia: escribo
  `ops/instances/<slug>/inbox/<nombre>.sh`, commit, push. En ≤60s el VPS lo
  ejecuta y yo leo `ops/instances/<slug>/outbox/<nombre>.out` en el siguiente pull.
- Para ver estado en vivo de una instancia: leo
  `ops/instances/<slug>/snapshots/*.txt` — se refrescan cada minuto.

## Cómo lo usa Diego

- Nada. Se instala una vez y anda solo (cron).
- Para frenar el auto-deploy: `crontab -e` y comentá la línea. Para
  reactivar, descomentar.

## Archivos

```
ops/
├── cron-master.sh          ← ejecutable, corre cada minuto desde crontab
└── instances/
    └── <slug>/             ← una carpeta por instancia (maria-paez, juan-sanchez, ...)
        ├── inbox/          ← Claude escribe scripts .sh acá
        ├── outbox/         ← VPS deja outputs acá
        └── snapshots/      ← VPS dumpea estado acá (pm2-status.tsv,
                              pm2-logs.txt, eventos-ultimos.txt,
                              pendientes-abiertos.txt, hechos.txt,
                              programados.txt, .timestamp)
```

## Instalación del cron (una sola vez)

```bash
chmod +x ops/cron-master.sh
(crontab -l 2>/dev/null | grep -v 'ops/cron'; \
 echo '* * * * * cd /root/secretaria && bash ops/cron-master.sh >> /root/secretaria/ops/.cron.log 2>&1') | crontab -
```

## Cómo agregar una nueva instancia

Ver [docs/multi-instance.md](../docs/multi-instance.md).

## Modelo de confianza

Cualquiera con acceso push al repo puede hacer RCE root en el VPS via
`ops/instances/<slug>/inbox/`. El repo es privado y depende de 2FA de GitHub.
Es equivalente a dar acceso ssh: `cron-master.sh` ya auto-pullea y restartea
ante cambios en código, así que el inbox no agrega superficie nueva.
