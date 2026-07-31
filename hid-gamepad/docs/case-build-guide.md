# Case build guide

End-to-end: from a bare phone to a physical controller. See
[case/README.md](../case/README.md) for the BOM and print settings; this
guide covers the process and the traps.

## Build order (app first — deliberately)

1. **Validate the app with thumbs.** Start the gamepad, pair with your PC
   (`joy.cpl` / `evtest` / gamepad-tester.com), play something. This
   retires the big unknowns — some OEM Android builds lack the HID Device
   profile entirely, and no case can fix that.
2. **Clip-on triggers on the bare phone.** Commodity capacitive triggers
   clamp any phone; map their contact points with the calibration flow.
   You now have physical triggers with zero printing.
3. **Mock the buttons.** Tape cardboard/foam over the screen with holes at
   your preferred button spots; run *Calibrate case* and play. Iterate
   placement while it costs nothing.
4. **Measure your phone** into `case/config.scad` (body w/h/t, corner
   radius, screen insets, camera bump, USB width, trigger clamp width,
   joystick base diameter).
5. **Print, assemble, calibrate, play.** Then export the measured control
   positions (*Profiles → Case config*) back into `config.scad` for a
   dimensionally perfect v2.

## Calibration flow (in the app)

*Connection → Calibrate case*. For each control the app prompts you to
press it: buttons/toggles/triggers are averaged over 3 presses (re-prompted
if the taps spread too far — finger slipped or a ghost touch); sticks are
captured as rest-center plus a full-circle sweep at max deflection. The
whole screen is a raw-touch visualizer during calibration: every contact
the firmware reports is drawn live.

## Palm rejection: the one big physical risk

Phone touch firmware silently drops contacts that look like a palm or a
resting object: **large, stationary, or long-duration**. There is no app
API to override this. The design works around it:

- Flexure buttons rest **≥1.5 mm off the glass** — contact only happens
  during an actual press, and 6 mm tips look like fingertips.
- The default toggle mode ("follow contact") assumes the slider holds its
  tip on the glass. **If your phone drops the held contact after a few
  seconds** (you'll see it vanish in the calibration visualizer), switch
  Settings → Case behavior → "Flip per tap": the slider then only needs a
  momentary tap and the app latches the button.
- Suction joysticks touch continuously; they're proven commercial products
  but behavior varies by phone. Test yours in the visualizer first.
- Keep the faceplate's screen-edge air gap ≥ 2 mm (`edge_air_gap`) or the
  case rim itself can register ghost edge touches.
- Most panels track ~10 simultaneous contacts; the calibration screen
  warns as you approach it (2 sticks + toggles held + fingers adds up).

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Button press registers nothing | Tip not conductive enough or not grounded — use real capacitive stylus tips; your skin must touch the cap (don't paint the caps) |
| Press registers at the wrong spot | Re-run calibration; check the frame hasn't shifted — snap it fully home |
| Held toggle turns itself off | Palm rejection dropped the contact → "flip per tap" mode |
| Trigger double-fires | Its clamp contact point overlaps a button zone — recalibrate or shrink zone radius in the mapping editor |
| Host sees a gamepad but no inputs | Windows descriptor cache — unpair, re-pair (docs/hid-descriptor.md) |
| Everything dies when screen locks | The foreground service should hold the link; check the app's notification is present and battery optimization is off for the app |

## Experimental: analog squeeze

Settings → Case behavior → *Analog squeeze* maps touch contact size to
trigger travel (soft dome tips press flatter as you squeeze). Android has
no true pressure sensor — many phones report a constant value, in which
case the app falls back to digital full-pull. Treat it as a toy, not a
mechanism to depend on; that's why the buttons are binary by design.
