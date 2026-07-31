package dev.hidgamepad.core.hid

import org.junit.Assert.assertEquals
import org.junit.Test

class GamepadDescriptorTest {

    /**
     * Golden bytes for the report descriptor. Any change here changes what
     * hosts see (and Windows caches descriptors per bonded device!) — update
     * docs/hid-descriptor.md and bump the SDP name when this changes.
     */
    @Test
    fun descriptorMatchesGoldenBytes() {
        val golden = (
            "05 01 09 05 A1 01 85 01 " +
                "05 09 19 01 29 10 15 00 25 01 75 01 95 10 81 02 " +
                "05 01 09 39 15 00 25 07 35 00 46 3B 01 65 14 75 04 95 01 81 42 " +
                "65 00 75 04 95 01 81 03 " +
                "09 30 09 31 09 32 09 35 15 81 25 7F 75 08 95 04 81 02 " +
                "09 33 09 34 15 00 26 FF 00 75 08 95 02 81 02 " +
                "C0"
            ).split(" ").map { it.toInt(16).toByte() }.toByteArray()

        assertEquals(golden.toHex(), GamepadDescriptor.REPORT_DESCRIPTOR.toHex())
    }

    private fun ByteArray.toHex() = joinToString(" ") { "%02X".format(it) }
}
