package io.intensa.mariabridge

/**
 * Estado compartido entre OutboxService (que decide) y WaSendService (que
 * ejecuta el tap por accesibilidad). Envío EN FRÍO: chats SIN notificación
 * viva, donde RemoteInput no sirve. Un solo cold-send a la vez.
 */
object ColdSend {
    data class Target(val id: String, val numero: String, val texto: String, val ts: Long = System.currentTimeMillis())

    @Volatile var pendiente: Target? = null
    @Volatile var lanzado: Boolean = false
    // callback(id, ok): ok=true si se verificó el envío real
    @Volatile var onDone: ((String, Boolean) -> Unit)? = null

    @Synchronized fun encolar(t: Target, cb: (String, Boolean) -> Unit): Boolean {
        if (pendiente != null) return false     // ya hay uno en curso
        pendiente = t; lanzado = false; onDone = cb
        return true
    }

    @Synchronized fun terminar(id: String, ok: Boolean) {
        val cb = onDone
        pendiente = null; lanzado = false; onDone = null
        cb?.invoke(id, ok)
    }
}
