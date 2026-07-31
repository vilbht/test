package dev.hidgamepad.core.input

import dev.hidgamepad.core.hid.GamepadDescriptor
import dev.hidgamepad.core.hid.GamepadState
import dev.hidgamepad.core.layout.ControlSpec
import dev.hidgamepad.core.layout.StickSide
import dev.hidgamepad.core.layout.TriggerSide
import dev.hidgamepad.core.layout.Vec2
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InputEngineTest {

    private class RecordingListener : InputEngine.Listener {
        val states = mutableListOf<GamepadState>()
        val feedback = mutableListOf<Pair<String, FeedbackEdge>>()
        override fun onStateChanged(state: GamepadState) { states.add(state) }
        override fun onFeedback(control: ControlSpec, edge: FeedbackEdge) { feedback.add(control.id to edge) }
    }

    private val button = ControlSpec.ButtonZone("a", "A", Vec2(0.5f, 0.5f), 0.1f, 1)
    private val buttonWithAlt = ControlSpec.ButtonZone("a2", "A2", Vec2(0.5f, 0.5f), 0.1f, 1, longPressButtonNumber = 4)
    private val toggle = ControlSpec.ToggleZone("t", "T1", Vec2(0.2f, 0.2f), 0.05f, 13)
    private val stick = ControlSpec.StickZone("s", "LS", Vec2(0.2f, 0.6f), 0.15f, StickSide.LEFT)
    private val trigger = ControlSpec.TriggerZone("lt", "LT", Vec2(0.1f, 0.1f), 0.05f, TriggerSide.LEFT)
    private val dpad = ControlSpec.DpadZone("d", "D-pad", Vec2(0.3f, 0.8f), 0.1f)

    private fun engine() = RecordingListener().let { it to InputEngine(it) }

    @Test
    fun momentaryButtonPressRelease() {
        val (listener, engine) = engine()
        engine.handle(ControlEvent.Down(button, 0f, 0f), 0)
        assertTrue(engine.state.isButtonPressed(1))
        engine.handle(ControlEvent.Up(button), 50)
        assertFalse(engine.state.isButtonPressed(1))
        assertEquals(listOf("a" to FeedbackEdge.PRESS, "a" to FeedbackEdge.RELEASE), listener.feedback)
    }

    @Test
    fun stickyButtonLatchesAcrossTaps() {
        val (_, engine) = engine()
        engine.settings = EngineSettings(stickyButtons = true)
        engine.handle(ControlEvent.Down(button, 0f, 0f), 0)
        engine.handle(ControlEvent.Up(button), 50)
        assertTrue("still held after lift", engine.state.isButtonPressed(1))
        engine.handle(ControlEvent.Down(button, 0f, 0f), 100)
        engine.handle(ControlEvent.Up(button), 150)
        assertFalse("released on second tap", engine.state.isButtonPressed(1))
    }

    @Test
    fun toggleFollowMirrorsContact() {
        val (_, engine) = engine()
        engine.handle(ControlEvent.Down(toggle, 0f, 0f), 0)
        assertTrue(engine.state.isButtonPressed(13))
        engine.handle(ControlEvent.Up(toggle), 50)
        assertFalse(engine.state.isButtonPressed(13))
    }

    @Test
    fun toggleFlipLatchesAcrossContacts() {
        val (_, engine) = engine()
        engine.settings = EngineSettings(toggleMode = ToggleMode.FLIP)
        engine.handle(ControlEvent.Down(toggle, 0f, 0f), 0)
        engine.handle(ControlEvent.Up(toggle), 50)
        assertTrue(engine.state.isButtonPressed(13))
        engine.handle(ControlEvent.Down(toggle, 0f, 0f), 100)
        engine.handle(ControlEvent.Up(toggle), 150)
        assertFalse(engine.state.isButtonPressed(13))
    }

    @Test
    fun stickDeadZoneAndFullDeflection() {
        val (_, engine) = engine()
        engine.settings = EngineSettings(deadZone = 0.2f)
        // Inside dead zone: no output
        engine.handle(ControlEvent.Down(stick, 0.1f, 0f), 0)
        assertEquals(0, engine.state.leftX)
        // Full deflection right
        engine.handle(ControlEvent.Move(stick, 1f, 0f), 10)
        assertEquals(127, engine.state.leftX)
        assertEquals(0, engine.state.leftY)
        // Full deflection down (screen +y = HID +Y)
        engine.handle(ControlEvent.Move(stick, 0f, 1f), 20)
        assertEquals(127, engine.state.leftY)
        // Release always recenters
        engine.handle(ControlEvent.Up(stick), 30)
        assertEquals(0, engine.state.leftX)
        assertEquals(0, engine.state.leftY)
    }

    @Test
    fun stickSensitivityScalesOutput() {
        val (_, engine) = engine()
        engine.settings = EngineSettings(deadZone = 0f, sensitivity = 2f)
        engine.handle(ControlEvent.Down(stick, 0.4f, 0f), 0)
        // 0.4 * 2 = 0.8 -> 102
        assertEquals(102, engine.state.leftX)
        // Gain saturates at full scale
        engine.handle(ControlEvent.Move(stick, 0.9f, 0f), 10)
        assertEquals(127, engine.state.leftX)
    }

    @Test
    fun triggerDigitalFullPullAndMirror() {
        val (_, engine) = engine()
        engine.handle(ControlEvent.Down(trigger, 0f, 0f), 0)
        assertEquals(255, engine.state.leftTrigger)
        assertTrue(engine.state.isButtonPressed(GamepadDescriptor.BUTTON_LT_DIGITAL))
        engine.handle(ControlEvent.Up(trigger), 50)
        assertEquals(0, engine.state.leftTrigger)
        assertFalse(engine.state.isButtonPressed(GamepadDescriptor.BUTTON_LT_DIGITAL))
    }

    @Test
    fun analogSqueezeMapsContactSize() {
        val (_, engine) = engine()
        engine.settings = EngineSettings(analogSqueeze = true)
        engine.handle(ControlEvent.Down(trigger, 0f, 0f, squeeze = 0.5f), 0)
        assertEquals(128, engine.state.leftTrigger)
        engine.handle(ControlEvent.Move(trigger, 0f, 0f, squeeze = 1f), 10)
        assertEquals(255, engine.state.leftTrigger)
    }

    @Test
    fun dpadSectorsAndNeutral() {
        val (_, engine) = engine()
        engine.handle(ControlEvent.Down(dpad, 0f, -1f), 0)      // up
        assertEquals(0, engine.state.hat)
        engine.handle(ControlEvent.Move(dpad, 1f, 0f), 10)      // right
        assertEquals(2, engine.state.hat)
        engine.handle(ControlEvent.Move(dpad, 0f, 1f), 20)      // down
        assertEquals(4, engine.state.hat)
        engine.handle(ControlEvent.Move(dpad, -1f, 0f), 30)     // left
        assertEquals(6, engine.state.hat)
        engine.handle(ControlEvent.Move(dpad, 0.7f, -0.7f), 40) // up-right
        assertEquals(1, engine.state.hat)
        engine.handle(ControlEvent.Up(dpad), 50)
        assertEquals(GamepadDescriptor.HAT_NEUTRAL, engine.state.hat)
    }

    @Test
    fun longPressEmitsAlternateBinding() {
        val (_, engine) = engine()
        engine.settings = EngineSettings(longPressEnabled = true, longPressMs = 400)
        engine.handle(ControlEvent.Down(buttonWithAlt, 0f, 0f), 0)
        // Nothing yet: decision pending
        assertFalse(engine.state.isButtonPressed(1))
        engine.onTick(500)
        assertTrue("alt fired after threshold", engine.state.isButtonPressed(4))
        assertFalse(engine.state.isButtonPressed(1))
        engine.handle(ControlEvent.Up(buttonWithAlt), 600)
        assertFalse(engine.state.isButtonPressed(4))
    }

    @Test
    fun shortPressBeforeThresholdEmitsNormalTap() {
        val (listener, engine) = engine()
        engine.settings = EngineSettings(longPressEnabled = true, longPressMs = 400)
        engine.handle(ControlEvent.Down(buttonWithAlt, 0f, 0f), 0)
        engine.handle(ControlEvent.Up(buttonWithAlt), 100)
        assertFalse(engine.state.isButtonPressed(1))
        assertFalse(engine.state.isButtonPressed(4))
        // The tap produced a press+release pulse of button 1
        assertTrue(listener.states.any { it.isButtonPressed(1) })
    }

    @Test
    fun resetToNeutralClearsEverything() {
        val (_, engine) = engine()
        engine.settings = EngineSettings(stickyButtons = true)
        engine.handle(ControlEvent.Down(button, 0f, 0f), 0)
        engine.handle(ControlEvent.Down(stick, 1f, 0f), 0)
        engine.resetToNeutral()
        assertEquals(GamepadState.NEUTRAL, engine.state)
    }
}
