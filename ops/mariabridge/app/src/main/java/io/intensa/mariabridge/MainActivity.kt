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
        val eBase = EditText(this).apply {
            hint = "URL del hook"
            // precargada por default (pedido Diego 16/8) — editable para otras instancias
            setText(Prefs.hookBase(this@MainActivity).ifBlank { "https://intensa.io/hooks/wa-maria" })
        }
        val eSec = EditText(this).apply { hint = "Secret del hook"; setText(Prefs.secret(this@MainActivity)) }
        val estado = TextView(this).apply { text = "" }

        fun bloquear(b: Boolean) {
            for (e in listOf(eBase, eSec)) {
                e.isEnabled = !b; e.isFocusable = !b; e.isFocusableInTouchMode = !b
                e.alpha = if (b) 0.5f else 1f
            }
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
        val bAcc = Button(this).apply {
            text = "③ Permiso: accesibilidad (envío en frío)"
            setOnClickListener { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
        }
        val bArchivos = Button(this).apply {
            text = "④ Permiso: todos los archivos (audios reales)"
            setOnClickListener {
                try {
                    val i = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                        android.net.Uri.parse("package:$packageName"))
                    startActivity(i)
                } catch (_: Exception) {
                    startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
                }
            }
        }
        val bUpd = Button(this).apply {
            text = "Buscar actualización"
            setOnClickListener {
                estado.text = "Buscando actualización…"
                Updater.chequear(this@MainActivity, desdeUi = true) { r ->
                    runOnUiThread { estado.text = "Update: $r" }
                }
            }
        }

        // Aviso si el acceso a notificaciones se perdió (pasa al actualizar el APK).
        val aviso = TextView(this).apply { textSize = 13f }
        fun chequearNotif() {
            val ok = Settings.Secure.getString(contentResolver, "enabled_notification_listeners")
                ?.contains(packageName) == true
            aviso.text = if (ok) "✔ Acceso a notificaciones activo"
                         else "⚠ FALTA acceso a notificaciones — tocá ① (se desconecta al actualizar)"
        }
        chequearNotif()

        listOf(titulo, eBase, eSec, bGuardar, bNotif, bBat, bAcc, bArchivos, bUpd, aviso, estado).forEach { root.addView(it) }

        // Config por deep-link (v2.6): mariabridge://config?url=..&secret=..
        // — el provisioning imprime el link; un tap y queda configurada.
        intent?.data?.let { uri ->
            if (uri.scheme == "mariabridge" && uri.host == "config") {
                val u = uri.getQueryParameter("url") ?: ""
                val sec = uri.getQueryParameter("secret") ?: ""
                if (u.isNotBlank() && sec.isNotBlank()) {
                    bloquear(false)
                    eBase.setText(u); eSec.setText(sec)
                    Prefs.guardar(this, u, sec)
                    val svc = Intent(this, OutboxService::class.java)
                    if (android.os.Build.VERSION.SDK_INT >= 26) startForegroundService(svc) else startService(svc)
                    bloquear(true)
                    estado.text = "Configurada por link ✔ Servicio en marcha"
                    MbLog.init(this); MbLog.i("cfg", "configurada por deep-link")
                }
            }
        }
        setContentView(ScrollView(this).apply { addView(root) })
    }
}
