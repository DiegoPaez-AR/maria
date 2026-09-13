# Revisión semanal 2026-W37

_Últimos 7 días (desde 2026-09-06) · generada 13/9/2026, 05:00:01_

**Resumen**: Maria Paez US$7.79 / 49 llamadas, 0 fallidas, MB v4.8 · Sofia Bruscoli US$8.35 / 61 llamadas, 1 fallidas, MB v4.8

**VPS**: disco 48% usado (19G libres) · RAM 1160/3819 MB · logs: 41M · pm2: maria-paez: online, 0 restarts, up 90h · sofia-bruscoli: online, 0 restarts, up 90h · intensa-api: online, 0 restarts, up 90h · pm2-logrotate: online, 6 restarts, up 90h

### Cambios deployados en la semana

```
09/09 10:46 logs unificados en /root/secretaria/logs (pm2 + ops) + pm2-logrotate + weekly-review.js (digest semanal por instancia, mail domingos 05:00)
09/09 10:14 gcontacts-reconcile: reintento con espera ante cuota de People API
09/09 09:47 meeting-prep: fichas nuevas también van a Google Contacts
09/09 09:44 gcontacts-reconcile: todas las instancias (Sofia nunca se reconciliaba)
09/09 09:40 upsert_contacto: rename solo con teléfono+email iguales (test 4 exige preguntar con una sola clave) + test del rename
09/09 09:31 review 4-9/9: aceptaciones de invitación sin LLM; rename legítimo en upsert_contacto; follow-ups 'disparado' expiran a los 14 días; reconcile loguea motivos
07/09 16:58 MariaBridge v4.8: canTakeScreenshot (la foto nunca salía), motivo del inconcluso en log, probable (entry vacío) = enviado si la foto no desmiente
07/09 16:56 wa-outbox: inconcluso = entregado sin verificar, no re-servir (duplicaba #263); inbox cortar 263
07/09 12:12 mb-verif: comentario disparaba el detector de huérfanos
07/09 12:10 MariaBridge v4.7: verificación positiva del cold-send + veredicto por foto (mbverif); trabado = 1 reintento (caso Walby 5/9)
```

---

## Maria Paez (maria-paez)

**Usuarios**: 16 activos (15 atendidos, 10 pausados, 1 con Telegram) · **contactos nuevos**: 9 · **MariaBridge**: v4.8

**Gasto**: US$7.79 en 49 llamadas (US$0.16 por llamada) · modo prosa: 12 · cortes Telegram: 57 · acciones fallidas: 0

### Actividad por día
| día | TG in | TG out | WA in | WA out | mail in | mail out | cal |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-06 | 1 | 2 | 0 | 0 | 0 | 8 | 0 |
| 2026-09-07 | 1 | 7 | 7 | 4 | 0 | 9 | 1 |
| 2026-09-08 | 0 | 5 | 0 | 1 | 0 | 13 | 0 |
| 2026-09-09 | 8 | 17 | 4 | 8 | 0 | 13 | 0 |
| 2026-09-10 | 0 | 3 | 0 | 0 | 0 | 10 | 0 |
| 2026-09-11 | 0 | 2 | 0 | 0 | 0 | 13 | 0 |
| 2026-09-12 | 3 | 4 | 0 | 0 | 0 | 5 | 0 |
| 2026-09-13 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |

### Gasto por día
| día | llamadas | USD |
| --- | --- | --- |
| 2026-09-06 | 1 | 0.31 |
| 2026-09-07 | 14 | 2.4 |
| 2026-09-08 | 2 | 0.22 |
| 2026-09-09 | 24 | 3.56 |
| 2026-09-10 | 1 | 0.12 |
| 2026-09-11 | 1 | 0.28 |
| 2026-09-12 | 6 | 0.9 |

### Gasto por tipo de llamada
| tipo | n | USD |
| --- | --- | --- |
| telegram | 13 | 3.11 |
| whatsapp | 10 | 2.76 |
| enriquecer-contacto | 7 | 1.22 |
| memoria-curada | 4 | 0.35 |
| moderacion | 13 | 0.29 |
| mb-verif | 2 | 0.05 |

