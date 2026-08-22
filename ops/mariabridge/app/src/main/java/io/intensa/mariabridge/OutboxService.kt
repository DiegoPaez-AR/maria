package io.intensa.mariabridge

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import java.net.URLDecoder

/**
 * Servicio foreground que pollea la cola de salientes del VPS cada POLL_MS.
 * Formato de /pendiente.txt (igual que el Tasker): "id|numeroONombre|texto".
 *
 * ESTRATEGIA DE ENVÍO (v1):
 *   1) Si hay una notificación viva de ese chat → responde por RemoteInput
 *      (silencioso, sin pantalla). Es el caso de las RESPUESTAS (mayoría).
 *   2) Si no (chat en frío) → v1 NO lo puede iniciar solo: lo deja en la cola
 *      y avisa. El envío en frío por Accesibilidad llega en v2.
 * Solo confirma al VPS cuando el envío REALMENTE se concretó (fix del
 * "entregado fantasma" del Tasker).
 */
class OutboxService : Service() {
    private val POLL_MS = 5000L
    private val POLL_LENTO_MS = 30000L
    @Volatile private var ultimoConTrabajo = System.currentTimeMillis()
    @Volatile private var run = true
    private val CH = "mariabridge_fg"

    override fun onBind(i: Intent?): IBinder? = null

    @Volatile private var loopVivo = false

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        MbLog.init(this)
        arrancarForeground()
        // singleton: "Guardar y arrancar" repetido NO debe apilar pollers
        // (v2.2 y anteriores apilaban → posible causa del triple-envío del 15/8)
        if (!loopVivo) {
            loopVivo = true
            MbLog.i("svc", "OutboxService arrancó (loop nuevo)")
            Thread { loop() }.start()
        } else {
            MbLog.i("svc", "OutboxService ya corría — no apilo otro loop")
        }
        return START_STICKY
    }

    private fun loop() {
        // auto-update: primer chequeo a los 30s de arrancar, después cada 6h
        var proximoUpd = System.currentTimeMillis() + 30000L
        while (run) {
            try { tick() } catch (_: Exception) {}
            if (System.currentTimeMillis() >= proximoUpd) {
                proximoUpd = System.currentTimeMillis() + 6 * 3600 * 1000L
                Updater.chequear(this, desdeUi = false)
            }
            // Backoff (auditoría, batería): 5s con trabajo reciente, hasta 30s
            // si la cola viene vacía. Antes: 17k requests/día siempre.
            val espera = if (System.currentTimeMillis() - ultimoConTrabajo < 5 * 60_000L) POLL_MS else POLL_LENTO_MS
            try { Thread.sleep(espera) } catch (_: Exception) {}
        }
    }

    private fun tick() {
        val base = Prefs.hookBase(this); val secret = Prefs.secret(this)
        if (base.isBlank() || secret.isBlank()) return
        Net.get("$base/$secret/pendiente.txt") { code, resp ->
            if (code != 200 || resp.isBlank()) return@get
            ultimoConTrabajo = System.currentTimeMillis()
            // Comando de control remoto (v3.6): "CTL|id|cmd|argsB64"
            if (resp.startsWith("CTL|")) {
                val pc = resp.split("|", limit = 4)
                if (pc.size >= 3) {
                    val cid = pc[1]; val cmd = pc[2]
                    val args = if (pc.size >= 4) try {
                        org.json.JSONObject(String(android.util.Base64.decode(pc[3], android.util.Base64.DEFAULT)))
                    } catch (_: Exception) { org.json.JSONObject() } else org.json.JSONObject()
                    val svc = WaSendService.instancia
                    if (svc != null) ControlOps.ejecutar(svc, base, secret, cid, cmd, args)
                    else MbLog.w("ctl", "sin accesibilidad viva — no ejecuto #$cid")
                }
                return@get
            }
            val partes = resp.split("|", limit = 5)
            if (partes.size < 3) return@get
            val id = partes[0]
            val numero = partes[1]
            val texto = try { URLDecoder.decode(partes[2], "UTF-8") } catch (_: Exception) { partes[2] }
            val nombre = if (partes.size >= 4) try { URLDecoder.decode(partes[3], "UTF-8") } catch (_: Exception) { partes[3] } else ""
            val modo = if (partes.size >= 5) partes[4].trim() else "F"
            enviar(base, secret, id, numero, nombre, texto, modo)
        }
    }

    private fun enviar(base: String, secret: String, id: String, numero: String, nombre: String, texto: String, modo: String = "F") {
        // Respuesta silenciosa por RemoteInput: primero por NOMBRE (título de la
        // notif = nombre agendado), luego por NÚMERO (chats no agendados).
        var ok = false
        if (nombre.isNotBlank()) ok = ReplyRegistry.responder(this, nombre, texto)
        if (!ok) ok = ReplyRegistry.responder(this, numero, texto)
        if (ok) {
            Net.get("$base/$secret/confirmar/$id") { _, _ -> }   // confirmar SOLO tras enviar
            log("respondido (silencioso) → ${if (nombre.isNotBlank()) nombre else numero}")
        } else if (modo == "R") {
            // WARM-UP (v3.8, número nuevo): reply-only. Sin notif viva NO se
            // abre ningún chat — el mensaje espera en la cola sin confirmar.
            MbLog.i("outbox", "warm-up: #$id a $numero necesita chat nuevo — NO abro (reply-only), espera en cola")
        } else {
            // Sin notif viva → ENVÍO EN FRÍO por accesibilidad (abre el chat con
            // intent local + tap por viewId + verifica). Un cold-send a la vez.
            val encolado = ColdSend.encolar(ColdSend.Target(id, numero, texto, nombre)) { doneId, okCold ->
                if (okCold) {
                    Net.get("$base/$secret/confirmar/$doneId") { _, _ -> }
                    log("enviado EN FRÍO (accesibilidad) → $numero")
                } else {
                    log("cold-send #$doneId no verificado — queda en cola")
                }
            }
            if (!encolado) {
                // otro cold-send en curso; reportar diag para visibilidad
                val vivos = ReplyRegistry.titulosVivos().joinToString(" ~ ")
                val diag = org.json.JSONObject().apply {
                    put("buscaba_nombre", nombre); put("buscaba_numero", numero)
                    put("chats_vivos", vivos); put("pendiente", id); put("nota", "coldsend ocupado")
                }
                Net.postJson("$base/$secret/mbdiag", diag.toString())
            }
        }
    }

    private fun arrancarForeground() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(NotificationChannel(CH, "MariaBridge", NotificationManager.IMPORTANCE_MIN))
        }
        val n = Notification.Builder(this, CH)
            .setContentTitle("MariaBridge activo")
            .setContentText("Conectando WhatsApp con Maria")
            .setSmallIcon(android.R.drawable.sym_action_email)
            .build()
        startForeground(1, n)
    }

    private fun log(s: String) { MbLog.i("outbox", s) }
    override fun onDestroy() { run = false; super.onDestroy() }
}
