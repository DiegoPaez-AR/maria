# scripts/

Scripts auxiliares fuera del runtime de cada Maria.

## borrar-cancelled.sh

Archiva y borra clientes cancelled hace +90 días. Corre via cron diario.

**Instalación**:
```
chmod +x /root/secretaria/ops/scripts/borrar-cancelled.sh
(crontab -l 2>/dev/null; echo '0 4 * * * /root/secretaria/ops/scripts/borrar-cancelled.sh >> /root/secretaria/ops/.borrar-cancelled.log 2>&1') | crontab -
```
