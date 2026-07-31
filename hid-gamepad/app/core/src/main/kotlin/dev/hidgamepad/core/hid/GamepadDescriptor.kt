package dev.hidgamepad.core.hid

/**
 * HID report descriptor for the gamepad and the byte layout of its single
 * input report. This is the contract everything else builds on; see
 * docs/hid-descriptor.md for the annotated listing.
 *
 * Layout (Report ID 1, 9-byte payload):
 *   byte 0    buttons 1-8   (button 1 = bit 0)
 *   byte 1    buttons 9-16
 *   byte 2    hat switch in low nibble (0=N .. 7=NW clockwise, 8=neutral),
 *             high nibble constant padding
 *   byte 3-6  X, Y (left stick), Z, Rz (right stick), signed -127..127
 *   byte 7-8  Rx, Ry (left/right trigger), unsigned 0..255
 */
object GamepadDescriptor {

    const val REPORT_ID = 1
    const val REPORT_SIZE = 9

    const val BUTTON_COUNT = 16
    const val HAT_NEUTRAL = 8

    const val AXIS_MIN = -127
    const val AXIS_MAX = 127
    const val TRIGGER_MIN = 0
    const val TRIGGER_MAX = 255

    // Conventional button assignments (documented in docs/hid-descriptor.md).
    const val BUTTON_A = 1
    const val BUTTON_B = 2
    const val BUTTON_X = 3
    const val BUTTON_Y = 4
    const val BUTTON_LB = 5
    const val BUTTON_RB = 6
    const val BUTTON_LT_DIGITAL = 7
    const val BUTTON_RT_DIGITAL = 8
    const val BUTTON_SELECT = 9
    const val BUTTON_START = 10
    const val BUTTON_L3 = 11
    const val BUTTON_R3 = 12
    const val BUTTON_TOGGLE_1 = 13
    const val BUTTON_TOGGLE_2 = 14
    const val BUTTON_TOGGLE_3 = 15
    const val BUTTON_TOGGLE_4 = 16

    val REPORT_DESCRIPTOR: ByteArray = intArrayOf(
        0x05, 0x01,             // Usage Page (Generic Desktop)
        0x09, 0x05,             // Usage (Gamepad)
        0xA1, 0x01,             // Collection (Application)
        0x85, 0x01,             //   Report ID (1)
        // 16 buttons, one bit each
        0x05, 0x09,             //   Usage Page (Button)
        0x19, 0x01,             //   Usage Minimum (Button 1)
        0x29, 0x10,             //   Usage Maximum (Button 16)
        0x15, 0x00,             //   Logical Minimum (0)
        0x25, 0x01,             //   Logical Maximum (1)
        0x75, 0x01,             //   Report Size (1)
        0x95, 0x10,             //   Report Count (16)
        0x81, 0x02,             //   Input (Data,Var,Abs)
        // Hat switch (D-pad), 4 bits + 4 bits padding
        0x05, 0x01,             //   Usage Page (Generic Desktop)
        0x09, 0x39,             //   Usage (Hat Switch)
        0x15, 0x00,             //   Logical Minimum (0)
        0x25, 0x07,             //   Logical Maximum (7)
        0x35, 0x00,             //   Physical Minimum (0)
        0x46, 0x3B, 0x01,       //   Physical Maximum (315)
        0x65, 0x14,             //   Unit (Degrees)
        0x75, 0x04,             //   Report Size (4)
        0x95, 0x01,             //   Report Count (1)
        0x81, 0x42,             //   Input (Data,Var,Abs,Null State)
        0x65, 0x00,             //   Unit (None)
        0x75, 0x04,             //   Report Size (4)
        0x95, 0x01,             //   Report Count (1)
        0x81, 0x03,             //   Input (Const,Var,Abs) padding
        // Sticks: X/Y (left), Z/Rz (right), signed 8-bit
        0x09, 0x30,             //   Usage (X)
        0x09, 0x31,             //   Usage (Y)
        0x09, 0x32,             //   Usage (Z)
        0x09, 0x35,             //   Usage (Rz)
        0x15, 0x81,             //   Logical Minimum (-127)
        0x25, 0x7F,             //   Logical Maximum (127)
        0x75, 0x08,             //   Report Size (8)
        0x95, 0x04,             //   Report Count (4)
        0x81, 0x02,             //   Input (Data,Var,Abs)
        // Analog triggers: Rx/Ry, unsigned 8-bit
        0x09, 0x33,             //   Usage (Rx)
        0x09, 0x34,             //   Usage (Ry)
        0x15, 0x00,             //   Logical Minimum (0)
        0x26, 0xFF, 0x00,       //   Logical Maximum (255)
        0x75, 0x08,             //   Report Size (8)
        0x95, 0x02,             //   Report Count (2)
        0x81, 0x02,             //   Input (Data,Var,Abs)
        0xC0,                   // End Collection
    ).map { it.toByte() }.toByteArray()
}
