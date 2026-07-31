package dev.hidgamepad.core.layout

import kotlinx.serialization.Serializable

@Serializable
enum class LayoutMode {
    /** Free-form on-screen gamepad: containment hit-testing, generous zones. */
    FREE,

    /**
     * Physical-case mode: zones are fixed contact points calibrated to the
     * printed case; nearest-center hit-testing within radius, no touch slop.
     */
    CASE,
}

/** Screen metadata captured when a profile is created/calibrated. */
@Serializable
data class ScreenInfo(
    val widthPx: Int,
    val heightPx: Int,
    /** Pixels per inch, used to convert normalized coords to millimetres. */
    val xdpi: Float,
    val ydpi: Float,
)

@Serializable
data class LayoutProfile(
    val name: String,
    val mode: LayoutMode,
    val controls: List<ControlSpec>,
    val screen: ScreenInfo? = null,
    val schemaVersion: Int = 1,
) {
    fun control(id: String): ControlSpec? = controls.firstOrNull { it.id == id }

    /** Duplicate button bindings are allowed; conflicting ids are not. */
    fun validate(): List<String> {
        val problems = mutableListOf<String>()
        val ids = controls.groupBy { it.id }.filterValues { it.size > 1 }.keys
        if (ids.isNotEmpty()) problems += "Duplicate control ids: $ids"
        controls.forEach { c ->
            val number = when (c) {
                is ControlSpec.ButtonZone -> c.buttonNumber
                is ControlSpec.ToggleZone -> c.buttonNumber
                else -> null
            }
            if (number != null && number !in 1..16) {
                problems += "Control ${c.id}: button number $number out of range 1..16"
            }
            if (c.radius <= 0f) problems += "Control ${c.id}: non-positive radius"
        }
        return problems
    }
}
