package dev.hidgamepad.bluetooth

import android.bluetooth.BluetoothDevice
import kotlinx.coroutines.flow.StateFlow

/** High-level connection state exposed to the UI. */
sealed class ConnectionState {
    /** The phone's Bluetooth stack does not offer the HID Device profile. */
    data class Unsupported(val reason: String) : ConnectionState()
    data object Idle : ConnectionState()
    data object Registering : ConnectionState()
    /** Registered as the active HID app; ready to connect or be connected to. */
    data object Registered : ConnectionState()
    data class Connecting(val device: BluetoothDevice) : ConnectionState()
    data class Connected(val device: BluetoothDevice) : ConnectionState()
}

/**
 * Transport abstraction over "the phone is a HID gamepad". The only shipped
 * implementation is [ClassicHidTransport] (Bluetooth Classic HID Device
 * profile); a BLE HID-over-GATT implementation (for iOS/iPadOS hosts) can be
 * added behind this interface without touching input or UI code.
 */
interface HidTransport {

    val state: StateFlow<ConnectionState>

    /** Register the gamepad with the local stack. Idempotent. */
    fun register()

    /** Unregister and drop any connection. */
    fun unregister()

    fun connect(device: BluetoothDevice)

    fun disconnect()

    /** Sends an input report payload. Returns false if not connected/failed. */
    fun sendReport(report: ByteArray): Boolean
}
