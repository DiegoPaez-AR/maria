package io.intensa.mariabridge

import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.app.RemoteInput

/**
 * Guarda, por chat de WhatsApp, la última acción "Responder" viva (su
 * PendingIntent + el RemoteInput). Con eso podemos contestar EN SEGUNDO PLANO,
 * sin abrir WhatsApp ni tocar la pantalla (RemoteInput sobre la notificación).
 * Solo funciona mientras la notificación del chat siga activa — para chats sin
 * notificación viva (iniciar en frío) se usa el fallback de Accesibilidad (v2).
 */
object ReplyRegistry {
    data class Accion(val pending: PendingIntent, val remoteInput: RemoteInput, val actionIntent: Intent?)

    // ConcurrentHashMap (auditoría 22/8 #6): se escribe desde el hilo del
    // NotificationListener y se lee/itera desde el pool de red →
    // ConcurrentModificationException intermitente que devolvía false y
    // disparaba un cold-send innecesario (= apertura de chat = riesgo Meta).
    private val porChat = java.util.concurrent.ConcurrentHashMap<String, Accion>()
    private val vistoEn = java.util.concurrent.ConcurrentHashMap<String, Long>()
    private const val TTL_CHAT_MS = 6 * 3600_000L

    /** @return true si la notif tenía acción de Responder (= es un CHAT real). */
    fun registrarDesde(sbnKey: String, titulo: String, n: Notification): Boolean {
        // BUG 17/8 (título vacío por "Sensitive notification content hidden"):
        // la clave "" matcheaba con TODO en el contains → 7 invitaciones de la
        // campaña salieron por el chat equivocado. Títulos vacíos JAMÁS entran.
        if (normalizar(titulo).isBlank()) return false
        val actions = n.actions ?: return false
        for (a in actions) {
            val ris = a.remoteInputs ?: continue
            for (ri in ris) {
                if (ri.resultKey != null) {
                    val k = normalizar(titulo)
                    porChat[k] = Accion(a.actionIntent, ri, null)
                    vistoEn[k] = System.currentTimeMillis()
                    _podar()
                    return true
                }
            }
        }
        return false
    }

    fun titulosVivos(): List<String> = porChat.keys.toList()

    /** Responde al chat que matchee por nombre/número (exacto o número). true si pudo.
     *  v4.2: espera humana antes de responder — nadie contesta en 2 segundos
     *  siempre. 4-25s según el largo del mensaje. */
    fun responder(c: Context, buscado: String, texto: String): Boolean {
        val acc = buscarAccion(buscado) ?: return false
        // La pausa humana la aplica el CALLER en su propio hilo (auditoría #5):
        // dormir acá bloqueaba un hilo del pool de red y hacía que el lease del
        // outbox venciera → doble envío.
        Humano.pausar(texto.length, buscado)
        return try {
            val intent = Intent()
            val bundle = Bundle()
            bundle.putCharSequence(acc.remoteInput.resultKey, texto)
            RemoteInput.addResultsToIntent(arrayOf(acc.remoteInput), intent, bundle)
            acc.pending.send(c, 0, intent)
            true
        } catch (e: Exception) { false }
    }

    private fun buscarAccion(buscado: String): Accion? {
        val b = normalizar(buscado)
        if (b.isBlank()) return null
        porChat[b]?.let { return it }                                   // exacto (nombre de pendiente.txt)
        // Por NÚMERO verificado (chats sin agendar, título = número), con
        // variante 9-AR. NADA de contains: el matcheo laxo causó el desvío
        // de la campaña del 17/8 (clave "" matcheaba todo).
        val bDig = _dig9(b)
        if (bDig.length >= 10) {
            for ((k, v) in porChat) {
                val kDig = _dig9(k)
                if (kDig.length >= 10 && kDig.takeLast(10) == bDig.takeLast(10)) return v
            }
        }
        return null
    }

    private fun _dig9(s: String): String {
        var d = s.filter { it.isDigit() }
        if (d.startsWith("549")) d = "54" + d.substring(3)
        return d
    }

    /** Evicción por TTL: los PendingIntent viejos no sirven y el mapa crecía indefinido. */
    private fun _podar() {
        val ahora = System.currentTimeMillis()
        val muertos = vistoEn.filterValues { ahora - it > TTL_CHAT_MS }.keys
        for (k in muertos) { porChat.remove(k); vistoEn.remove(k) }
    }

    private fun normalizar(s: String): String =
        java.text.Normalizer.normalize(s.trim().lowercase(), java.text.Normalizer.Form.NFD)
            .replace(Regex("\\p{Mn}+"), "")
}
