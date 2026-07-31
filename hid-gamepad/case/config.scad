// =============================================================================
// HID Gamepad case — user configuration
//
// THIS IS THE ONLY FILE YOU EDIT. All dimensions in millimetres.
//
// Coordinate system for control placement: X/Y measured from the SCREEN's
// top-left corner (phone held in landscape, USB port to the right), matching
// the app's "Case config" export — calibrate in the app, share the exported
// fragment, and paste the arrays below for a perfectly matched v2 print.
// =============================================================================

// ---- Phone body (defaults: Pixel 8-ish; measure your phone!) ---------------
phone_w = 150.5;   // phone height in portrait = width in landscape
phone_h = 70.8;    // phone width in portrait  = height in landscape
phone_t = 8.9;     // thickness, excluding camera bump
corner_r = 8;      // body corner radius

// Screen inset from the phone body edge: [left, top, right, bottom]
// (landscape orientation, same frame as control coordinates).
screen_inset = [3.0, 2.5, 3.0, 2.5];

// Camera bump keep-out on the BACK (landscape coords from body top-left).
camera_cutout = [5, 8, 28, 55];   // [x, y, width, height]

// USB port opening centred on the right edge (landscape).
usb_w = 14;

// ---- Frame construction -----------------------------------------------------
wall_t = 2.0;          // side wall thickness
face_t = 2.0;          // front faceplate thickness
back_t = 1.6;          // back tray thickness
grip_w = 22;           // grip wing width beyond the phone, each side
edge_air_gap = 2.0;    // faceplate stays this far clear of the screen edge
                       //   (>= 2 mm: prevents ghost edge touches)
tip_hover = 1.5;       // conductive tip rest height above the glass
clearance = 0.15;      // press-fit clearance
lip = 1.2;             // snap-over lip depth holding the phone

// ---- Flexure buttons (printed in place in the faceplate) --------------------
// [x_mm, y_mm, label] from screen top-left. Cap diameter/travel are global.
flex_buttons = [
    [124, 48, "A"],
    [133, 37, "B"],
    [115, 37, "X"],
    [124, 26, "Y"],
    [ 63, 11, "Select"],
    [ 81, 11, "Start"],
];
btn_cap_d = 11;        // button cap (island) diameter
btn_slot_w = 1.6;      // flexure slot width around the cap
btn_beam_n = 3;        // number of flexure beams
btn_beam_w = 2.4;      // beam width
flexure_t = 0.8;       // beam thickness (thinner = softer press)
tip_bore_d = 6.2;      // press-fit bore for 6 mm capacitive stylus tips

// ---- Toggle sliders ---------------------------------------------------------
// [x_mm, y_mm, label]; slider travels vertically (screen Y), ON = pressed down.
toggles = [
    [ 52, 6, "T1"],
    [ 92, 6, "T2"],
];
tgl_channel_w = 8;     // channel width
tgl_channel_l = 16;    // channel length (travel + slider body)
tgl_travel = 6;        // slider travel between OFF and ON detents

// ---- Off-the-shelf part mounts ---------------------------------------------
// Clip-on capacitive trigger pockets: gaps in the frame's TOP rim where a
// commercial "mobile game trigger" clamps the phone edge directly.
// [x_mm (screen coords), clamp_width_mm]
trigger_mounts = [
    [ 8, 22],
    [136, 22],
];

// Suction-cup joystick locating wells: open circles in the faceplate with a
// raised ring that keys the joystick base. [x_mm, y_mm, base_diameter_mm]
stick_wells = [
    [25, 39, 30],
];
stick_ring_h = 2.0;    // locating ring height above the faceplate
stick_ring_t = 1.6;    // locating ring wall thickness

// ---- Central viewing window -------------------------------------------------
// Open area in the middle of the faceplate (status text stays visible and
// fingers can reach the app's menu). [x, y, w, h] in screen coords.
window = [40, 18, 70, 40];

// ---- Print/quality ----------------------------------------------------------
$fn = 48;
