// Preview-only: frame plus toggle sliders in place. Not for printing.

include <config.scad>
use <frame.scad>
use <toggle_slider.scad>

frame();

// Sliders shown in their channels (OFF position).
// Note: OpenSCAD `use` does not export functions, so slider placement here
// is computed inline — this file is only for a quick visual sanity check.
for (t = toggles) {
    translate([
        wall_t + grip_w + screen_inset[0] + t[0] - (tgl_channel_w - 2 * clearance) / 2,
        (phone_h + 2 * wall_t) - (wall_t + screen_inset[1]) - t[1] - tgl_channel_l + 0.3,
        back_t + phone_t + edge_air_gap,
    ])
        toggle_slider();
}
