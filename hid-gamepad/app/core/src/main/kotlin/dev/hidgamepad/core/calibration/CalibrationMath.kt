package dev.hidgamepad.core.calibration

import dev.hidgamepad.core.layout.Vec2
import kotlin.math.sqrt

/**
 * Pure math for the case-calibration flow: averaging repeated contact
 * positions for a plunger, and fitting a stick's travel extent from a
 * full-circle sweep.
 */
object CalibrationMath {

    /** Average of repeated contact points for one physical control. */
    fun centroid(samples: List<Vec2>): Vec2 {
        require(samples.isNotEmpty())
        var sx = 0f
        var sy = 0f
        samples.forEach { sx += it.x; sy += it.y }
        return Vec2(sx / samples.size, sy / samples.size)
    }

    /**
     * Jitter check: max distance of any sample from the centroid. The UI
     * re-prompts when this exceeds a threshold (finger slipped, ghost touch).
     */
    fun maxSpread(samples: List<Vec2>): Float {
        val c = centroid(samples)
        return samples.maxOf { dist(it, c) }
    }

    /**
     * Fits a stick's travel radius from a full-deflection circular sweep.
     * Uses the 90th-percentile distance from the rest center so a couple of
     * dropped/ghost samples can't inflate the radius.
     */
    fun fitTravelRadius(restCenter: Vec2, sweepSamples: List<Vec2>): Float {
        require(sweepSamples.isNotEmpty())
        val distances = sweepSamples.map { dist(it, restCenter) }.sorted()
        val idx = ((distances.size - 1) * 0.9f).toInt()
        return distances[idx]
    }

    private fun dist(a: Vec2, b: Vec2): Float {
        val dx = a.x - b.x
        val dy = a.y - b.y
        return sqrt(dx * dx + dy * dy)
    }
}
