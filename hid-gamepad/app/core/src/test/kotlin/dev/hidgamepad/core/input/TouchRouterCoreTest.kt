package dev.hidgamepad.core.input

import dev.hidgamepad.core.hid.GamepadState
import dev.hidgamepad.core.layout.ControlSpec
import dev.hidgamepad.core.layout.LayoutMode
import dev.hidgamepad.core.layout.LayoutProfile
import dev.hidgamepad.core.layout.StickSide
import dev.hidgamepad.core.layout.Vec2
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TouchRouterCoreTest {

    private class NullListener : InputEngine.Listener {
        override fun onStateChanged(state: GamepadState) = Unit
        override fun onFeedback(control: ControlSpec, edge: FeedbackEdge) = Unit
    }

    private val btnA = ControlSpec.ButtonZone("a", "A", Vec2(0.8f, 0.5f), 0.1f, 1)
    private val btnB = ControlSpec.ButtonZone("b", "B", Vec2(0.6f, 0.5f), 0.1f, 2)
    private val stick = ControlSpec.StickZone("s", "LS", Vec2(0.2f, 0.5f), 0.15f, StickSide.LEFT)

    private fun freeLayout() = LayoutProfile("test", LayoutMode.FREE, listOf(btnA, btnB, stick))
    private fun caseLayout() = LayoutProfile("case", LayoutMode.CASE, listOf(btnA, btnB, stick))

    private fun router(layout: LayoutProfile): Pair<TouchRouterCore, InputEngine> {
        val engine = InputEngine(NullListener())
        val r = TouchRouterCore(engine)
        r.layout = layout
        return r to engine
    }

    @Test
    fun containmentHitInFreeMode() {
        val (r, engine) = router(freeLayout())
        r.pointerDown(0, 0.8f, 0.5f, null, 0)
        assertTrue(engine.state.isButtonPressed(1))
        // Miss: nothing pressed
        r.pointerDown(1, 0.45f, 0.9f, null, 0)
        assertEquals(1, engine.state.buttons)
    }

    @Test
    fun nearestCenterWinsInCaseMode() {
        val (r, engine) = router(caseLayout())
        // 0.69 is inside both A (center .8, r .1) and B (center .6, r .1); B is nearer? |0.69-0.6|=0.09, |0.69-0.8|=0.11 -> outside A, inside B.
        // Use 0.705: dist to A = 0.095, dist to B = 0.105 -> both within radius, A nearer.
        r.pointerDown(0, 0.705f, 0.5f, null, 0)
        assertTrue(engine.state.isButtonPressed(1))
        assertFalse(engine.state.isButtonPressed(2))
    }

    @Test
    fun pointerSlidingOffZoneKeepsDrivingIt() {
        val (r, engine) = router(freeLayout())
        r.pointerDown(0, 0.2f, 0.5f, null, 0)
        // Slide far outside the stick zone: still controls the stick
        r.pointerMove(0, 0.5f, 0.5f, null, 10)
        assertEquals(127, engine.state.leftX)
        r.pointerUp(0, 20)
        assertEquals(0, engine.state.leftX)
    }

    @Test
    fun pointerIdReuseCannotLeakStuckControl() {
        val (r, engine) = router(freeLayout())
        r.pointerDown(0, 0.8f, 0.5f, null, 0)
        assertTrue(engine.state.isButtonPressed(1))
        // Same id goes down again without an up (dropped event): old control released
        r.pointerDown(0, 0.6f, 0.5f, null, 10)
        assertFalse(engine.state.isButtonPressed(1))
        assertTrue(engine.state.isButtonPressed(2))
    }

    @Test
    fun secondPointerOnOccupiedZoneIsIgnored() {
        val (r, engine) = router(freeLayout())
        r.pointerDown(0, 0.8f, 0.5f, null, 0)
        r.pointerDown(1, 0.82f, 0.52f, null, 0)
        r.pointerUp(1, 10)
        // The first pointer still owns the button
        assertTrue(engine.state.isButtonPressed(1))
        r.pointerUp(0, 20)
        assertFalse(engine.state.isButtonPressed(1))
    }

    @Test
    fun cancelAllReleasesEverything() {
        val (r, engine) = router(freeLayout())
        r.pointerDown(0, 0.8f, 0.5f, null, 0)
        r.pointerDown(1, 0.2f, 0.5f, null, 0)
        r.cancelAll(10)
        assertEquals(GamepadState.NEUTRAL, engine.state)
    }

    @Test
    fun switchingLayoutResetsState() {
        val (r, engine) = router(freeLayout())
        r.pointerDown(0, 0.8f, 0.5f, null, 0)
        r.layout = caseLayout()
        assertEquals(GamepadState.NEUTRAL, engine.state)
        // The stale pointer no longer routes anywhere
        r.pointerMove(0, 0.2f, 0.5f, null, 10)
        assertEquals(GamepadState.NEUTRAL, engine.state)
    }

    @Test
    fun hitTestMissReturnsNull() {
        val (r, _) = router(caseLayout())
        assertNull(r.hitTest(caseLayout(), 0.45f, 0.95f))
    }

    /**
     * On a landscape screen the hit area must be the circle the renderer
     * draws (radius scaled to width), not an ellipse. Before the aspect
     * correction a touch 80% of the way up a zone's drawn radius missed
     * entirely, because y was measured in the shorter dimension's units.
     */
    @Test
    fun hitAreaIsCircularOnLandscapeScreens() {
        val engine = InputEngine(NullListener())
        val r = TouchRouterCore(engine)
        r.layout = freeLayout()
        r.aspect = 1080f / 2400f

        // btnA sits at (0.8, 0.5) with radius 0.1 of the width. A point 80% of
        // that radius straight up is inside the drawn circle.
        val dyInsideCircle = 0.08f / r.aspect        // 0.08 width units, expressed in height units
        r.pointerDown(0, 0.8f, 0.5f - dyInsideCircle, null, 0)
        assertTrue("vertical hit inside the drawn circle should register", engine.state.isButtonPressed(1))
        r.pointerUp(0, 10)

        // And a point beyond the drawn radius must miss.
        val dyOutside = 0.14f / r.aspect
        r.pointerDown(1, 0.8f, 0.5f - dyOutside, null, 20)
        assertFalse("vertical miss outside the circle should not register", engine.state.isButtonPressed(1))
    }

    /** Stick deflection must be isotropic: equal pixel travel gives equal output. */
    @Test
    fun stickDeflectionIsIsotropic() {
        val engine = InputEngine(NullListener())
        engine.settings = EngineSettings(deadZone = 0f)
        val r = TouchRouterCore(engine)
        r.layout = freeLayout()
        r.aspect = 1080f / 2400f

        // Stick centre (0.2, 0.5), radius 0.15 of width. Half-radius right...
        r.pointerDown(0, 0.2f + 0.075f, 0.5f, null, 0)
        val horizontal = engine.state.leftX
        r.pointerUp(0, 10)

        // ...and the same physical distance downward.
        r.pointerDown(1, 0.2f, 0.5f + 0.075f / r.aspect, null, 20)
        val vertical = engine.state.leftY
        r.pointerUp(1, 30)

        assertEquals("equal travel should give equal deflection", horizontal, vertical)
    }
}