### Quién escribió
| quién | canal | n |
| --- | --- | --- |
| Diego | telegram | 13 |
| Walby Cibils | whatsapp | 6 |
| Lavadero Shine | whatsapp | 4 |
| Diego | whatsapp | 1 |

### Acciones ejecutadas
| acción | n |
| --- | --- |
|  quitar_pendiente | 8 |
|  enviar_wa | 6 |
|  agregar_pendiente | 5 |
|  upsert_contacto | 3 |
|  avisar_owner | 2 |
|  enviar_email | 1 |
|  crear_evento | 1 |

### Acciones FALLIDAS
_(nada)_

### Avisos de sistema (no rutinarios)
| cuándo | qué |
| --- | --- |
| 2026-09-08 09:26:52 | mb-verif: cold-send #264 a Diego / 5491132317896 — veredicto por foto: enviado (Burbuja con tilde a las 9:26 AM, cuadro vacío) |
| 2026-09-09 08:33:03 | mb-verif: cold-send #265 a Lavadero Shine / 5491139499903 — veredicto por foto: enviado (Burbuja derecha con ✓ a las 8:32 AM, cuadro vacío) |
| 2026-09-09 09:35:05 | follow-up #46 expirado: llevaba 14+ días en 'disparado' sin resolución (Esperando que Gabriel Pacheco confirme la cena del 2/9 en Catalino (con Carolina) |
| 2026-09-09 09:35:05 | follow-up #45 expirado: llevaba 14+ días en 'disparado' sin resolución (Esperando que Manuel Carrasco confirme lunes 24/08 15-18hs para la reunión de 3h) |
| 2026-09-09 09:35:05 | follow-up #44 expirado: llevaba 14+ días en 'disparado' sin resolución (Carolina Brunatti confirme día para cena FICO con Diego y Gabriel) |
| 2026-09-09 09:35:05 | follow-up #42 expirado: llevaba 14+ días en 'disparado' sin resolución (Esperando que Manuel Carrasco confirme lunes 24/08 15-18hs para la reunión con D) |
| 2026-09-09 09:35:05 | follow-up #41 expirado: llevaba 14+ días en 'disparado' sin resolución (Esperando que Natali confirme si puede ir al cine hoy (16/08). Avisar a Diego cu) |
| 2026-09-09 09:35:05 | follow-up #39 expirado: llevaba 14+ días en 'disparado' sin resolución (Esperando que Manuel Carrasco confirme lunes 24/08 15-18hs para la reunión con D) |
| 2026-09-09 09:35:05 | follow-up #37 expirado: llevaba 14+ días en 'disparado' sin resolución (Coordinar reunión 3hs entre Diego, Manuel Carrasco y Hernán Fulco — Manuel no pu) |
| 2026-09-09 09:35:05 | follow-up #35 expirado: llevaba 14+ días en 'disparado' sin resolución (Coordinar reunión de 3hs entre Diego, Manuel Carrasco y Hernán Fulco — esperando) |
| 2026-09-09 09:35:05 | follow-up #33 expirado: llevaba 14+ días en 'disparado' sin resolución (Esperar que Caterina (Paraná Muebles Logística) confirme la fecha correcta de en) |
| 2026-09-09 09:35:05 | follow-up #32 expirado: llevaba 14+ días en 'disparado' sin resolución (Esperar que Paraná Muebles Logística (Caterina) explique cómo piensan corregir l) |
| 2026-09-09 09:35:05 | follow-up #30 expirado: llevaba 14+ días en 'disparado' sin resolución (Esperar que Ana Clara Zamora confirme la reunión del lunes 06/07 9-12hs (se le e) |
| 2026-09-09 09:35:05 | follow-up #24 expirado: llevaba 14+ días en 'disparado' sin resolución (Confirmarle a Gabi la respuesta de Ana Clara Zamora sobre la reunión (semana del) |
| 2026-09-09 09:35:05 | follow-up #23 expirado: llevaba 14+ días en 'disparado' sin resolución (Rodrigo (Dodi) confirme disponibilidad para cita con Gabriela Echaniz este fin d) |
| 2026-09-09 09:35:05 | follow-up #21 expirado: llevaba 14+ días en 'disparado' sin resolución (Cuando Gabi confirme la cancelación del turno de dermatología del 03/07 a las 18) |
| 2026-09-09 09:35:05 | follow-up #20 expirado: llevaba 14+ días en 'disparado' sin resolución (Coordinar reunión entre Gabi y Ana Clara (y posiblemente Diego) para la semana d) |
| 2026-09-09 09:35:05 | follow-up #19 expirado: llevaba 14+ días en 'disparado' sin resolución (Coordinar reunión entre Gabi y Ana Clara (y posiblemente Diego) para la semana d) |
| 2026-09-09 09:35:05 | follow-up #17 expirado: llevaba 14+ días en 'disparado' sin resolución (Cuando James confirme un día disponible, avisarle a Diego y crear el evento del ) |
| 2026-09-09 09:35:05 | follow-up #7 expirado: llevaba 14+ días en 'disparado' sin resolución (Cuando Leandro Groisman confirme su email y el lugar de encuentro: agregarle com) |
| 2026-09-09 09:35:05 | follow-up #6 expirado: llevaba 14+ días en 'disparado' sin resolución (Cuando Leandro confirme su email y el lugar, crear evento 'Reunión Diego / Leand) |
| 2026-09-09 10:13:01 | gcontacts-reconcile semanal (maria-paez): 403 ok, 3 fallidos — usuario "Nicolas Kosinski": <!DOCTYPE html> <html lang=en>   <meta charset=utf-8>   <meta name=viewport con |
| 2026-09-10 18:48:03 | calendar_acceso autodetectado: write → none |
| 2026-09-12 10:30:16 | wa-outbox: entrega FALLIDA definitiva #269 a 34910889440 (numero_sin_whatsapp) — aviso al owner |
| 2026-09-13 04:11:05 | gcontacts-reconcile semanal (maria-paez): 409 ok, 0 fallidos |

