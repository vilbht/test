package dev.hidgamepad.bluetooth

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothHidDevice
import android.bluetooth.BluetoothHidDeviceAppQosSettings
import android.bluetooth.BluetoothHidDeviceAppSdpSettings
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.util.Log
import dev.hidgamepad.core.hid.GamepadDescriptor
import java.util.concurrent.Executors
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Bluetooth Classic HID Device profile transport.
 *
 * Lifecycle quirks this class absorbs (see docs/architecture.md):
 *  - registerApp is asynchronous; nothing works until onAppStatusChanged
 *    reports registered=true.
 *  - Only one HID app can be registered per adapter; Android may unregister
 *    us at any time (Bluetooth toggled, another HID app registered). We
 *    surface that as Idle so the UI can offer re-registration.
 *  - onGetReport MUST be answered or picky hosts drop the connection.
 *  - Some OEM builds ship without the profile: proxy fetch fails or
 *    registerApp returns false -> Unsupported, never a retry loop.
 *
 * Permission note: all calls funnel through methods annotated with
 * @SuppressLint("MissingPermission"); the UI gates on BLUETOOTH_CONNECT /
 * BLUETOOTH_ADVERTISE before reaching this class, and SecurityException is
 * caught defensively.
 */
@SuppressLint("MissingPermission")
class ClassicHidTransport(private val context: Context) : HidTransport {

    private companion object {
        const val TAG = "ClassicHidTransport"
    }

    private val _state = MutableStateFlow<ConnectionState>(ConnectionState.Idle)
    override val state: StateFlow<ConnectionState> = _state

    private var hidDevice: BluetoothHidDevice? = null
    private var registered = false
    private var connectedDevice: BluetoothDevice? = null

    /** Answered on GET_REPORT; the scheduler keeps this fresh. */
    @Volatile
    var lastReport: ByteArray = ByteArray(GamepadDescriptor.REPORT_SIZE).also {
        it[2] = GamepadDescriptor.HAT_NEUTRAL.toByte()
    }

    private val executor = Executors.newSingleThreadExecutor()

    private val sdp = BluetoothHidDeviceAppSdpSettings(
        "HID Gamepad",
        "Software Bluetooth gamepad",
        "hid-gamepad",
        BluetoothHidDevice.SUBCLASS2_GAMEPAD,
        GamepadDescriptor.REPORT_DESCRIPTOR,
    )

    private val qosOut = BluetoothHidDeviceAppQosSettings(
        BluetoothHidDeviceAppQosSettings.SERVICE_BEST_EFFORT,
        800,   // token rate: bytes/s (9-byte reports at ~90Hz)
        9,     // token bucket size: one report
        0,     // peak bandwidth: don't care
        11250, // latency: microseconds
        BluetoothHidDeviceAppQosSettings.MAX,
    )

    private val callback = object : BluetoothHidDevice.Callback() {
        override fun onAppStatusChanged(pluggedDevice: BluetoothDevice?, isRegistered: Boolean) {
            registered = isRegistered
            if (isRegistered) {
                _state.value = ConnectionState.Registered
            } else {
                // Stack revoked us (BT off, another HID app took over).
                connectedDevice = null
                if (_state.value !is ConnectionState.Unsupported) {
                    _state.value = ConnectionState.Idle
                }
            }
        }

        override fun onConnectionStateChanged(device: BluetoothDevice, btState: Int) {
            when (btState) {
                BluetoothProfile.STATE_CONNECTING -> _state.value = ConnectionState.Connecting(device)
                BluetoothProfile.STATE_CONNECTED -> {
                    connectedDevice = device
                    _state.value = ConnectionState.Connected(device)
                }
                BluetoothProfile.STATE_DISCONNECTING,
                BluetoothProfile.STATE_DISCONNECTED,
                -> {
                    if (connectedDevice == device || btState == BluetoothProfile.STATE_DISCONNECTED) {
                        connectedDevice = null
                        _state.value = if (registered) ConnectionState.Registered else ConnectionState.Idle
                    }
                }
            }
        }

        override fun onGetReport(device: BluetoothDevice, type: Byte, id: Byte, bufferSize: Int) {
            // Must answer or some hosts (notably Windows) drop the connection.
            val hid = hidDevice ?: return
            try {
                if (type == BluetoothHidDevice.REPORT_TYPE_INPUT &&
                    id.toInt() == GamepadDescriptor.REPORT_ID
                ) {
                    hid.replyReport(device, type, id, lastReport)
                } else {
                    hid.reportError(device, BluetoothHidDevice.ERROR_RSP_INVALID_RPT_ID)
                }
            } catch (e: SecurityException) {
                Log.w(TAG, "replyReport failed", e)
            }
        }

        override fun onSetReport(device: BluetoothDevice, type: Byte, id: Byte, data: ByteArray) {
            // No output reports in the descriptor; acknowledge with an error response.
            try {
                hidDevice?.reportError(device, BluetoothHidDevice.ERROR_RSP_UNSUPPORTED_REQ)
            } catch (e: SecurityException) {
                Log.w(TAG, "reportError failed", e)
            }
        }

        override fun onVirtualCableUnplug(device: BluetoothDevice) {
            // Host asked to forget us; treat as disconnect.
            if (connectedDevice == device) {
                connectedDevice = null
                _state.value = if (registered) ConnectionState.Registered else ConnectionState.Idle
            }
        }
    }

