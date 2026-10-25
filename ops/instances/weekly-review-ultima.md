# Revisión semanal 2026-W43

_Últimos 7 días (desde 2026-10-18) · generada 25/10/2026, 05:00:01_

**Resumen**: Maria Paez US$13.12 / 79 llamadas, 1 fallidas, MB v4.11 · Sofia Bruscoli US$1.98 / 10 llamadas, 0 fallidas, MB v4.11

**VPS**: disco 48% usado (19G libres) · RAM 1047/3819 MB · logs: 908K · pm2: maria-paez: online, 9 restarts, up 39h · sofia-bruscoli: online, 9 restarts, up 39h · intensa-api: online, 2 restarts, up 341h · pm2-logrotate: online, 6 restarts, up 1098h

### Cambios deployados en la semana

```
23/10 17:20 executor: agregar_pendiente acepta descripcion/description como alias de desc (y crear_follow_up acepta desc)
19/10 15:26 MariaBridge 4.12: se relanza solo tras actualizarse (MY_PACKAGE_REPLACED) y despierta la pantalla con brillo bajo
19/10 14:38 Mejoras 19/10: aviso de ventana WA al encolar, un pendiente por gestión, MariaBridge 4.11 (placeholder = cuadro vacío), daily-report con modo semanal
```

---

## Maria Paez (maria-paez)

**Usuarios**: 17 activos (16 atendidos, 13 pausados, 1 con Telegram) · **contactos nuevos**: 4 · **MariaBridge**: v4.11

**Gasto**: US$13.12 en 79 llamadas (US$0.17 por llamada) · modo prosa: 12 · cortes Telegram: 65 · acciones fallidas: 1

### Actividad por día
| día | TG in | TG out | WA in | WA out | mail in | mail out | cal |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-10-18 | 1 | 4 | 0 | 1 | 0 | 2 | 1 |
| 2026-10-19 | 4 | 7 | 0 | 0 | 0 | 2 | 0 |
| 2026-10-20 | 7 | 13 | 10 | 7 | 0 | 3 | 0 |
| 2026-10-21 | 5 | 10 | 2 | 2 | 0 | 2 | 0 |
| 2026-10-22 | 6 | 11 | 3 | 2 | 0 | 2 | 1 |
| 2026-10-23 | 2 | 5 | 4 | 5 | 0 | 2 | 0 |
| 2026-10-24 | 2 | 3 | 2 | 2 | 0 | 2 | 0 |
| 2026-10-25 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |

### Gasto por día
| día | llamadas | USD |
| --- | --- | --- |
| 2026-10-18 | 2 | 0.42 |
| 2026-10-19 | 6 | 1.45 |
| 2026-10-20 | 27 | 3.96 |
| 2026-10-21 | 11 | 1.93 |
| 2026-10-22 | 13 | 2.11 |
| 2026-10-23 | 13 | 2.1 |
| 2026-10-24 | 7 | 1.15 |

### Gasto por tipo de llamada
| tipo | n | USD |
| --- | --- | --- |
| telegram | 27 | 6.39 |
| whatsapp | 21 | 5.72 |
| moderacion | 24 | 0.49 |
| memoria-curada | 6 | 0.46 |
| enriquecer-contacto | 1 | 0.06 |

### Quién escribió
| quién | canal | n |
| --- | --- | --- |
| Diego | telegram | 27 |
| Poch Burgers | whatsapp | 11 |
| Bryan Tafel | whatsapp | 4 |
| Farinelli Arroyo | whatsapp | 4 |
| La Carreta (empanadas) | whatsapp | 2 |

### Acciones ejecutadas
| acción | n |
| --- | --- |
|  enviar_wa | 12 |
|  quitar_pendiente | 10 |
|  buscar_contacto_global | 10 |
|  agregar_pendiente | 6 |
|  upsert_contacto | 2 |
|  crear_evento | 2 |
|  crear_usuario | 1 |
|  cerrar_follow_up | 1 |

### Acciones FALLIDAS
| cuándo | qué |
| --- | --- |
| 2026-10-23 13:45:13 | acción FALLÓ: agregar_pendiente — Faltan campos requeridos: desc |

