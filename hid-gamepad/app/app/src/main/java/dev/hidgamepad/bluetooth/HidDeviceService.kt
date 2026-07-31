package dev.hidgamepad.bluetooth

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import dev.hidgamepad.GamepadApplication
import dev.hidgamepad.MainActivity
import dev.hidgamepad.R
import dev.hidgamepad.core.hid.GamepadDescriptor
import dev.hidgamepad.core.hid.GamepadReportBuilder
import dev.hidgamepad.core.hid.ReportGate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

/**
 * Foreground service that keeps the HID connection and report loop alive
 * while the app is backgrounded or the screen is off. Started when the user
 * registers the gamepad, stopped on unregister.
 *
 * The report loop consumes the container's gamepadState flow off the main
 * thread (sendReport is a binder call), dedupes via ReportGate, and always
 * delivers the latest state — including the final all-neutral report on
 * release, so inputs can never stick.
 */
class HidDeviceService : Service() {

    companion object {
        const val ACTION_START = "dev.hidgamepad.START"
        const val ACTION_STOP = "dev.hidgamepad.STOP"
        private const val CHANNEL_ID = "gamepad_connection"
        private const val NOTIFICATION_ID = 1

        fun start(context: Context) {
            context.startForegroundService(
                Intent(context, HidDeviceService::class.java).setAction(ACTION_START),
            )
        }

        fun stop(context: Context) {
            context.startService(
                Intent(context, HidDeviceService::class.java).setAction(ACTION_STOP),
            )
        }
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopSelf()
                return START_NOT_STICKY
            }
            else -> {
                startAsForeground()
                val container = (application as GamepadApplication).container
                container.transport.register()
                startReportLoop()
                startNotificationUpdates()
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        val container = (application as GamepadApplication).container
        container.transport.unregister()
        scope.cancel()
        super.onDestroy()
    }

    private var loopsStarted = false

    private fun startReportLoop() {
        if (loopsStarted) return
        loopsStarted = true
        val container = (application as GamepadApplication).container
        scope.launch {
            container.transport.state.collectLatest { conn ->
                if (conn !is ConnectionState.Connected) return@collectLatest
                val gate = ReportGate()
                val buf = ByteArray(GamepadDescriptor.REPORT_SIZE)
                container.gamepadState.collect { state ->
                    GamepadReportBuilder.packInto(state, buf)
                    if (gate.shouldSend(buf)) {
                        if (container.transport.sendReport(buf)) {
                            gate.markSent(buf)
                        }
                        // Bound the send rate (~120 Hz); state flow conflation
                        // keeps only the latest value while we pause.
                        delay(8)
                    }
                }
            }
        }
    }

    private fun startNotificationUpdates() {
        val container = (application as GamepadApplication).container
        scope.launch {
            container.transport.state.collect { conn ->
                val text = when (conn) {
                    is ConnectionState.Connected -> getString(
                        R.string.notification_connected,
                        try {
                            conn.device.name ?: conn.device.address
                        } catch (e: SecurityException) {
                            "host"
                        },
                    )
                    else -> getString(R.string.notification_disconnected)
                }
                val nm = getSystemService(NotificationManager::class.java)
                nm.notify(NOTIFICATION_ID, buildNotification(text))
            }
        }
    }

    private fun startAsForeground() {
        val notification = buildNotification(getString(R.string.notification_disconnected))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun buildNotification(text: String): Notification {
        val contentIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(text)
            .setContentIntent(contentIntent)
            .setOngoing(true)
            .build()
    }

    private fun createChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_LOW,
        )
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
}