    private val serviceListener = object : BluetoothProfile.ServiceListener {
        override fun onServiceConnected(profile: Int, proxy: BluetoothProfile) {
            if (profile != BluetoothProfile.HID_DEVICE) return
            val hid = proxy as BluetoothHidDevice
            hidDevice = hid
            val ok = try {
                hid.registerApp(sdp, null, qosOut, executor, callback)
            } catch (e: SecurityException) {
                Log.w(TAG, "registerApp security exception", e)
                false
            }
            if (!ok) {
                _state.value = ConnectionState.Unsupported(
                    "This phone's Bluetooth stack rejected HID device registration.",
                )
            }
        }

        override fun onServiceDisconnected(profile: Int) {
            if (profile != BluetoothProfile.HID_DEVICE) return
            hidDevice = null
            registered = false
            connectedDevice = null
            if (_state.value !is ConnectionState.Unsupported) {
                _state.value = ConnectionState.Idle
            }
        }
    }

    private val adapter: BluetoothAdapter?
        get() = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    override fun register() {
        if (registered || _state.value is ConnectionState.Registering) return
        val a = adapter
        if (a == null || !a.isEnabled) {
            _state.value = ConnectionState.Unsupported("Bluetooth is off or unavailable.")
            return
        }
        _state.value = ConnectionState.Registering
        val gotProxy = a.getProfileProxy(context, serviceListener, BluetoothProfile.HID_DEVICE)
        if (!gotProxy) {
            _state.value = ConnectionState.Unsupported(
                "This phone does not expose the Bluetooth HID Device profile.",
            )
        }
    }

    override fun unregister() {
        val hid = hidDevice
        try {
            hid?.unregisterApp()
        } catch (e: SecurityException) {
            Log.w(TAG, "unregisterApp failed", e)
        }
        adapter?.closeProfileProxy(BluetoothProfile.HID_DEVICE, hid)
        hidDevice = null
        registered = false
        connectedDevice = null
        _state.value = ConnectionState.Idle
    }

    override fun connect(device: BluetoothDevice) {
        val hid = hidDevice ?: return
        if (!registered) return
        try {
            _state.value = ConnectionState.Connecting(device)
            hid.connect(device)
        } catch (e: SecurityException) {
            Log.w(TAG, "connect failed", e)
            _state.value = ConnectionState.Registered
        }
    }

    override fun disconnect() {
        val hid = hidDevice ?: return
        val device = connectedDevice ?: return
        try {
            hid.disconnect(device)
        } catch (e: SecurityException) {
            Log.w(TAG, "disconnect failed", e)
        }
    }

    override fun sendReport(report: ByteArray): Boolean {
        val hid = hidDevice ?: return false
        val device = connectedDevice ?: return false
        lastReport = report.copyOf()
        return try {
            hid.sendReport(device, GamepadDescriptor.REPORT_ID, report)
        } catch (e: SecurityException) {
            Log.w(TAG, "sendReport failed", e)
            false
        }
    }
}
