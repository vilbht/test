package dev.hidgamepad.core.layout

import dev.hidgamepad.core.hid.GamepadDescriptor as D

/**
 * Built-in layouts. Coordinates assume landscape orientation: `center` is
 * normalized per-axis (x by screen width, y by height) while `radius` is
 * always relative to screen **width** — the convention the renderer and the
 * aspect-corrected hit test in `TouchRouterCore` both use.
 *
 * Sizes are picked for a ~2400x1080 panel at ~400 dpi: a face button is
 * roughly 9 mm across (comfortably above the 48dp minimum touch target) and
 * no two zones overlap. `DefaultLayoutsTest` enforces the no-overlap rule.
 */
object DefaultLayouts {

    /** Free-form on-screen gamepad for thumbs, no case. */
    fun freeDefault(): LayoutProfile = LayoutProfile(
        name = "Default (free)",
        mode = LayoutMode.FREE,
        controls = listOf(
            // Thumbsticks: left low-left, right low-centre-right
            ControlSpec.StickZone("stick_l", "Left stick", Vec2(0.14f, 0.70f), 0.082f, StickSide.LEFT),
            ControlSpec.StickZone("stick_r", "Right stick", Vec2(0.68f, 0.72f), 0.075f, StickSide.RIGHT),
            // D-pad above the left stick
            ControlSpec.DpadZone("dpad", "D-pad", Vec2(0.30f, 0.36f), 0.058f),
            // Face buttons in a diamond around (0.88, 0.60)
            ControlSpec.ButtonZone("btn_y", "Y", Vec2(0.880f, 0.484f), 0.030f, D.BUTTON_Y),
            ControlSpec.ButtonZone("btn_x", "X", Vec2(0.828f, 0.600f), 0.030f, D.BUTTON_X),
            ControlSpec.ButtonZone("btn_b", "B", Vec2(0.932f, 0.600f), 0.030f, D.BUTTON_B),
            ControlSpec.ButtonZone("btn_a", "A", Vec2(0.880f, 0.716f), 0.030f, D.BUTTON_A),
            // Triggers on the top corners, shoulders just below them
            ControlSpec.TriggerZone("trig_l", "LT", Vec2(0.06f, 0.11f), 0.042f, TriggerSide.LEFT),
            ControlSpec.TriggerZone("trig_r", "RT", Vec2(0.94f, 0.11f), 0.042f, TriggerSide.RIGHT),
            // 0.35 rather than 0.33 so the trigger's label still clears the
            // shoulder ring at the 1.6x "large labels" accessibility scale.
            ControlSpec.ButtonZone("btn_lb", "LB", Vec2(0.06f, 0.35f), 0.042f, D.BUTTON_LB),
            ControlSpec.ButtonZone("btn_rb", "RB", Vec2(0.94f, 0.35f), 0.042f, D.BUTTON_RB),
            // Latching toggles across the top centre
            ControlSpec.ToggleZone("tgl_1", "T1", Vec2(0.31f, 0.09f), 0.030f, D.BUTTON_TOGGLE_1),
            ControlSpec.ToggleZone("tgl_2", "T2", Vec2(0.39f, 0.09f), 0.030f, D.BUTTON_TOGGLE_2),
            ControlSpec.ToggleZone("tgl_3", "T3", Vec2(0.61f, 0.09f), 0.030f, D.BUTTON_TOGGLE_3),
            ControlSpec.ToggleZone("tgl_4", "T4", Vec2(0.69f, 0.09f), 0.030f, D.BUTTON_TOGGLE_4),
            // Select / Start centre, stick clicks inboard of each stick
            ControlSpec.ButtonZone("btn_select", "Select", Vec2(0.44f, 0.30f), 0.030f, D.BUTTON_SELECT),
            ControlSpec.ButtonZone("btn_start", "Start", Vec2(0.56f, 0.30f), 0.030f, D.BUTTON_START),
            ControlSpec.ButtonZone("btn_l3", "L3", Vec2(0.28f, 0.60f), 0.028f, D.BUTTON_L3),
            ControlSpec.ButtonZone("btn_r3", "R3", Vec2(0.56f, 0.60f), 0.028f, D.BUTTON_R3),
        ),
    )

    /**
     * Case template matching the default `case/config.scad` control placement.
     * Positions are nominal; the calibration flow replaces them with measured
     * centroids on the user's phone+case combination.
     */
    fun caseTemplate(): LayoutProfile = LayoutProfile(
        name = "Case (uncalibrated)",
        mode = LayoutMode.CASE,
        controls = listOf(
            ControlSpec.StickZone("stick_l", "Left stick", Vec2(0.17f, 0.55f), 0.08f, StickSide.LEFT),
            ControlSpec.ButtonZone("btn_a", "A", Vec2(0.86f, 0.72f), 0.045f, D.BUTTON_A),
            ControlSpec.ButtonZone("btn_b", "B", Vec2(0.92f, 0.55f), 0.045f, D.BUTTON_B),
            ControlSpec.ButtonZone("btn_x", "X", Vec2(0.80f, 0.55f), 0.045f, D.BUTTON_X),
            ControlSpec.ButtonZone("btn_y", "Y", Vec2(0.86f, 0.38f), 0.045f, D.BUTTON_Y),
            ControlSpec.TriggerZone("trig_l", "LT", Vec2(0.08f, 0.10f), 0.05f, TriggerSide.LEFT),
            ControlSpec.TriggerZone("trig_r", "RT", Vec2(0.92f, 0.10f), 0.05f, TriggerSide.RIGHT),
            ControlSpec.ButtonZone("btn_select", "Select", Vec2(0.44f, 0.16f), 0.04f, D.BUTTON_SELECT),
            ControlSpec.ButtonZone("btn_start", "Start", Vec2(0.56f, 0.16f), 0.04f, D.BUTTON_START),
            ControlSpec.ToggleZone("tgl_1", "T1", Vec2(0.36f, 0.08f), 0.035f, D.BUTTON_TOGGLE_1),
            ControlSpec.ToggleZone("tgl_2", "T2", Vec2(0.64f, 0.08f), 0.035f, D.BUTTON_TOGGLE_2),
        ),
    )
}
