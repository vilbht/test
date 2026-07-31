package dev.hidgamepad.core.hid

/**
 * Logical state of the gamepad. Immutable; the input engine produces new
 * instances and downstream consumers (report builder, UI) read them.
 *
 * Axis convention follows HID: Y/Rz positive is down, X/Z positive is right.
 */
data class GamepadState(
    /** Bitmask of buttons 1..16; button 1 = bit 0. */
    val buttons: Int = 0,
    /** Hat: 0=N, 1=NE .. 7=NW, 8=neutral. */
    val hat: Int = GamepadDescriptor.HAT_NEUTRAL,
    val leftX: Int = 0,
    val leftY: Int = 0,
    val rightX: Int = 0,
    val rightY: Int = 0,
    val leftTrigger: Int = 0,
    val rightTrigger: Int = 0,
) {
    init {
        require(hat in 0..GamepadDescriptor.HAT_NEUTRAL) { "hat out of range: $hat" }
    }

    fun isButtonPressed(number: Int): Boolean {
        require(number in 1..GamepadDescriptor.BUTTON_COUNT)
        return buttons and (1 shl (number - 1)) != 0
    }

    fun withButton(number: Int, pressed: Boolean): GamepadState {
        require(number in 1..GamepadDescriptor.BUTTON_COUNT)
        val bit = 1 shl (number - 1)
        return copy(buttons = if (pressed) buttons or bit else buttons and bit.inv())
    }

    companion object {
        val NEUTRAL = GamepadState()
    }
}
