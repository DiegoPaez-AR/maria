# Revisión semanal 2026-W37

_Últimos 7 días (desde 2026-09-02) · generada 9/9/2026, 10:48:19_

**Resumen**: Maria Paez US$7.62 / 43 llamadas, 6 fallidas, MB v4.8 · Sofia Bruscoli US$12.69 / 94 llamadas, 2 fallidas, MB v4.8

**VPS**: disco 48% usado (19G libres) · RAM 1013/3819 MB · logs: 41M · pm2: maria-paez: online, 0 restarts, up 0h · sofia-bruscoli: online, 0 restarts, up 0h · intensa-api: online, 0 restarts, up 0h · pm2-logrotate: online, 6 restarts, up 0h

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
04/09 12:44 3 fixes del primer día de Noelia: crear_evento anti-duplicado (10 min), negativa WA a usuarios 1×/h, wa-outbox descarta mensajes viejos ya respondidos
04/09 12:33 presentacion.js: alta automática de terceros que se presentan para un usuario (WA + mail) → libreta + Contacts; unknown-flow firma con el nombre de la instancia
04/09 09:55 MariaBridge v4.6: el barrido arrancaba nunca si no había notifs vivas (marca=0 eterna)
03/09 18:49 usuarios → Google Contacts: cablear sincronizarUsuario (arranque + crear/actualizar_usuario)
03/09 18:41 ops: healthcheck avisa al operador (no al owner del cliente) + healthcheck.sh carga secrets.conf
03/09 12:19 provision: template sin restos de wwebjs; checklist apunta a auth-gmail.js url/exchange (oauth-setup.js no existe)
03/09 12:11 Alertas en dos clases (decision Diego 3/9): PLATAFORMA (telegram_polling, gmail_poll, snapshot_recent, healthcheck sin JSON) avisa solo si lleva 60 min fallando de corrido, con causa acumulada, y otro aviso al recuperar; PROPIAS (pm2, DB, OAuth, vault, acceso_google, loops de negocio) avisan ya como siempre. loop-guard pasa de contar fallos a medir duracion para plataforma
03/09 09:14 cron-master: si git fetch falla (rate limit / incidente de GitHub, 3/9 04:30 x17min) el tick NO aborta — sigue sin deploy, con snapshots e inbox. Abortar disparaba falsas alarmas snapshot_recent que parecian Maria caida. + hint del healthcheck aclarado
02/09 18:06 upsert_contacto: auto-merge de fichas STUB (nombre = local-part del email, sin telefono, creadas por meeting-prep/invitaciones). Casos Pluna, Nbruscoli, Lperoni: el guard anti-duplicados las trataba como homonimos y bloqueaba guardar el email en la ficha real — el modelo decia 'guardado' sin haber guardado
02/09 18:04 Caso Noelia/Luciano 2/9 (aprobado Diego): (1) guard en crear_evento — evento con cero invitados devuelve sin_invitados:true + nota que ordena consultar al usuario, pedir el mail por WhatsApp o mandar el Meet por WA, y nunca reportar 'agendada con Meet' sin invitados; (2) regla de prompt para cierres con terceros contactados solo por WhatsApp
```

---

## Maria Paez (maria-paez)

**Usuarios**: 16 activos (15 atendidos, 10 pausados, 1 con Telegram) · **contactos nuevos**: 9 · **MariaBridge**: v4.8

**Gasto**: US$7.62 en 43 llamadas (US$0.18 por llamada) · modo prosa: 16 · cortes Telegram: 68 · acciones fallidas: 6

### Actividad por día
| día | TG in | TG out | WA in | WA out | mail in | mail out | cal |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-02 | 2 | 6 | 0 | 0 | 0 | 3 | 0 |
| 2026-09-03 | 3 | 11 | 0 | 0 | 0 | 12 | 0 |
| 2026-09-04 | 3 | 8 | 0 | 0 | 0 | 13 | 0 |
| 2026-09-05 | 2 | 3 | 0 | 1 | 0 | 4 | 0 |
| 2026-09-06 | 1 | 3 | 0 | 0 | 0 | 8 | 0 |
| 2026-09-07 | 1 | 7 | 7 | 4 | 0 | 9 | 1 |
| 2026-09-08 | 0 | 5 | 0 | 1 | 0 | 13 | 0 |
| 2026-09-09 | 1 | 6 | 2 | 3 | 0 | 8 | 0 |

### Gasto por día
| día | llamadas | USD |
| --- | --- | --- |
| 2026-09-02 | 7 | 1.55 |
| 2026-09-03 | 3 | 0.64 |
| 2026-09-04 | 4 | 0.64 |
| 2026-09-05 | 3 | 0.54 |
| 2026-09-06 | 1 | 0.31 |
| 2026-09-07 | 14 | 2.4 |
| 2026-09-08 | 2 | 0.22 |
| 2026-09-09 | 9 | 1.32 |

### Gasto por tipo de llamada
| tipo | n | USD |
| --- | --- | --- |
| telegram | 13 | 3.6 |
| whatsapp | 8 | 1.96 |
| enriquecer-contacto | 9 | 1.53 |
| memoria-curada | 3 | 0.24 |
| moderacion | 7 | 0.17 |
| tg-prepass | 1 | 0.07 |
| mb-verif | 2 | 0.05 |

### Quién escribió
| quién | canal | n |
| --- | --- | --- |
| Diego | telegram | 13 |
| Walby Cibils | whatsapp | 6 |
| Lavadero Shine | whatsapp | 2 |
| Diego | whatsapp | 1 |

### Acciones ejecutadas
| acción | n |
| --- | --- |
|  quitar_pendiente | 5 |
|  agregar_pendiente | 4 |
|  enviar_wa | 3 |
|  upsert_contacto | 2 |
|  set_cumple_contacto | 2 |
|  buscar_slots_comunes | 2 |
|  avisar_owner | 2 |
|  crear_evento | 1 |

### Acciones FALLIDAS
| cuándo | qué |
| --- | --- |
| 2026-09-02 14:37:24 | acción FALLÓ: upsert_contacto — upsert_contacto: posible DUPLICADO de un contacto existente: "Nbruscoli" (nbruscoli@froneus.com) — mismo email. NO lo creé. Preg |
| 2026-09-02 14:37:25 | acción FALLÓ: upsert_contacto — upsert_contacto: posible DUPLICADO de un contacto existente: "Lperoni" (lperoni@froneus.com) — mismo email. NO lo creé. Pregunta |
| 2026-09-02 14:37:35 | acción FALLÓ: upsert_contacto — upsert_contacto: posible DUPLICADO de un contacto existente: "Luciano Peroni" (5491159524645@c.us) — mismo telefono. NO lo creé. |
| 2026-09-02 14:37:35 | acción FALLÓ: upsert_contacto — upsert_contacto: posible DUPLICADO de un contacto existente: "Noelia Bruscoli" (5491155947242@c.us) — mismo telefono. NO lo creé |
| 2026-09-02 14:37:42 | acción FALLÓ: upsert_contacto — upsert_contacto: posible DUPLICADO de un contacto existente: "Lperoni" (lperoni@froneus.com) — mismo email. NO lo creé. Pregunta |
| 2026-09-02 14:37:42 | acción FALLÓ: upsert_contacto — upsert_contacto: posible DUPLICADO de un contacto existente: "Nbruscoli" (nbruscoli@froneus.com) — mismo email. NO lo creé. Preg |

### Avisos de sistema (no rutinarios)
| cuándo | qué |
| --- | --- |
| 2026-09-02 18:07:22 | Fichas unificadas: Noelia Bruscoli y Luciano Peroni ahora tienen WA + email (los stubs Nbruscoli/Lperoni absorbidos). Los upsert del 2/9 habian fallado por el guard anti- |
| 2026-09-06 04:08:58 | gcontacts-reconcile semanal: 380 ok, 20 fallidos |
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

### WhatsApp saliente (wa_outbox)
| estado | n |
| --- | --- |
| entregado | 5 |

### Follow-ups vivos
_(nada)_

### Pendientes abiertos
| id | dueño | qué |
| --- | --- | --- |
| 319 | usuario | Decirle a Maria qué vehículo tiene (marca/modelo) para responderle al Lavadero Shine que p |
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
| 4 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Listo, |
| 2 | [executor] acción #N (upsert_contacto) falló: upsert_contacto: posible DUPLICADO de un contacto existente: "Nb |
| 2 | [executor] acción #N (upsert_contacto) falló: upsert_contacto: posible DUPLICADO de un contacto existente: "Lp |
| 2 | [wa-validate] sin cliente WA — normalizado offline "<num>@c.us" → <num>@c.us (SIN verificar en Meta) |
| 2 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Guardé |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Corregi |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Listo: |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Reviso: |
| 1 | 1. "Reuni" |
| 1 | [executor] acción #N (upsert_contacto) falló: upsert_contacto: posible DUPLICADO de un contacto existente: "No |
| 1 | [executor] acción #N (upsert_contacto) falló: upsert_contacto: posible DUPLICADO de un contacto existente: "Lu |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "No, no |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Diego T |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Che, el |
| 1 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Dale, p |

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
| 2 | [MB v4.5]  W [upd] Cancel está centrado (361 vs 359) — sin espejo confiable, no toco |
| 2 | [MB v4.8]  W [frio] #N: sin veredicto por accesibilidad (inconcluso) — mando foto al VPS |
| 1 | [MB v4.7]  W [upd] Cancel está centrado (361 vs 359) — sin espejo confiable, no toco |


---

## Sofia Bruscoli (sofia-bruscoli)

**Usuarios**: 1 activos (1 atendidos, 0 pausados, 1 con Telegram) · **contactos nuevos**: 9 · **MariaBridge**: v4.8

**Gasto**: US$12.69 en 94 llamadas (US$0.13 por llamada) · modo prosa: 21 · cortes Telegram: 42 · acciones fallidas: 2

### Actividad por día
| día | TG in | TG out | WA in | WA out | mail in | mail out | cal |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-03 | 0 | 0 | 0 | 1 | 0 | 1 | 0 |
| 2026-09-04 | 12 | 17 | 10 | 15 | 1 | 1 | 8 |
| 2026-09-05 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| 2026-09-06 | 5 | 10 | 3 | 6 | 0 | 0 | 3 |
| 2026-09-07 | 15 | 17 | 3 | 5 | 4 | 1 | 4 |
| 2026-09-08 | 1 | 5 | 2 | 2 | 1 | 0 | 0 |
| 2026-09-09 | 0 | 2 | 0 | 0 | 0 | 0 | 0 |

### Gasto por día
| día | llamadas | USD |
| --- | --- | --- |
| 2026-09-04 | 38 | 5.38 |
| 2026-09-05 | 3 | 0.17 |
| 2026-09-06 | 16 | 2.41 |
| 2026-09-07 | 30 | 3.3 |
| 2026-09-08 | 6 | 1.28 |
| 2026-09-09 | 1 | 0.15 |

### Gasto por tipo de llamada
| tipo | n | USD |
| --- | --- | --- |
| whatsapp | 13 | 4.6 |
| telegram | 33 | 4.18 |
| enriquecer-contacto | 9 | 1.44 |
| gmail | 6 | 1.3 |
| memoria-curada | 8 | 0.59 |
| moderacion | 24 | 0.51 |
| tg-prepass | 1 | 0.06 |

### Quién escribió
| quién | canal | n |
| --- | --- | --- |
| Noelia Bruscoli | telegram | 33 |
| Noelia Bruscoli | whatsapp | 5 |
| Saka | whatsapp | 5 |
| Noelia Bruscoli <nbruscoli@luminaconsultora.com> | gmail | 4 |
| Fernando Boero | whatsapp | 2 |
| Gaston Girotti | whatsapp | 2 |
| Deborah Alescano | whatsapp | 1 |
| Juan Manuel Ward | whatsapp | 1 |
| Luciano Peroni | whatsapp | 1 |
| Luciano Peroni <lperoni@froneus.com> | gmail | 1 |
| Sol Tortora | whatsapp | 1 |
| Zaca F <zacariazfroia@gmail.com> | gmail | 1 |

### Acciones ejecutadas
| acción | n |
| --- | --- |
|  upsert_contacto | 15 |
|  quitar_pendiente | 13 |
|  enviar_wa | 12 |
|  crear_evento | 8 |
|  modificar_evento | 5 |
|  agregar_pendiente | 4 |
|  buscar_contacto_global | 3 |
|  enviar_email | 1 |
|  cerrar_follow_up | 1 |
|  borrar_evento | 1 |

### Acciones FALLIDAS
| cuándo | qué |
| --- | --- |
| 2026-09-04 12:20:56 | acción FALLÓ: quitar_pendiente — quitar_pendiente: no encontré el pendiente (6) |
| 2026-09-06 19:57:26 | acción FALLÓ: upsert_contacto — upsert_contacto: posible DUPLICADO de un contacto existente: "Saka" (5492215968555@c.us, zacariazfroia@gmail.com) — mismo email  |

### Avisos de sistema (no rutinarios)
| cuándo | qué |
| --- | --- |
| 2026-09-03 17:44:03 | calendar_acceso autodetectado: write → none |
| 2026-09-04 12:03:45 | telegram vinculado por teléfono compartido (chat 6927380975) |
| 2026-09-07 09:35:33 | Claude falló procesando email 1a07bdd7ca20d5ec (Noelia Bruscoli): extraerJSON: texto vacío |
| 2026-09-07 16:02:58 | wa-outbox: entrega FALLIDA definitiva #11 a 5491156408326 (verificacion_inconclusa) — aviso al owner |
| 2026-09-07 16:19:27 | wa-outbox: entrega FALLIDA definitiva #13 a 5491156408326 (verificacion_inconclusa) — aviso al owner |
| 2026-09-09 09:56:03 | upsert_contacto: ficha "Saka" (#12) renombrada a "Zaca" (corrección manual del operador) |
| 2026-09-09 10:13:15 | gcontacts-reconcile semanal (sofia-bruscoli): 10 ok, 0 fallidos |

### WhatsApp saliente (wa_outbox)
| estado | n |
| --- | --- |
| entregado | 13 |
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
| 13 | [wa-validate] sin cliente WA — normalizado offline "<num>@c.us" → <num>@c.us (SIN verificar en Meta) |
| 6 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "Listo, |
| 4 | [claude-client] respuesta en PROSA (sin JSON) — la uso como `respuesta` en vez de descartar el turno: "No teng |
| 1 | [executor] acción #N (quitar_pendiente) falló: quitar_pendiente: no encontré el pendiente (6) |
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

### out.log: warnings / fallos agrupados
_(nada)_

### MariaBridge: warnings / errores
| n | línea |
| --- | --- |
| 11 | [MB v4.7]  W [frio] #N: sin veredicto por accesibilidad (inconcluso) — mando foto al VPS |
| 11 | [MB v4.7]  W [frio] #N takeScreenshot: Services don't have the capability of taking the screenshot. |
| 11 | [MB v4.7]  W [frio] verificación #N: NO confirmo (inconcluso, sin foto) |
| 1 | [MB v4.6]  W [media] audio subido pero sin respuesta a tiempo — NO mando hint |
