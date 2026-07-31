package dev.hidgamepad.core.calibration

import dev.hidgamepad.core.layout.Vec2
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CalibrationMathTest {

    @Test
    fun centroidAveragesJitter() {
        val c = CalibrationMath.centroid(
            listOf(Vec2(0.50f, 0.50f), Vec2(0.52f, 0.48f), Vec2(0.48f, 0.52f)),
        )
        assertEquals(0.50f, c.x, 1e-4f)
        assertEquals(0.50f, c.y, 1e-4f)
    }

    @Test
    fun maxSpreadFlagsSlippedSample() {
        val tight = CalibrationMath.maxSpread(listOf(Vec2(0.5f, 0.5f), Vec2(0.505f, 0.5f)))
        assertTrue(tight < 0.01f)
        val slipped = CalibrationMath.maxSpread(listOf(Vec2(0.5f, 0.5f), Vec2(0.6f, 0.5f)))
        assertTrue(slipped > 0.04f)
    }

    @Test
    fun travelRadiusIgnoresOutliers() {
        val rest = Vec2(0.5f, 0.5f)
        // 19 samples at distance 0.1, one ghost at 0.4
        val sweep = (0 until 19).map { i ->
            val angle = 2 * Math.PI * i / 19
            Vec2(0.5f + 0.1f * Math.cos(angle).toFloat(), 0.5f + 0.1f * Math.sin(angle).toFloat())
        } + Vec2(0.9f, 0.5f)
        val r = CalibrationMath.fitTravelRadius(rest, sweep)
        assertEquals(0.1f, r, 0.01f)
    }
}
