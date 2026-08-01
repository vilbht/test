package dev.hidgamepad.core.input

import dev.hidgamepad.core.layout.ControlSpec
import dev.hidgamepad.core.layout.LayoutMode
import dev.hidgamepad.core.layout.LayoutProfile

/**
 * Routes raw pointer events (already normalized to 0..1 screen coordinates)
 * to control zones of the active layout and forwards control-level events to
 * the engine. Tracks pointer-id -> control assignments so a pointer that
 * slides outside its zone keeps driving it until lift (crucial for sticks),
 * and so pointer-id reuse can't leak a stuck control.
 */
class TouchRouterCore(
    private val engine: InputEngine,
) {
    var layout: LayoutProfile? = null
        set(value) {
            field = value
            // Any in-flight pointers refer to the old layout's zones.
            assignments.clear()
            engine.resetToNeutral()
        }

    /**
     * Screen height / width. The UI sets this whenever the surface is
     * measured; it makes circular zones hit-test as circles rather than
     * ellipses (see [distSq]). 1.0 means a square surface.
     */
    var aspect: Float = 1f

    private data class Assignment(val control: ControlSpec)

    private val assignments = mutableMapOf<Int, Assignment>()

    fun pointerDown(pointerId: Int, x: Float, y: Float, squeeze: Float?, nowMs: Long) {
        val active = layout ?: return
        // Defensive: a reused pointer id must not keep an old assignment.
        assignments.remove(pointerId)?.let { engine.handle(ControlEvent.Up(it.control), nowMs) }
        val control = hitTest(active, x, y) ?: return
        // One pointer per zone: a second finger on an occupied zone is ignored.
        if (assignments.values.any { it.control.id == control.id }) return
        assignments[pointerId] = Assignment(control)
        val (dx, dy) = offsetInZone(control, x, y)
        engine.handle(ControlEvent.Down(control, dx, dy, squeeze), nowMs)
    }

    fun pointerMove(pointerId: Int, x: Float, y: Float, squeeze: Float?, nowMs: Long) {
        val assignment = assignments[pointerId] ?: return
        val (dx, dy) = offsetInZone(assignment.control, x, y)
        engine.handle(ControlEvent.Move(assignment.control, dx, dy, squeeze), nowMs)
    }

    fun pointerUp(pointerId: Int, nowMs: Long) {
        val assignment = assignments.remove(pointerId) ?: return
        engine.handle(ControlEvent.Up(assignment.control), nowMs)
    }

    /** All pointers gone (view detached, gesture cancel): release everything. */
    fun cancelAll(nowMs: Long) {
        assignments.keys.toList().forEach { pointerUp(it, nowMs) }
    }

    fun hitTest(layout: LayoutProfile, x: Float, y: Float): ControlSpec? = when (layout.mode) {
        // Free mode: containment in the zone circle.
        LayoutMode.FREE -> layout.controls.firstOrNull { distSq(it, x, y) <= it.radius * it.radius }
        // Case mode: nearest center that is within the zone radius — physical
        // contacts land slightly off-center and zones never overlap.
        LayoutMode.CASE -> layout.controls
            .filter { distSq(it, x, y) <= it.radius * it.radius }
            .minByOrNull { distSq(it, x, y) }
    }

    /**
     * Distance in *width-normalized* space. Pointer coordinates arrive
     * normalized per-axis (x by width, y by height) but a zone radius is
     * relative to width only — the same convention the renderer uses when it
     * draws a circle of `radius * width` pixels. Scaling dy by [aspect]
     * converts it into the same units, so the hit area is the circle the user
     * sees. Without this the hit area collapses to an ellipse: on a 2400x1080
     * landscape screen it would be only 45% as tall as it looks.
     */
    private fun distSq(c: ControlSpec, x: Float, y: Float): Float {
        val dx = x - c.center.x
        val dy = (y - c.center.y) * aspect
        return dx * dx + dy * dy
    }

    /** Offset from zone center normalized so the zone radius is 1. */
    private fun offsetInZone(c: ControlSpec, x: Float, y: Float): Pair<Float, Float> =
        ((x - c.center.x) / c.radius) to (((y - c.center.y) * aspect) / c.radius)
}
