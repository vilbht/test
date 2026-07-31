# Accessibility

Every feature below is an independent toggle in **Settings** (changes apply
instantly, no restart). Screen-reader support and the "no sound-only
information" rule are structural — always on, not settings.

## Motor

| Feature | What it does | Where |
|---|---|---|
| Sticky buttons | Tap latches a button, second tap releases — no holding required | `StickyButtons` path in `InputEngine` |
| Dead zone | Radial stick dead zone, adjustable 0–50% | `InputEngine.applyStick` |
| Sensitivity | Axis gain after the dead zone (0.5×–2.5×) — full deflection with less thumb travel | same |
| Long-press alternates | Holding a button past a threshold presses its alternate binding instead — replaces simultaneous-press chords | `InputEngine` pending/long-press logic |
| One-handed layout | Condenses the whole layout into the left or right reachable half | `LayoutProfile.applyAccessibility` |
| Larger targets | Scales every touch zone up to 2× | same |
| Full remapping | Any zone → any HID button; profiles savable/shareable | Mapping screen |

## Vision

| Feature | What it does |
|---|---|
| High contrast | Maximum-contrast palette (yellow/cyan on black), thick outlines; pressed state changes fill, never hue alone |
| Large labels | 1.6× control labels |
| Haptic button identity | Face button N pulses N times — controls are identifiable by feel, playable eyes-free |
| TalkBack (always on) | Every control exposes name, role, state (toggles: on/off) and an activate action; connection changes are announced via live regions |

## Hearing

No information is conveyed by sound alone, structurally: `SoundController`
is only ever invoked in the same dispatch as haptic + visual feedback
(`AppContainer`'s engine listener), and sounds ship disabled by default.
Connection state is always visible as text and announced haptically on
press feedback.

## Physical case

The case itself is an accessibility device: real buttons with tactile
travel, latching toggles that hold their state physically, and commodity
triggers with mechanical levers. Combined with sticky buttons and haptic
identity, the pad is operable without vision and without sustained
pressure.
