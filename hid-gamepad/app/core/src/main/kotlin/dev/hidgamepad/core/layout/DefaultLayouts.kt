package dev.hidgamepad.core.layout

import dev.hidgamepad.core.hid.GamepadDescriptor as D

/**
 * Built-in layouts. Coordinates assume landscape orientation, normalized to
 * 0..1 of the screen's width/height.
 */
object DefaultLayouts {

    /** Free-form on-screen gamepad for thumbs, no case. */
    fun freeDefault(): LayoutProfile = LayoutProfile(
        name = "Default (free)",
        mode = LayoutMode.FREE,
        controls = listOf(
            ControlSpec.StickZone("stick_l", "Left stick", Vec2(0.16f, 0.62f), 0.13f, StickSide.LEFT),
            ControlSpec.StickZone("stick_r", "Right stick", Vec2(0.60f, 0.72f), 0.11f, StickSide.RIGHT),
            ControlSpec.DpadZone("dpad", "D-pad", Vec2(0.32f, 0.78f), 0.10f),
            // Face buttons in a diamond
            ControlSpec.ButtonZone("btn_a", "A", Vec2(0.84f, 0.76f), 0.055f, D.BUTTON_A),
            ControlSpec.ButtonZone("btn_b", "B", Vec2(0.91f, 0.60f), 0.055f, D.BUTTON_B),
            ControlSpec.ButtonZone("btn_x", "X", Vec2(0.77f, 0.60f), 0.055f, D.BUTTON_X),
            ControlSpec.ButtonZone("btn_y", "Y", Vec2(0.84f, 0.44f), 0.055f, D.BUTTON_Y),
            // Shoulders and triggers along the top edge
            ControlSpec.ButtonZone("btn_lb", "LB", Vec2(0.10f, 0.26f), 0.06f, D.BUTTON_LB),
            ControlSpec.ButtonZone("btn_rb", "RB", Vec2(0.90f, 0.26f), 0.06f, D.BUTTON_RB),
            ControlSpec.TriggerZone("trig_l", "LT", Vec2(0.10f, 0.10f), 0.06f, TriggerSide.LEFT),
            ControlSpec.TriggerZone("trig_r", "RT", Vec2(0.90f, 0.10f), 0.06f, TriggerSide.RIGHT),
            // Select / Start in the middle
            ControlSpec.ButtonZone("btn_select", "Select", Vec2(0.42f, 0.30f), 0.045f, D.BUTTON_SELECT),
            ControlSpec.ButtonZone("btn_start", "Start", Vec2(0.58f, 0.30f), 0.045f, D.BUTTON_START),
            // Stick clicks
            ControlSpec.ButtonZone("btn_l3", "L3", Vec2(0.26f, 0.48f), 0.045f, D.BUTTON_L3),
            ControlSpec.ButtonZone("btn_r3", "R3", Vec2(0.70f, 0.48f), 0.045f, D.BUTTON_R3),
            // Latching toggles along the very top
            ControlSpec.ToggleZone("tgl_1", "T1", Vec2(0.30f, 0.08f), 0.04f, D.BUTTON_TOGGLE_1),
            ControlSpec.ToggleZone("tgl_2", "T2", Vec2(0.40f, 0.08f), 0.04f, D.BUTTON_TOGGLE_2),
            ControlSpec.ToggleZone("tgl_3", "T3", Vec2(0.60f, 0.08f), 0.04f, D.BUTTON_TOGGLE_3),
            ControlSpec.ToggleZone("tgl_4", "T4", Vec2(0.70f, 0.08f), 0.04f, D.BUTTON_TOGGLE_4),
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
            ControlSpec.StickZone("stick_l", "Left stick", Vec2(0.17f, 0.55f), 0.10f, StickSide.LEFT),
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
