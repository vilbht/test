package dev.hidgamepad.core.hid

/**
 * Deduplicates outgoing reports: the scheduler ticks at a fixed rate while
 * analog input is active, but only reports that differ from the last one
 * sent should hit the Bluetooth link.
 */
class ReportGate {

    private val last = ByteArray(GamepadDescriptor.REPORT_SIZE)
    private var hasSent = false

    /** True if [report] differs from the previously sent report. */
    fun shouldSend(report: ByteArray): Boolean = !hasSent || !report.contentEquals(last)

    fun markSent(report: ByteArray) {
        report.copyInto(last)
        hasSent = true
    }

    fun reset() {
        hasSent = false
    }
}
