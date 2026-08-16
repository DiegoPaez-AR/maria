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
    private var run = true
    private val CH = "mariabridge_fg"

    override fun onBind(i: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        arrancarForeground()
        Thread { loop() }.start()
        return START_STICKY
    }

    private fun loop() {
        while (run) {
            try { tick() } catch (_: Exception) {}
            try { Thread.sleep(POLL_MS) } catch (_: Exception) {}
        }
    }

    private fun tick() {
        val base = Prefs.hookBase(this); val secret = Prefs.secret(this)
        if (base.isBlank() || secret.isBlank()) return
        Net.get("$base/$secret/pendiente.txt") { code, resp ->
            if (code != 200 || resp.isBlank()) return@get
            val partes = resp.split("|", limit = 3)
            if (partes.size < 3) return@get
            val id = partes[0]
            val destino = partes[1]
            val texto = try { URLDecoder.decode(partes[2], "UTF-8") } catch (_: Exception) { partes[2] }
            enviar(base, secret, id, destino, texto)
        }
    }

    private fun enviar(base: String, secret: String, id: String, destino: String, texto: String) {
        // 1) intento silencioso por RemoteInput (chat con notif viva).
        //    destino puede venir como nombre o número — el registry matchea por nombre;
        //    para número puro, v1 depende de que haya notif de ese chat.
        val ok = ReplyRegistry.responder(this, destino, texto)
        if (ok) {
            // confirmar SOLO tras el envío real
            Net.get("$base/$secret/confirmar/$id") { _, _ -> }
            log("respondido (silencioso) → $destino")
        } else {
            // 2) chat en frío: v1 no puede; NO confirmamos (queda en cola para v2/manual).
            log("sin notif viva de \"$destino\" — pendiente #$id espera (envío en frío = v2)")
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

    private fun log(s: String) { android.util.Log.i("MariaBridge", s) }
    override fun onDestroy() { run = false; super.onDestroy() }
}
