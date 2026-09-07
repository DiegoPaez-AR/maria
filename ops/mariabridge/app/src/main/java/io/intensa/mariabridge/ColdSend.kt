package io.intensa.mariabridge

/**
 * Estado compartido entre OutboxService (que decide) y WaSendService (que
 * ejecuta el tap por accesibilidad). Envío EN FRÍO: chats SIN notificación
 * viva, donde RemoteInput no sirve. Un solo cold-send a la vez.
 */
object ColdSend {
    data class Target(val id: String, val numero: String, val texto: String, val nombre: String = "", val ts: Long = System.currentTimeMillis())

    @Volatile var pendiente: Target? = null
    @Volatile var lanzado: Boolean = false
    // v4.7: id del target al que ya se le tocó "send" — desde ahí el cierre lo
    // decide la verificación (3 lecturas + foto), no el deadline de apertura.
    @Volatile var tapHecho: String? = null
    // callback(id, ok): ok=true si se verificó el envío real
    @Volatile var onDone: ((String, Boolean) -> Unit)? = null

    @Synchronized fun encolar(t: Target, cb: (String, Boolean) -> Unit): Boolean {
        val p = pendiente
        if (p != null) {
            // Guard anti-colgado (v2.5): si el que está "en curso" tiene >90s,
            // la accesibilidad murió o algo se trabó — lo damos por fallido y
            // tomamos el lugar (antes: ocupado para siempre + spam de mbdiag).
            // v4.7: 150s — la verificación positiva puede tardar hasta ~85s
            // (pausa humana 20s + 3 lecturas + foto al VPS 60s).
            if (System.currentTimeMillis() - p.ts > 150_000) {
                MbLog.w("frio", "ColdSend colgado con #${p.id} (${(System.currentTimeMillis() - p.ts) / 1000}s) — lo suelto")
                terminar(p.id, false)
            } else return false
        }
        pendiente = t; lanzado = false; tapHecho = null; onDone = cb
        return true
    }

    @Synchronized fun terminar(id: String, ok: Boolean) {
        val cb = onDone
        pendiente = null; lanzado = false; tapHecho = null; onDone = null
        cb?.invoke(id, ok)
    }
}
