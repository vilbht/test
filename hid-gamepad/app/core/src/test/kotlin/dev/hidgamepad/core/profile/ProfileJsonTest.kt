package dev.hidgamepad.core.profile

import dev.hidgamepad.core.input.EngineSettings
import dev.hidgamepad.core.input.OneHandedMode
import dev.hidgamepad.core.input.applyAccessibility
import dev.hidgamepad.core.layout.ControlSpec
import dev.hidgamepad.core.layout.DefaultLayouts
import dev.hidgamepad.core.layout.LayoutMode
import dev.hidgamepad.core.layout.LayoutProfile
import dev.hidgamepad.core.layout.ScreenInfo
import dev.hidgamepad.core.layout.Vec2
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ProfileJsonTest {

    @Test
    fun roundTripPreservesEveryControlType() {
        val profile = DefaultLayouts.freeDefault().copy(
            screen = ScreenInfo(2400, 1080, 400f, 400f),
        )
        val decoded = ProfileJson.decode(ProfileJson.encode(profile))
        assertEquals(profile, decoded)
    }

    @Test
    fun defaultLayoutsValidate() {
        assertTrue(DefaultLayouts.freeDefault().validate().isEmpty())
        assertTrue(DefaultLayouts.caseTemplate().validate().isEmpty())
    }

    @Test
    fun validationCatchesBadButtonNumberAndDuplicateIds() {
        val bad = LayoutProfile(
            "bad", LayoutMode.FREE,
            listOf(
                ControlSpec.ButtonZone("x", "X", Vec2(0.5f, 0.5f), 0.1f, 17),
                ControlSpec.ButtonZone("x", "X2", Vec2(0.3f, 0.5f), 0.1f, 1),
            ),
        )
        val problems = bad.validate()
        assertTrue(problems.any { "17" in it })
        assertTrue(problems.any { "Duplicate" in it })
    }

    @Test
    fun caseExportProducesMillimetreScadFragment() {
        // 400 dpi -> 25.4/400 = 0.0635 mm/px; screen 2400x1080
        val profile = LayoutProfile(
            "cal", LayoutMode.CASE,
            listOf(ControlSpec.ButtonZone("a", "A", Vec2(0.5f, 0.5f), 0.05f, 1)),
            screen = ScreenInfo(2400, 1080, 400f, 400f),
        )
        val scad = CaseExport.toScadFragment(profile)
        // x = 0.5*2400*0.0635 = 76.2 mm, y = 0.5*1080*0.0635 = 34.29 mm
        assertTrue(scad.contains("flex_buttons = ["))
        assertTrue(scad.contains("[76.20, 34.29, \"A\"]"))
        assertTrue(scad.contains("toggles = ["))
    }

    @Test
    fun accessibilityTransformScalesAndCondenses() {
        val base = DefaultLayouts.freeDefault()
        val scaled = base.applyAccessibility(EngineSettings(targetScale = 1.5f))
        assertEquals(base.controls[0].radius * 1.5f, scaled.controls[0].radius, 1e-5f)

        val oneHanded = base.applyAccessibility(EngineSettings(oneHanded = OneHandedMode.RIGHT))
        // Everything lands in the right-reachable region
        assertTrue(oneHanded.controls.all { it.center.x >= 0.45f })
        // Identity settings return the same instance
        assertTrue(base === base.applyAccessibility(EngineSettings()))
    }
}
