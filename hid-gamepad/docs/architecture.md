# App architecture

## Modules

- **`:core`** — pure JVM Kotlin, no Android. HID descriptor + report
  packing, gamepad state, input engine (modifier behavior), touch-routing
  math, calibration math, layout/profile model + JSON. Everything here is
  unit-tested and buildable without the Android SDK
  (`./gradlew -PcoreOnly :core:test`).
- **`:app`** — Android: Bluetooth transport + foreground service, Compose
  UI, feedback (haptics/sound), persistence (DataStore + JSON files).

## Data flow (touch → host)

```
MotionEvent (one full-screen handler)
  → TouchRouterCore   pointer-id → zone assignment, hit-testing
  → InputEngine       settings-driven modifiers, GamepadState mutation,
  │                   feedback dispatch (haptics + optional sound together)
  → gamepadState: StateFlow<GamepadState>       (AppContainer)
  ├→ Compose UI       draws from state (consumer — never gates sending)
  └→ HidDeviceService report loop: pack 9 bytes → dedupe (ReportGate)
      → HidTransport.sendReport (binder call, off the main thread)
```

Key decisions:

- **One full-screen pointer handler**, not per-control `clickable`s:
  Compose clickables add touch-slop latency and lose pointers that slide
  between zones (fatal for sticks). Load-bearing, not a style choice.
- **Send-on-change with conflation**: the report loop collects the state
  flow (StateFlow conflates to latest), dedupes identical payloads, and
  paces sends (~120 Hz). Release events always produce a final all-neutral
  report — inputs can never stick.
- **The engine lives in the process, the loop in the service**: latched
  toggles and the connection survive backgrounding (foreground service,
  type `connectedDevice`).

## Bluetooth state machine (`ClassicHidTransport`)

```
Idle → Registering → Registered → Connecting → Connected
  ↑        │              │           │            │
  └────────┴──── stack revokes / disconnect ───────┘
        (Unsupported is terminal until retry: no proxy / registerApp false)
```

Quirks handled (each burns hours if ignored):

- `registerApp` is async; nothing works before
  `onAppStatusChanged(registered=true)`. Android may unregister the app at
  any time (Bluetooth toggle, another HID app registering — only one HID
  app may be active per adapter). Surfaced as `Idle`, UI offers restart.
- `onGetReport` **must** be answered (`replyReport`/`reportError`) — some
  Windows stacks poll GET_REPORT during enumeration and drop the
  connection on silence. The transport keeps the last sent report to
  answer with.
- OEM builds may lack the profile entirely → `Unsupported` with a clear
  message; never a retry loop.
- Windows caches descriptors per bond → unpair/re-pair after descriptor
  changes (see docs/hid-descriptor.md).

## Accessibility integration (no UI forking)

One settings flow (`SettingsRepository`) consumed at seams:

1. **Engine**: sticky buttons, dead zone, sensitivity, long-press
   alternates, toggle mode — behavior switches inside `InputEngine`.
2. **Layout transform**: larger targets and one-handed condensing are the
   pure function `LayoutProfile.applyAccessibility(settings)` — router and
   UI never branch.
3. **Theme**: high contrast + label scale in `HidGamepadTheme`.
4. **Feedback**: haptic patterns per control type; sounds are dispatched
   only alongside haptics/visuals (structurally never the sole channel).
5. **Semantics are unconditional**: every control has a TalkBack
   description, state, and click action regardless of settings.

## Latency budget

Bluetooth Classic interrupt channel bounds end-to-end latency at roughly
10–25 ms. The app adds: zero-allocation packing (`packInto`), no main-thread
binder calls, UI as a state consumer. Don't add frames on top — if latency
regresses, look for accidental main-thread hops or per-event allocation.

## Future: BLE transport

`HidTransport` is deliberately tiny (`register/unregister/connect/
disconnect/sendReport/state`). A BLE HID-over-GATT (HOGP) implementation —
the route to iOS/iPadOS hosts — slots in behind it without touching input,
UI, or persistence code.