### WhatsApp saliente (wa_outbox)
| estado | n |
| --- | --- |
| entregado | 7 |
| vencido | 2 |

No entregados:
| id | cuándo | número | estado | intentos | texto |
| --- | --- | --- | --- | --- | --- |
| 269 | 2026-09-12 10:29:03 | 34910889440 | vencido | 1 | Hola! Soy María, asistente de Diego Paez. Quería consultar si tienen l |
| 270 | 2026-09-12 10:30:16 | 541132317896 | vencido | 2 | ⚠️ No pude entregar un WhatsApp a 34910889440: el número NO está en Wh |

### Follow-ups vivos
_(nada)_

### Pendientes abiertos
| id | dueño | qué |
| --- | --- | --- |
| 322 | maria | Esperando respuesta de 34910889440@c.us (WA): "Hola! Soy María, asistente de Diego Paez. Q |
| 308 | usuario | Llamar a Tono por droguería |
| 269 | usuario | choque y Julián |
| 266 | usuario | Pasajes a Japón (fechas: 1, 14, 17 de abril) |
| 239 | maria | Esperar que Caterina (Paraná Muebles Logística) confirme la fecha correcta de entrega de l |
| 237 | maria | confirmarle a Doris la reserva en Coronado (MALBA) para 2 personas el martes 28/07 13:30,  |
| 236 | usuario | Agregar al calendar las fechas posibles de colación y de revistas de arte, cuando estén |
| 235 | usuario | Pedir los certificados de Ley Micaela |
| 234 | usuario | Agregar la visita a Art Haus |
| 233 | usuario | Chequear la perfo de Tosorarti con Eva |
| 232 | usuario | Llamar a Todorati por su mesa en las jornadas y por si alguien quiere sumarse con material |
| 231 | usuario | Diplomaturas de Diego en 3 partes |

