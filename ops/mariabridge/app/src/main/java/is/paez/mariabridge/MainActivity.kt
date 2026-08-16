package is.paez.mariabridge

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

        val titulo = TextView(this).apply { text = "MariaBridge"; textSize = 24f }
        val eBase = EditText(this).apply { hint = "URL del hook (https://intensa.io/hooks/wa)"; setText(Prefs.hookBase(this@MainActivity)) }
        val eSec = EditText(this).apply { hint = "Secret del hook"; setText(Prefs.secret(this@MainActivity)) }
        val estado = TextView(this).apply { text = "" }

        val bGuardar = Button(this).apply {
            text = "Guardar y arrancar"
            setOnClickListener {
                Prefs.guardar(this@MainActivity, eBase.text.toString(), eSec.text.toString())
                val svc = Intent(this@MainActivity, OutboxService::class.java)
                if (android.os.Build.VERSION.SDK_INT >= 26) startForegroundService(svc) else startService(svc)
                estado.text = "Guardado. Servicio en marcha ✔"
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
