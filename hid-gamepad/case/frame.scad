// =============================================================================
// frame.scad — the main (usually only) print.
//
// One-piece snap-on frame for the phone, landscape orientation:
//  - back tray + side walls with snap lip, grip wings left and right
//  - front faceplate hovering edge_air_gap+tip_hover above the glass
//  - printed-in-place flexure buttons with press-fit stylus-tip bosses
//  - toggle slider channels (sliders printed separately: toggle_slider.scad)
//  - rim gaps where clip-on capacitive triggers clamp the phone edge
//  - locating rings for suction-cup screen joysticks
//  - central viewing window
//
// Printed face-down (faceplate on the bed): no supports needed.
// =============================================================================

include <config.scad>
use <lib/common.scad>

// Derived. Grip wings extend along the long axis (left/right in landscape).
frame_w = phone_w + 2 * (wall_t + grip_w);
frame_h = phone_h + 2 * wall_t;
total_t = back_t + phone_t + face_gap();       // tray + phone + face standoff

function face_gap() = edge_air_gap;            // faceplate underside above glass

// Screen origin (top-left of the glass) in frame coordinates.
function screen_x0() = wall_t + grip_w + screen_inset[0];
function screen_y0() = wall_t + screen_inset[1];

// Convert screen coords (x right, y down) to frame coords (y up).
function sx(x) = screen_x0() + x;
function sy(y) = frame_h - (screen_y0() + y);

face_z = back_t + phone_t + face_gap();        // faceplate underside Z

module frame() {
    difference() {
        union() {
            frame_body();
            stick_rings();
            button_bosses();
        }
        phone_cavity();
        faceplate_openings();
        trigger_rim_gaps();
        usb_opening();
        camera_opening();
    }
}

module frame_body() {
    union() {
        // Tray + walls up to the faceplate top
        rounded_box(frame_w, frame_h, face_z + face_t, corner_r + wall_t);
    }
}

module phone_cavity() {
    // Phone pocket, open at the back rim with a snap lip
    translate([wall_t + grip_w - clearance, wall_t - clearance, back_t])
        rounded_box(
            phone_w + 2 * clearance,
            phone_h + 2 * clearance,
            phone_t + 2 * clearance,
            corner_r
        );
    // Air volume between glass and faceplate (leaves bosses hanging into it)
    translate([wall_t + grip_w + lip, wall_t + lip, back_t + phone_t])
        rounded_box(
            phone_w - 2 * lip,
            phone_h - 2 * lip,
            face_gap() + 0.01,
            corner_r
        );
}

module faceplate_openings() {
    // Central viewing window
    translate([sx(window[0]), sy(window[1]) - window[3], face_z - 1])
        linear_extrude(face_t + 2)
            rounded_rect(window[2], window[3], 3);

    // Flexure slots around each button cap
    for (b = flex_buttons) {
        translate([sx(b[0]), sy(b[1]), face_z])
            flexure_slot(btn_cap_d, btn_slot_w, btn_beam_n, btn_beam_w, face_t);
    }

    // Toggle channels (slider travels along screen-Y)
    for (t = toggles) {
        translate([sx(t[0]) - tgl_channel_w / 2, sy(t[1]) - tgl_channel_l, face_z - 1])
            cube([tgl_channel_w, tgl_channel_l, face_t + 2]);
    }

    // Stick well openings (suction cup passes through to the glass)
    for (s = stick_wells) {
        translate([sx(s[0]), sy(s[1]), face_z - 1])
            cylinder(h = face_t + stick_ring_h + 2, d = s[2] + 2 * clearance);
    }
}

module stick_rings() {
    for (s = stick_wells) {
        translate([sx(s[0]), sy(s[1]), face_z + face_t])
            difference() {
                cylinder(h = stick_ring_h, d = s[2] + 2 * (clearance + stick_ring_t));
                translate([0, 0, -0.1])
                    cylinder(h = stick_ring_h + 0.2, d = s[2] + 2 * clearance);
            }
    }
}

module button_bosses() {
    // Boss under each button cap carrying the conductive tip; tip face rests
    // tip_hover above the glass.
    boss_h = face_gap() - tip_hover;
    for (b = flex_buttons) {
        translate([sx(b[0]), sy(b[1]), face_z])
            tip_boss(tip_bore_d + 2.4, tip_bore_d, boss_h, boss_h - 0.8);
    }
}

module trigger_rim_gaps() {
    // Openings along the TOP edge so commercial clip-on triggers can clamp
    // the bare phone edge (they need direct grip on the phone body).
    for (m = trigger_mounts) {
        translate([sx(m[0]) - m[1] / 2, frame_h - wall_t - 1, -1])
            cube([m[1], wall_t + 2, total_t + face_t + 2]);
    }
}

module usb_opening() {
    // Right edge, centred vertically
    translate([frame_w - wall_t - grip_w - 1, frame_h / 2 - usb_w / 2, back_t])
        cube([grip_w + wall_t + 2, usb_w, phone_t]);
}

module camera_opening() {
    // Back tray keep-out for the camera bump
    translate([wall_t + grip_w + camera_cutout[0], frame_h - wall_t - camera_cutout[1] - camera_cutout[3], -1])
        cube([camera_cutout[2], camera_cutout[3], back_t + 2]);
}

frame();