### error.log agrupado (sin cortes de Telegram)
| n | línea |
| --- | --- |
| 2 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Listo, |
| 2 | [wa-validate] sin cliente WA — normalizado offline "<num>@c.us" → <num>@c.us (SIN verificar en Meta) |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "No, tod |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Guardé |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Le mand |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Dale, l |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "No teng |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Esto es |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Tus pen |
| 1 | 1. iProt Seguridad |
| 1 | 2. DDJJ 2025 |
| 1 | 3. Llamar a Poggetti |
| 1 | 4. Pasajes" |
| 1 | [morning-brief/Diego] clima fallo: HTTP 503 |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Encontr |

### out.log: warnings / fallos agrupados
| n | línea |
| --- | --- |
| 19 | [follow-ups] #N expirado (14+ días disparado sin resolución) |
| 1 | [meeting-prep/Hernan Fulco] + id=1635 Presentacion de empresas del Grupo y servicios asociados @ 2026-09-08T.0 |

### MariaBridge: warnings / errores
| n | línea |
| --- | --- |
| 4 | [MB v4.7]  W [frio] #N: sin veredicto por accesibilidad (inconcluso) — mando foto al VPS |
| 4 | [MB v4.7]  W [frio] #N takeScreenshot: Services don't have the capability of taking the screenshot. |
| 4 | [MB v4.7]  W [frio] verificación #N: NO confirmo (inconcluso, sin foto) |
| 2 | [MB v4.8]  W [frio] #N: sin veredicto por accesibilidad (inconcluso) — mando foto al VPS |
| 2 | [MB v4.8]  W [frio] #N: número <num> NO está en WhatsApp — reporto y abandono |
| 1 | [MB v4.7]  W [upd] Cancel está centrado (361 vs 359) — sin espejo confiable, no toco |
| 1 | [MB v4.8]  W [frio] pantalla al timeout: [:Google Account,,:Automatic backu,:End-to-end encr,:DONE,:NOT NOW] |
| 1 | [MB v4.8]  W [frio] timeout #N — no encontré el botón send |


---

## Sofia Bruscoli (sofia-bruscoli)

**Usuarios**: 1 activos (1 atendidos, 0 pausados, 1 con Telegram) · **contactos nuevos**: 11 · **MariaBridge**: v4.8

**Gasto**: US$8.35 en 61 llamadas (US$0.14 por llamada) · modo prosa: 21 · cortes Telegram: 53 · acciones fallidas: 1

### Actividad por día
| día | TG in | TG out | WA in | WA out | mail in | mail out | cal |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-06 | 5 | 10 | 3 | 6 | 0 | 0 | 3 |
| 2026-09-07 | 15 | 17 | 3 | 5 | 4 | 1 | 4 |
| 2026-09-08 | 1 | 5 | 2 | 2 | 1 | 0 | 0 |
| 2026-09-09 | 0 | 2 | 0 | 0 | 0 | 0 | 0 |
| 2026-09-10 | 0 | 2 | 0 | 0 | 0 | 0 | 0 |
| 2026-09-11 | 0 | 5 | 0 | 0 | 0 | 0 | 0 |
| 2026-09-12 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| 2026-09-13 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

### Gasto por día
| día | llamadas | USD |
| --- | --- | --- |
| 2026-09-06 | 16 | 2.41 |
| 2026-09-07 | 30 | 3.3 |
| 2026-09-08 | 6 | 1.28 |
| 2026-09-09 | 1 | 0.15 |
| 2026-09-10 | 1 | 0.18 |
| 2026-09-11 | 7 | 1.03 |

### Gasto por tipo de llamada
| tipo | n | USD |
| --- | --- | --- |
| telegram | 21 | 2.54 |
| whatsapp | 7 | 2.44 |
| enriquecer-contacto | 12 | 1.87 |
| gmail | 5 | 0.92 |
| memoria-curada | 3 | 0.31 |
| moderacion | 13 | 0.27 |

### Quién escribió
| quién | canal | n |
| --- | --- | --- |
| Noelia Bruscoli | telegram | 21 |
| Saka | whatsapp | 5 |
| Noelia Bruscoli <nbruscoli@luminaconsultora.com> | gmail | 4 |
| Gaston Girotti | whatsapp | 2 |
| Noelia Bruscoli | whatsapp | 1 |
| Zaca F <zacariazfroia@gmail.com> | gmail | 1 |