### Avisos de sistema (no rutinarios)
| cuándo | qué |
| --- | --- |
| 2026-10-20 20:31:09 | wa-outbox: mensaje #298 a 5491137646922 descartado por viejo (el destinatario escribió después de encolarlo y ya se le respondió): "Perdón, una corrección al pedido anter |
| 2026-10-22 06:26:25 | wa-outbox: mensaje #300 a 5491130471497 VENCIÓ sin entregarse: "Hola Bryan! Diego me confirma: el viaje lo pagás vos, como h" |
| 2026-10-24 08:16:25 | follow-up #80 cerrado: 5491130471497@c.us respondió antes del vencimiento (Esperando que Bryan aclare si sigue en pie organizar el crucero (le reconfirmé que el viaje lo  |
| 2026-10-25 04:12:37 | gcontacts-reconcile semanal (maria-paez): 462 ok, 0 fallidos |

### WhatsApp saliente (wa_outbox)
| estado | n |
| --- | --- |
| descartado | 1 |
| entregado | 7 |
| vencido | 1 |

No entregados:
| id | cuándo | número | estado | intentos | texto |
| --- | --- | --- | --- | --- | --- |
| 298 | 2026-10-20 20:26:41 | 5491137646922 | descartado | 0 | Perdón, una corrección al pedido anterior: el último stadium con papas |
| 300 | 2026-10-22 00:26:10 | 5491130471497 | vencido | 0 | Hola Bryan! Diego me confirma: el viaje lo pagás vos, como hacemos sie |

### Follow-ups vivos
_(nada)_

