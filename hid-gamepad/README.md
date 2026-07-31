# HID Gamepad

Turn an Android phone into a complete Bluetooth game controller:

1. **[`app/`](app/)** — an Android app that registers the phone as a real
   Bluetooth HID gamepad (Classic HID Device profile). Works driverless
   with Windows, Linux, macOS, Android TV and other Android devices. Dual
   analog sticks, D-pad, 16 buttons, analog triggers, latching toggles,
   rich haptics, optional sounds, full remapping with savable profiles.
2. **[`case/`](case/)** — a parametric OpenSCAD phone case: one printed
   frame holding commodity mobile-gaming triggers/joysticks and
   printed-in-place capacitive flexure buttons that press the touchscreen.
3. **Accessibility** — motor, vision and hearing features, each an
   independent toggle. See [docs/accessibility.md](docs/accessibility.md).

## Quick start (app only — no case needed)

```bash
cd app
./gradlew assembleDebug          # needs the Android SDK
# or, on machines without the SDK / Google Maven access:
./gradlew -PcoreOnly :core:test  # pure-JVM HID core + tests
```

Install the APK (minSdk 28 — the `BluetoothHidDevice` API requires
Android 9+), open the app, grant Bluetooth permissions, **Start gamepad**,
**Make discoverable**, then pair from your PC/TV's Bluetooth settings.
Verify with `joy.cpl` (Windows), `evtest` (Linux) or
[gamepad-tester.com](https://gamepad-tester.com).

> Some OEM builds ship without the HID Device profile; the app detects
> this at startup and says so rather than failing silently. Note that only
> one app per phone can be the active HID device app.

## The physical case

The phone **is** the controller; the case adds real buttons on top of the
screen. Build order that works (and why):

1. Use the app with thumbs — validates pairing, latency, your host.
2. Clip commodity capacitive triggers onto the bare phone; play.
3. Run *Calibrate case* with cardboard mock-ups if you like.
4. Print `case/frame.stl`, assemble (~5 minutes), calibrate, play.
5. Optionally export measured control positions from the app back into
   `case/config.scad` and print a perfectly matched v2.

Details: [case/README.md](case/README.md) and
[docs/case-build-guide.md](docs/case-build-guide.md).

## Documentation

| Doc | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | App architecture, data flow, Bluetooth state machine, latency budget |
| [docs/hid-descriptor.md](docs/hid-descriptor.md) | Annotated HID report descriptor + byte-level report layout |
| [docs/case-build-guide.md](docs/case-build-guide.md) | Sourcing, printing, assembly, calibration, troubleshooting |
| [docs/accessibility.md](docs/accessibility.md) | Every accessibility feature and how it's implemented |

## Repository layout

```
hid-gamepad/
├── app/            Gradle root
│   ├── core/       Pure-JVM HID logic (descriptor, reports, input engine) + tests
│   └── app/        Android app (Bluetooth, UI, feedback, persistence)
├── case/           Parametric OpenSCAD case + render script
└── docs/           Architecture, HID, case build, accessibility docs
```

CI builds the app, runs the core tests, and headless-renders every OpenSCAD
part on each push touching `hid-gamepad/`.