### Acciones ejecutadas
| acción | n |
| --- | --- |
|  enviar_wa | 6 |
|  upsert_contacto | 5 |
|  quitar_pendiente | 4 |
|  crear_evento | 4 |
|  modificar_evento | 2 |
|  enviar_email | 1 |
|  borrar_evento | 1 |

### Acciones FALLIDAS
| cuándo | qué |
| --- | --- |
| 2026-09-06 19:57:26 | acción FALLÓ: upsert_contacto — upsert_contacto: posible DUPLICADO de un contacto existente: "Saka" (5492215968555@c.us, zacariazfroia@gmail.com) — mismo email  |

### Avisos de sistema (no rutinarios)
| cuándo | qué |
| --- | --- |
| 2026-09-07 09:35:33 | Claude falló procesando email 1a07bdd7ca20d5ec (Noelia Bruscoli): extraerJSON: texto vacío |
| 2026-09-07 16:02:58 | wa-outbox: entrega FALLIDA definitiva #11 a 5491156408326 (verificacion_inconclusa) — aviso al owner |
| 2026-09-07 16:19:27 | wa-outbox: entrega FALLIDA definitiva #13 a 5491156408326 (verificacion_inconclusa) — aviso al owner |
| 2026-09-09 09:56:03 | upsert_contacto: ficha "Saka" (#12) renombrada a "Zaca" (corrección manual del operador) |
| 2026-09-09 10:13:15 | gcontacts-reconcile semanal (sofia-bruscoli): 10 ok, 0 fallidos |
| 2026-09-13 04:11:36 | gcontacts-reconcile semanal (sofia-bruscoli): 18 ok, 0 fallidos |

### WhatsApp saliente (wa_outbox)
| estado | n |
| --- | --- |
| entregado | 6 |
| vencido | 2 |

No entregados:
| id | cuándo | número | estado | intentos | texto |
| --- | --- | --- | --- | --- | --- |
| 11 | 2026-09-07 15:53:56 | 5491156408326 | vencido | 5 | Hola Gastón! Soy Sofía, asistente de Noelia. Te escribo para avisarte  |
| 13 | 2026-09-07 16:09:12 | 5491156408326 | vencido | 5 | Hola Gastón! Soy Sofía, asistente de Noelia. Te escribo para avisarte  |

### Follow-ups vivos
_(nada)_

### Pendientes abiertos
_(nada)_

### error.log agrupado (sin cortes de Telegram)
| n | línea |
| --- | --- |
| 6 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Listo, |
| 4 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "No teng |
| 4 | [wa-validate] sin cliente WA — normalizado offline "<num>@c.us" → <num>@c.us (SIN verificar en Meta) |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Dale, y |
| 1 | [executor] acción #N (upsert_contacto) falló: upsert_contacto: posible DUPLICADO de un contacto existente: "Sa |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Dale, e |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Anotado |
| 1 | [morning-brief/Noelia Bruscoli] clima fallo: HTTP 503 |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Dale 👍 |
| 1 | [GMAIL/Noelia Bruscoli] Claude falló en 1a07bdd7ca20d5ec: extraerJSON: texto vacío |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: ""Este t |
| 1 | 📅 Turno Otorrinolaringología - Lola Girotti (Dra. Carlinni) |
| 1 | " |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Reinten |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Cerré e |

### out.log: warnings / fallos agrupados
_(nada)_

### MariaBridge: warnings / errores
| n | línea |
| --- | --- |
| 11 | [MB v4.7]  W [frio] #N: sin veredicto por accesibilidad (inconcluso) — mando foto al VPS |
| 11 | [MB v4.7]  W [frio] #N takeScreenshot: Services don't have the capability of taking the screenshot. |
| 11 | [MB v4.7]  W [frio] verificación #N: NO confirmo (inconcluso, sin foto) |
| 1 | [MB v4.6]  W [media] audio subido pero sin respuesta a tiempo — NO mando hint |
