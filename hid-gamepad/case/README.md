# HID Gamepad — 3D-printed case

A parametric, **simplicity-first** phone case that turns the [HID Gamepad
app](../app/) into a physical controller: a single printed frame holds
commodity mobile-gaming accessories and printed-in-place flexure buttons
whose conductive tips actuate the touchscreen.

Design goals: **one main part, one material, one print, no supports** —
assembly is press-fitting purchased tips and clipping in purchased modules.

## Bill of materials (all commodity items)

| Part | Qty | Typical price | Notes |
|---|---|---|---|
| Clip-on capacitive game triggers ("L1R1 / PUBG triggers") | 1 pair | $2–5 | Any brand that clamps the phone edge; the frame leaves rim gaps for them |
| Suction-cup screen joystick (Fling-mini style) | 1 | $3–8 | Base diameter goes in `stick_wells` |
| Capacitive stylus replacement tips, ~6 mm | 1 per button/toggle | pennies | Press-fit into `tip_bore_d` bores |
| Conductive foam (optional) | — | pennies | Alternative tip material; cut ~6 mm plugs |
| PETG or PLA filament | ~60 g | — | Frame + sliders |

Brands vary dimensionally: measure your trigger clamp width and joystick
base diameter and set them in `config.scad` (`trigger_mounts`,
`stick_wells`). The app's calibration flow absorbs positional variance, so
a couple of millimetres of drift never breaks anything.

## Printing

1. Edit **`config.scad`** — the only file you touch:
   - phone dimensions (`phone_w/h/t`, `corner_r`, `screen_inset`)
   - control placements in **mm from the screen's top-left corner,
     landscape**. After calibrating in the app, use *Profiles → Case
     config* to export these arrays measured on your actual phone.
2. Render: `./render.sh` (needs the `openscad` CLI), or open `frame.scad`
   in the OpenSCAD GUI and press F6/F7. Parts land in `build/`.
3. Print settings:
   - `frame.stl`: face-down (faceplate on the bed), 0.2 mm layers, 3 walls,
     no supports. PETG recommended (flexure fatigue life); PLA works.
   - `toggle_slider.stl` (one per toggle): 0.2 mm layers, 100% infill.
4. Assembly:
   - Push a stylus tip into each button boss and slider bore from the
     screen side. The tip face must rest ~1.5 mm off the glass (`tip_hover`).
   - Drop the sliders into their channels.
   - Snap the phone in, clip the triggers into their rim gaps, stick the
     joystick onto the glass inside its locating ring.
5. In the app: *Connection → Calibrate case*, press each control as
   prompted, save. Optionally export the measured positions back into
   `config.scad` and reprint a perfectly matched v2.

## How the buttons work

Your finger grounds the printed cap; pressing flexes the three beams cut
into the faceplate (`flexure_slot`) until the conductive tip touches the
glass — a normal capacitive touch at a known, calibrated spot. Releasing
springs the tip back off the glass, so nothing rests on the screen (phones
reject large stationary contacts — see the palm-rejection notes in
[docs/case-build-guide.md](../docs/case-build-guide.md)).

Toggle sliders latch mechanically: ON cams the tip down and holds it on the
glass (app toggle mode "follow contact"), OFF lifts it clear. If your
phone's touch firmware drops long-held contacts, switch the app to
"flip per tap" mode — then the slider only needs to tap.

## Files

| File | Purpose |
|---|---|
| `config.scad` | All parameters — the only file users edit |
| `frame.scad` | The main print: frame, flexure buttons, channels, mounts |
| `toggle_slider.scad` | Latching toggle slider (separate small print) |
| `assembly.scad` | Preview of frame + sliders (not printable) |
| `lib/common.scad` | Shared modules (rounded boxes, flexure slot, bosses) |
| `render.sh` | Batch STL/preview export; also used by CI as a validity check |
