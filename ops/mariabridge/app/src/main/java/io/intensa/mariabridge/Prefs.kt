package io.intensa.mariabridge

import android.content.Context

/** Config persistida. Se llena desde MainActivity (manual o por QR en v2). */
object Prefs {
    private const val F = "mariabridge"
    fun get(c: Context) = c.getSharedPreferences(F, Context.MODE_PRIVATE)

    fun hookBase(c: Context): String = get(c).getString("hook_base", "") ?: ""   // ej https://intensa.io/hooks/wa
    fun secret(c: Context): String = get(c).getString("secret", "") ?: ""         // el WA_HOOK_SECRET
    fun activo(c: Context): Boolean = get(c).getBoolean("activo", false)

    // Marca de agua del barrido de notificaciones vivas (v4.5): postTime de la
    // última notif procesada. Todo lo que sea <= a esto ya se vio.
    fun ultimoPost(c: Context): Long = get(c).getLong("ultimo_post", 0L)
    fun setUltimoPost(c: Context, ts: Long) {
        if (ts > ultimoPost(c)) get(c).edit().putLong("ultimo_post", ts).apply()
    }

    fun guardar(c: Context, base: String, secret: String) {
        get(c).edit()
            .putString("hook_base", base.trimEnd('/'))
            .putString("secret", secret.trim())
            .putBoolean("activo", base.isNotBlank() && secret.isNotBlank())
            .apply()
    }
}
