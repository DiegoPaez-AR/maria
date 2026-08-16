package io.intensa.mariabridge

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.*

/** Pantalla única: configurar hook + secret, dar permisos, arrancar. */
class MainActivity : Activity() {
    override fun onCreate(s: Bundle?) {
        super.onCreate(s)
        val pad = (16 * resources.displayMetrics.density).toInt()
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, pad, pad, pad) }

        val pkgInfo = try { packageManager.getPackageInfo(packageName, 0) } catch (e: Exception) { null }
        val ver = pkgInfo?.versionName ?: "?"
        val titulo = TextView(this).apply { text = "MariaBridge  v$ver"; textSize = 24f }
        val eBase = EditText(this).apply { hint = "URL del hook (https://intensa.io/hooks/wa)"; setText(Prefs.hookBase(this@MainActivity)) }
        val eSec = EditText(this).apply { hint = "Secret del hook"; setText(Prefs.secret(this@MainActivity)) }
        val estado = TextView(this).apply { text = "" }

        fun bloquear(b: Boolean) {
            eBase.isEnabled = !b; eSec.isEnabled = !b
        }
        // Si ya estaba configurado, arrancar bloqueado.
        if (Prefs.activo(this)) bloquear(true)

        val bGuardar = Button(this).apply {
            text = "Guardar y arrancar"
            setOnClickListener {
                if (!eBase.isEnabled) {   // segundo tap = desbloquear para editar
                    bloquear(false); estado.text = "Campos desbloqueados — editá y volvé a guardar"
                    return@setOnClickListener
                }
                Prefs.guardar(this@MainActivity, eBase.text.toString(), eSec.text.toString())
                val svc = Intent(this@MainActivity, OutboxService::class.java)
                if (android.os.Build.VERSION.SDK_INT >= 26) startForegroundService(svc) else startService(svc)
                bloquear(true)
                estado.text = "Guardado. Servicio en marcha ✔ (tocá de nuevo para editar)"
            }
        }
        val bNotif = Button(this).apply {
            text = "① Permiso: acceso a notificaciones"
            setOnClickListener { startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }
        }
        val bBat = Button(this).apply {
            text = "② Quitar restricción de batería"
            setOnClickListener { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
        }

        listOf(titulo, eBase, eSec, bGuardar, bNotif, bBat, estado).forEach { root.addView(it) }
        setContentView(ScrollView(this).apply { addView(root) })
    }
}
