package io.intensa.mariabridge

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Auto-update semi-automático: chequea <host>/_dl/mariabridge-latest.json
 * (lo publica el build del VPS), descarga el APK nuevo y ofrece instalarlo con
 * UN tap (notificación, o directo si está la app abierta). El tap final de
 * "Instalar" lo exige Android para apps sideloaded — no se puede saltear sin
 * device-owner. Multitenant: deriva el host de la URL del hook configurada.
 */
object Updater {
    @Volatile private var chequeando = false
    // Ventana de auto-instalación (v2.6): cuando hay un APK nuestro listo para
    // instalar, la accesibilidad puede tocar "Instalar" sola. v4.4: 30 min
    // (con 10 la ventana se vencía mientras el operador remoto iba y venía).
    @Volatile var instalandoDesde: Long = 0L
    fun enVentanaInstalacion() = System.currentTimeMillis() - instalandoDesde < 30 * 60_000L

    fun chequear(c: Context, desdeUi: Boolean, onEstado: ((String) -> Unit)? = null) {
        if (chequeando) return
        chequeando = true
        Thread {
            try {
                val estado = _chequear(c.applicationContext, desdeUi)
                onEstado?.invoke(estado)
            } catch (e: Exception) {
                MbLog.e("upd", "chequeo falló: ${e.message}")
                onEstado?.invoke("error: ${e.message}")
            } finally { chequeando = false }
        }.apply { isDaemon = true }.start()
    }

    private fun _chequear(c: Context, desdeUi: Boolean): String {
        val hook = Prefs.hookBase(c)
        if (hook.isBlank()) return "sin config"
        val host = Uri.parse(hook).host ?: return "URL inválida"
        val jsonUrl = "https://$host/_dl/mariabridge-latest.json"

        val info = c.packageManager.getPackageInfo(c.packageName, 0)
        @Suppress("DEPRECATION")
        val mio = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode.toInt() else info.versionCode

        val conn = URL(jsonUrl).openConnection() as HttpURLConnection
        conn.connectTimeout = 15000; conn.readTimeout = 15000
        val j = JSONObject(conn.inputStream.bufferedReader().readText())
        conn.disconnect()
        val remoto = j.optInt("versionCode", 0)
        val nombre = j.optString("versionName", "?")
        val apkUrl = j.optString("url", "")
        if (remoto <= mio) {
            MbLog.i("upd", "al día (v$nombre code=$remoto, mío=$mio)")
            try { (c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(7) } catch (_: Exception) {}
            return "al día (v${info.versionName})"
        }
        if (apkUrl.isBlank()) return "json sin url"
        // El APK debe venir del MISMO host que el hook y por https (auditoría):
        // el json es remoto, no se acepta que redirija a cualquier lado.
        if (!apkUrl.startsWith("https://$host/")) {
            MbLog.e("upd", "apkUrl fuera del host esperado ($apkUrl) — descarto")
            return "url no confiable"
        }

        MbLog.i("upd", "versión nueva v$nombre (code $remoto > $mio) — descargando")
        val f = File(c.getExternalFilesDir(null), "mariabridge-update.apk")
        val dl = URL(apkUrl).openConnection() as HttpURLConnection
        dl.connectTimeout = 20000; dl.readTimeout = 120000
        dl.inputStream.use { inp -> f.outputStream().use { out -> inp.copyTo(out) } }
        dl.disconnect()
        MbLog.i("upd", "descargado ${f.length() / 1024}KB — ofreciendo instalar")

        val uri = FileProvider.getUriForFile(c, c.packageName + ".fileprovider", f)
        val i = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)

        instalandoDesde = System.currentTimeMillis()
        if (desdeUi) {
            c.startActivity(i)
            // Fallback (v3.3, "trabón" del 17/8): Android a veces dropea el
            // intent del instalador en silencio. Dejamos TAMBIÉN la notificación
            // como segunda vía (sin re-descargar). Se cancela sola al quedar al día.
            _notificarInstalar(c, i, nombre)
        } else {
            _notificarInstalar(c, i, nombre)
        }
        return "v$nombre descargada — instalá"
    }

    private fun _notificarInstalar(c: Context, i: Intent, nombre: String) {
        val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26)
            nm.createNotificationChannel(NotificationChannel("mariabridge_upd", "Actualizaciones", NotificationManager.IMPORTANCE_HIGH))
        val pi = PendingIntent.getActivity(c, 7, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(c, "mariabridge_upd")
            .setContentTitle("MariaBridge v$nombre lista")
            .setContentText("Tocá para instalar la actualización")
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentIntent(pi).setAutoCancel(true).build()
        nm.notify(7, n)
    }
}
