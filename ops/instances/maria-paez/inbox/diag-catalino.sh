#!/bin/bash
cd /root/secretaria
echo "── ¿qué disparó el envío #243 a Catalino? ──"
timeout 25 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
for r in db.execute("SELECT * FROM wa_outbox WHERE id=243"):
    d=dict(r); d['texto']=(d.get('texto') or '')[:150]; print(' ',d)
print("\n── follow-ups con Catalino (6384-6461) o de la reserva ──")
for r in db.execute("""SELECT * FROM follow_ups WHERE esperando_de LIKE '%6384%' OR descripcion LIKE '%reserva%' OR descripcion LIKE '%atalino%' ORDER BY id DESC LIMIT 6"""):
    d=dict(r); print(' ',{k:str(v)[:70] for k,v in d.items() if v is not None})
print("\n── pendientes que mencionan reserva/Catalino/Fico ──")
for r in db.execute("""SELECT id,desc,dueno,estado,disparador FROM pendientes
   WHERE desc LIKE '%eserva%' OR desc LIKE '%atalino%' OR desc LIKE '%ico%' ORDER BY id DESC LIMIT 8"""):
    print(' ',dict(r))
print("\n── ¿Diego recibió respuesta a su pregunta de las 10:24? turnos TG después de 13:24 UTC ──")
for r in db.execute("""SELECT timestamp,direccion,substr(cuerpo,1,110) c FROM eventos
   WHERE canal='telegram' AND timestamp >= '2026-08-24 13:20' ORDER BY timestamp"""):
    f='→' if r['direccion']=='entrante' else '←'
    print(f" {r['timestamp'][11:16]} {f} {(r['c'] or '').replace(chr(10),' | ')}")
print("\n── hechos sobre la cena/reserva ──")
for r in db.execute("SELECT clave,substr(valor,1,100) v FROM hechos WHERE clave LIKE '%cena%' OR clave LIKE '%reserva%' OR valor LIKE '%Fico%' OR valor LIKE '%atalino%' LIMIT 8"):
    print(' ',dict(r))
db.close()
PY
echo "── qué le respondió Maria a Catalino a las 13:23 ──"
timeout 15 grep -A 2 "reply inline a \"+54 9 11 6384" /root/.pm2/logs/maria-paez-out.log | tail -5
timeout 20 python3 -c "
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
for r in db.execute(\"SELECT timestamp,substr(cuerpo,1,200) c FROM eventos WHERE canal='whatsapp' AND direccion='saliente' AND timestamp >= '2026-08-24 13:20' ORDER BY timestamp\"):
    print(' ',r['timestamp'][11:16],(r['c'] or '').replace(chr(10),' | '))
db.close()"
echo LISTO
