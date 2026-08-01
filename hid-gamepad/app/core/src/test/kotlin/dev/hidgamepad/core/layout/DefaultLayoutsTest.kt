package dev.hidgamepad.core.layout

import kotlin.math.sqrt
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Geometry checks for the built-in layouts on a real landscape panel.
 *
 * These exist because both problems below shipped unnoticed until the layout
 * was actually rendered: zones were sized as if the screen were square, so on
 * a 2400x1080 phone they overlapped heavily and swallowed each other's touches.
 */
class DefaultLayoutsTest {

    // Reference panel: 2400x1080 at ~400 dpi.
    private val screenW = 2400f
    private val screenH = 1080f
    private val aspect = screenH / screenW
    private val dpi = 400f

    /** Distance between two zone centres in width-normalized units. */
    private fun centreDistance(a: ControlSpec, b: ControlSpec): Float {
        val dx = a.center.x - b.center.x
        val dy = (a.center.y - b.center.y) * aspect
        return sqrt(dx * dx + dy * dy)
    }

    @Test
    fun freeLayoutZonesDoNotOverlap() {
        val controls = DefaultLayouts.freeDefault().controls
        val collisions = mutableListOf<String>()
        for (i in controls.indices) {
            for (j in i + 1 until controls.size) {
                val a = controls[i]
                val b = controls[j]
                val gap = centreDistance(a, b) - (a.radius + b.radius)
                if (gap < 0f) {
                    collisions += "${a.id}/${b.id} overlap by %.4f".format(-gap)
                }
            }
        }
        assertTrue("Overlapping zones: $collisions", collisions.isEmpty())
    }

    @Test
    fun freeLayoutZonesStayOnScreen() {
        val offscreen = DefaultLayouts.freeDefault().controls.filter { c ->
            val rx = c.radius                 // radius is relative to width
            val ry = c.radius / aspect        // same radius expressed in height units
            c.center.x - rx < 0f || c.center.x + rx > 1f ||
                c.center.y - ry < 0f || c.center.y + ry > 1f
        }
        assertTrue("Zones running off screen: ${offscreen.map { it.id }}", offscreen.isEmpty())
    }

    @Test
    fun everyZoneMeetsMinimumTouchTargetSize() {
        // Android's minimum recommended target is 48dp; at 400 dpi that is 120 px.
        val minPx = 48f * (dpi / 160f)
        val tooSmall = DefaultLayouts.freeDefault().controls.filter { c ->
            c.radius * 2f * screenW < minPx
        }
        assertTrue("Zones below the 48dp touch target: ${tooSmall.map { it.id }}", tooSmall.isEmpty())
    }

    @Test
    fun caseTemplateZonesDoNotOverlap() {
        val controls = DefaultLayouts.caseTemplate().controls
        for (i in controls.indices) {
            for (j in i + 1 until controls.size) {
                val a = controls[i]
                val b = controls[j]
                assertTrue(
                    "${a.id} overlaps ${b.id}",
                    centreDistance(a, b) >= a.radius + b.radius,
                )
            }
        }
    }
}
