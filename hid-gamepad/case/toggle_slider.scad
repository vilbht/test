// =============================================================================
// toggle_slider.scad — latching toggle slider (print one per toggle).
//
// Rides in the faceplate channel. Sliding to ON cams the conductive tip
// down onto the glass and detents hold it there; OFF lifts it clear.
// The app's default toggle mode ("follow contact") mirrors this latch; the
// "flip per tap" mode suits sliders that only tap the glass momentarily.
//
// Assembly: push a 6 mm capacitive stylus tip into the bore, drop the slider
// into the channel from above, then clip the keeper tab.
// =============================================================================

include <config.scad>
use <lib/common.scad>

slider_l = tgl_channel_l - tgl_travel - 0.6;
slider_w = tgl_channel_w - 2 * clearance;
body_t = face_t;                       // sits flush with the faceplate
ramp = 1.2;                            // cam drop toward ON

module toggle_slider() {
    union() {
        // Body with thumb ridge
        cube([slider_w, slider_l, body_t]);
        translate([slider_w / 2, slider_l * 0.7, body_t])
            scale([1, 1.8, 0.8]) cylinder(h = 1.6, d = slider_w * 0.7);

        // Retaining wings (slide under the faceplate); overlap the body so
        // the part is a single manifold volume.
        for (x = [-1.2, slider_w - 0.2]) {
            translate([x, 1, -1.0]) cube([1.4, slider_l - 2, 1.4]);
        }

        // Tip carrier arm at the leading edge: flexes down the cam ramp
        translate([slider_w / 2, 0, 0]) {
            difference() {
                translate([0, 0, -ramp]) cylinder(h = body_t + ramp, d = tip_bore_d + 2.4);
                translate([0, 0, -ramp - 0.1]) cylinder(h = body_t + ramp - 0.6, d = tip_bore_d);
            }
        }

        // Detent bumps (engage matching channel edges at OFF and ON);
        // embedded slightly so they fuse with the body.
        for (y = [2, slider_l - 2]) {
            translate([slider_w / 2, y, body_t - 0.4]) sphere(d = 1.6);
        }
    }
}

toggle_slider();
