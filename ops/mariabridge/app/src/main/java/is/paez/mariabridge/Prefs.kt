package is.paez.mariabridge

import android.content.Context

/** Config persistida. Se llena desde MainActivity (manual o por QR en v2). */
object Prefs {
    private const val F = "mariabridge"
    fun get(c: Context) = c.getSharedPreferences(F, Context.MODE_PRIVATE)

    fun hookBase(c: Context): String = get(c).getString("hook_base", "") ?: ""   // ej https://intensa.io/hooks/wa
    fun secret(c: Context): String = get(c).getString("secret", "") ?: ""         // el WA_HOOK_SECRET
    fun activo(c: Context): Boolean = get(c).getBoolean("activo", false)

    fun guardar(c: Context, base: String, secret: String) {
        get(c).edit()
            .putString("hook_base", base.trimEnd('/'))
            .putString("secret", secret.trim())
            .putBoolean("activo", base.isNotBlank() && secret.isNotBlank())
            .apply()
    }
}
