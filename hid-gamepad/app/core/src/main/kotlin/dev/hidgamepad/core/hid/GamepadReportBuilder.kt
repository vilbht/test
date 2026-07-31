package dev.hidgamepad.core.hid

/**
 * Packs a [GamepadState] into the 9-byte input report payload described by
 * [GamepadDescriptor]. Pure function; unit-tested against golden bytes.
 */
object GamepadReportBuilder {

    fun build(state: GamepadState): ByteArray {
        val out = ByteArray(GamepadDescriptor.REPORT_SIZE)
        packInto(state, out)
        return out
    }

    /** Zero-allocation variant for the report-sending hot path. */
    fun packInto(state: GamepadState, out: ByteArray) {
        require(out.size >= GamepadDescriptor.REPORT_SIZE)
        out[0] = (state.buttons and 0xFF).toByte()
        out[1] = ((state.buttons shr 8) and 0xFF).toByte()
        out[2] = (state.hat and 0x0F).toByte()
        out[3] = clampAxis(state.leftX)
        out[4] = clampAxis(state.leftY)
        out[5] = clampAxis(state.rightX)
        out[6] = clampAxis(state.rightY)
        out[7] = clampTrigger(state.leftTrigger)
        out[8] = clampTrigger(state.rightTrigger)
    }

    private fun clampAxis(v: Int): Byte =
        v.coerceIn(GamepadDescriptor.AXIS_MIN, GamepadDescriptor.AXIS_MAX).toByte()

    private fun clampTrigger(v: Int): Byte =
        (v.coerceIn(GamepadDescriptor.TRIGGER_MIN, GamepadDescriptor.TRIGGER_MAX) and 0xFF).toByte()
}
