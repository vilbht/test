package dev.hidgamepad.core.hid

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GamepadReportBuilderTest {

    private fun hex(state: GamepadState) =
        GamepadReportBuilder.build(state).joinToString(" ") { "%02X".format(it) }

    @Test
    fun neutralReport() {
        assertEquals("00 00 08 00 00 00 00 00 00", hex(GamepadState.NEUTRAL))
    }

    @Test
    fun buttonBoundaries() {
        assertEquals("01 00 08 00 00 00 00 00 00", hex(GamepadState.NEUTRAL.withButton(1, true)))
        assertEquals("80 00 08 00 00 00 00 00 00", hex(GamepadState.NEUTRAL.withButton(8, true)))
        assertEquals("00 01 08 00 00 00 00 00 00", hex(GamepadState.NEUTRAL.withButton(9, true)))
        assertEquals("00 80 08 00 00 00 00 00 00", hex(GamepadState.NEUTRAL.withButton(16, true)))
        assertEquals(
            "FF FF 08 00 00 00 00 00 00",
            hex((1..16).fold(GamepadState.NEUTRAL) { s, n -> s.withButton(n, true) }),
        )
    }

    @Test
    fun hatValues() {
        assertEquals("00 00 00 00 00 00 00 00 00", hex(GamepadState.NEUTRAL.copy(hat = 0)))
        assertEquals("00 00 07 00 00 00 00 00 00", hex(GamepadState.NEUTRAL.copy(hat = 7)))
        // 8 = null/neutral value, out of the 0..7 logical range
        assertEquals("00 00 08 00 00 00 00 00 00", hex(GamepadState.NEUTRAL.copy(hat = 8)))
    }

    @Test
    fun axisBoundaries() {
        // -127 = 0x81 two's complement, 127 = 0x7F
        assertEquals(
            "00 00 08 81 7F 81 7F 00 00",
            hex(GamepadState.NEUTRAL.copy(leftX = -127, leftY = 127, rightX = -127, rightY = 127)),
        )
        // Out-of-range values clamp instead of overflowing
        assertEquals(
            "00 00 08 81 7F 00 00 00 00",
            hex(GamepadState.NEUTRAL.copy(leftX = -1000, leftY = 1000)),
        )
    }

    @Test
    fun triggerBoundaries() {
        assertEquals("00 00 08 00 00 00 00 FF 00", hex(GamepadState.NEUTRAL.copy(leftTrigger = 255)))
        assertEquals("00 00 08 00 00 00 00 00 FF", hex(GamepadState.NEUTRAL.copy(rightTrigger = 255)))
        assertEquals("00 00 08 00 00 00 00 FF 00", hex(GamepadState.NEUTRAL.copy(leftTrigger = 999)))
    }

    @Test
    fun buttonHelpers() {
        val s = GamepadState.NEUTRAL.withButton(5, true)
        assertTrue(s.isButtonPressed(5))
        assertFalse(s.isButtonPressed(6))
        assertFalse(s.withButton(5, false).isButtonPressed(5))
    }

    @Test
    fun reportGateDedupes() {
        val gate = ReportGate()
        val a = GamepadReportBuilder.build(GamepadState.NEUTRAL)
        val b = GamepadReportBuilder.build(GamepadState.NEUTRAL.withButton(1, true))
        assertTrue(gate.shouldSend(a))
        gate.markSent(a)
        assertFalse(gate.shouldSend(a))
        assertTrue(gate.shouldSend(b))
        gate.markSent(b)
        assertFalse(gate.shouldSend(b))
        gate.reset()
        assertTrue(gate.shouldSend(b))
    }
}
