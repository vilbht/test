// Shared modules for the HID Gamepad case.

// Rounded-corner box, flat in Z.
module rounded_box(w, h, t, r) {
    hull() {
        for (x = [r, w - r], y = [r, h - r]) {
            translate([x, y, 0]) cylinder(h = t, r = r);
        }
    }
}

// 2D rounded rectangle.
module rounded_rect(w, h, r) {
    hull() {
        for (x = [r, w - r], y = [r, h - r]) {
            translate([x, y]) circle(r);
        }
    }
}

// Annular flexure slot: full ring minus n bridge tabs (the beams).
// Cut this THROUGH a plate to create a printed-in-place button.
module flexure_slot(cap_d, slot_w, beam_n, beam_w, t) {
    difference() {
        // The ring
        translate([0, 0, -0.1]) difference() {
            cylinder(h = t + 0.2, d = cap_d + 2 * slot_w);
            translate([0, 0, -0.1]) cylinder(h = t + 0.4, d = cap_d);
        }
        // Beam bridges left in place
        for (i = [0 : beam_n - 1]) {
            rotate([0, 0, i * 360 / beam_n])
                translate([-beam_w / 2, 0, -0.2])
                    cube([beam_w, cap_d / 2 + slot_w + 1, t + 0.6]);
        }
    }
}

// Boss with a blind press-fit bore, hanging below z=0.
module tip_boss(boss_d, bore_d, boss_h, bore_h) {
    difference() {
        translate([0, 0, -boss_h]) cylinder(h = boss_h, d = boss_d);
        translate([0, 0, -boss_h - 0.1]) cylinder(h = bore_h + 0.1, d = bore_d);
    }
}