### Pendientes abiertos
| id | dueño | qué |
| --- | --- | --- |
| 367 | maria | Esperando que Bryan aclare si sigue en pie organizar el crucero (le reconfirmé que el viaj |
| 363 | usuario | Pagarle a Nina |
| 335 | usuario | Reunión Software elecciones |
| 334 | usuario | Reunión Telefónica Gobierno |
| 308 | usuario | Llamar a Tono por droguería |
| 236 | usuario | Agregar al calendar las fechas posibles de colación y de revistas de arte, cuando estén |
| 235 | usuario | Pedir los certificados de Ley Micaela |
| 234 | usuario | Agregar la visita a Art Haus |
| 233 | usuario | Chequear la perfo de Tosorarti con Eva |
| 232 | usuario | Llamar a Todorati por su mesa en las jornadas y por si alguien quiere sumarse con material |
| 231 | usuario | Diplomaturas de Diego en 3 partes |
| 189 | usuario | Llamar a Poggetti |

### error.log agrupado (sin cortes de Telegram)
| n | línea |
| --- | --- |
| 3 | [wa-validate] sin cliente WA — normalizado offline "<num>@c.us" → <num>@c.us (SIN verificar en Meta) |
| 2 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Listo, |
| 2 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Dale, l |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Listo. |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Sí, ten |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Listo D |
| 1 | 1. El contacto de Lionel ya tiene guardado el Wh" |
| 1 | [wa-outbox] #N DESCARTADO por viejo → <num>: el destinatario escribió después y ya se le respondió: "Perdón, u |
| 1 | [wa-outbox] #N VENCIDO sin entregar → <num>: "Hola Bryan! Diego me confirma: el viaje lo pagás vos, como h" |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Todo bi |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Buenísi |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Perfect |
| 1 | [executor] acción #N (agregar_pendiente) falló: Faltan campos requeridos: desc |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Sigue v |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Dale, c |

### out.log: warnings / fallos agrupados
| n | línea |
| --- | --- |
| 1 | [TG] poll recuperado tras 10 fallos (telegram getUpdates: {"ok":false,"error_code":502,"descripti) |

### MariaBridge: warnings / errores
| n | línea |
| --- | --- |
| 2 | [MB v4.11]  W [frio] diálogo ajeno (com.android.stk): "[CLARO] Tu Pack de 2GB x 3 dias a $4000 + WhatsApp grat |
| 1 | [MB v4.10]  W [upd] Cancel está centrado (361 vs 359) — sin espejo confiable, no toco |


---

## Sofia Bruscoli (sofia-bruscoli)

**Usuarios**: 2 activos (2 atendidos, 0 pausados, 1 con Telegram) · **contactos nuevos**: 16 · **MariaBridge**: v4.11

**Gasto**: US$1.98 en 10 llamadas (US$0.20 por llamada) · modo prosa: 2 · cortes Telegram: 59 · acciones fallidas: 0

### Actividad por día
| día | TG in | TG out | WA in | WA out | mail in | mail out | cal |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-10-18 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| 2026-10-19 | 0 | 5 | 1 | 0 | 0 | 0 | 0 |
| 2026-10-20 | 1 | 3 | 0 | 0 | 3 | 9 | 0 |
| 2026-10-21 | 0 | 2 | 0 | 0 | 0 | 4 | 0 |
| 2026-10-22 | 0 | 1 | 0 | 0 | 0 | 2 | 0 |
| 2026-10-23 | 0 | 2 | 0 | 0 | 0 | 13 | 0 |
| 2026-10-24 | 0 | 2 | 1 | 0 | 0 | 1 | 0 |
| 2026-10-25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

### Gasto por día
| día | llamadas | USD |
| --- | --- | --- |
| 2026-10-19 | 1 | 0.17 |
| 2026-10-20 | 8 | 1.64 |
| 2026-10-24 | 1 | 0.17 |

### Gasto por tipo de llamada
| tipo | n | USD |
| --- | --- | --- |
| gmail | 3 | 1.03 |
| telegram | 1 | 0.45 |
| whatsapp | 2 | 0.34 |
| moderacion | 3 | 0.09 |
| enriquecer-contacto | 1 | 0.06 |

### Quién escribió
| quién | canal | n |
| --- | --- | --- |
| Sol Tortora <stortora@luminaconsultora.com> | gmail | 3 |
| Soledad Goitia | whatsapp | 2 |
| Noelia Bruscoli | telegram | 1 |

### Acciones ejecutadas
| acción | n |
| --- | --- |
|  responder_email | 2 |
|  recordar_hecho | 2 |
|  enviar_wa | 1 |
|  crear_usuario | 1 |

### Acciones FALLIDAS
_(nada)_

### Avisos de sistema (no rutinarios)
| cuándo | qué |
| --- | --- |
| 2026-10-19 11:51:51 | wa-hook: "Claro Argentina" escribió sin número visible, no está en ninguna libreta y no hay historial — no ruteo (identidad no verificable) |
| 2026-10-20 10:50:28 | auto-accept calendar share: stortora@luminaconsultora.com → write (role=owner) |
| 2026-10-20 10:50:29 | auto-accept calendar share: stortora@luminaconsultora.com → write (role=owner) |
| 2026-10-20 10:50:29 | auto-accept calendar share: stortora@luminaconsultora.com → write (role=owner) |
| 2026-10-20 10:50:30 | auto-accept calendar share: stortora@luminaconsultora.com → write (role=owner) |
| 2026-10-20 10:54:26 | auto-accept calendar share: stortora@luminaconsultora.com → write (role=owner) |
| 2026-10-20 11:09:39 | razonamiento Gmail 1a159a0c9ffb5464 (Sol Tortora): Actualicé el hecho horario_contacto para sumar la restricción de días (lun-vie) además del rango horario ya guardado. |
| 2026-10-24 11:39:53 | wa-hook: "Claro Argentina" escribió sin número visible, no está en ninguna libreta y no hay historial — no ruteo (identidad no verificable) |
| 2026-10-25 04:14:35 | gcontacts-reconcile semanal (sofia-bruscoli): 44 ok, 0 fallidos |

### WhatsApp saliente (wa_outbox)
_(nada)_

### Follow-ups vivos
_(nada)_

### Pendientes abiertos
_(nada)_

### error.log agrupado (sin cortes de Telegram)
| n | línea |
| --- | --- |
| 3 | <html lang=en> |
| 3 | <meta charset=utf-8> |
| 3 | <meta name=viewport content="initial-scale=1, minimum-scale=1, width=device-width"> |
| 3 | <title>Error 502 (Server Error)!!1</title> |
| 3 | <style> |
| 3 | *{margin:0;padding:0}html,code{font:15px/22px arial,sans-serif}html{background:#fff;color:#N;padding:15px} |
| 3 | </style> |
| 3 | <a href=//www.google.com/><span id=logo aria-label=Google></span></a> |
| 3 | <p><b>502.</b> <ins>That’s an error.</ins> |
| 3 | <p>The server encountered a temporary error and could not complete your request.<p>Please try again in 30 se |
| 1 | [wa-validate] sin cliente WA — normalizado offline "<num>@c.us" → <num>@c.us (SIN verificar en Meta) |
| 1 | [gcontacts] sync de usuario "Sol Tortora" falló: <!DOCTYPE html> |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Ya le r |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Listo: |
| 1 | [meeting-prep] gcontacts sync "Nbruscoli" falló: <!DOCTYPE html> |

### out.log: warnings / fallos agrupados
| n | línea |
| --- | --- |
| 2 | [wa-send] wa-hook/descarte-identidad: entregado por TELEGRAM (politica_v4_usuarios_sin_wa) a Noelia Bruscoli |

### MariaBridge: warnings / errores
_(nada)_
