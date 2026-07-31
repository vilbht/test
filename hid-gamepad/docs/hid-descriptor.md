# HID report descriptor

The gamepad presents one Application collection with a single 9-byte input
report (Report ID 1). It is the classic DirectInput-style layout, chosen
because every major host parses it without drivers: Windows (`joy.cpl`,
DirectInput; XInput-only titles need a mapper like x360ce/Steam Input),
Linux (`hid-generic` → evdev/js), macOS, Android.

Source of truth: `app/core/src/main/kotlin/dev/hidgamepad/core/hid/GamepadDescriptor.kt`
(locked by a golden-byte unit test).

## Annotated descriptor

```
05 01        Usage Page (Generic Desktop)
09 05        Usage (Gamepad)
A1 01        Collection (Application)
85 01          Report ID (1)
             ; --- 16 buttons: 2 bytes ---
05 09          Usage Page (Button)
19 01          Usage Minimum (Button 1)
29 10          Usage Maximum (Button 16)
15 00          Logical Minimum (0)
25 01          Logical Maximum (1)
75 01          Report Size (1)
95 10          Report Count (16)
81 02          Input (Data,Var,Abs)
             ; --- Hat switch (D-pad): low nibble + 4 bits padding ---
05 01          Usage Page (Generic Desktop)
09 39          Usage (Hat Switch)
15 00          Logical Minimum (0)
25 07          Logical Maximum (7)
35 00          Physical Minimum (0)
46 3B 01       Physical Maximum (315)
65 14          Unit (Degrees)
75 04          Report Size (4)
95 01          Report Count (1)
81 42          Input (Data,Var,Abs,Null State)
65 00          Unit (None)
75 04          Report Size (4)
95 01          Report Count (1)
81 03          Input (Const,Var,Abs)          ; padding
             ; --- Sticks: X/Y (left), Z/Rz (right), signed 8-bit ---
09 30          Usage (X)
09 31          Usage (Y)
09 32          Usage (Z)
09 35          Usage (Rz)
15 81          Logical Minimum (-127)
25 7F          Logical Maximum (127)
75 08          Report Size (8)
95 04          Report Count (4)
81 02          Input (Data,Var,Abs)
             ; --- Analog triggers: Rx/Ry, unsigned 8-bit ---
09 33          Usage (Rx)
09 34          Usage (Ry)
15 00          Logical Minimum (0)
26 FF 00       Logical Maximum (255)
75 08          Report Size (8)
95 02          Report Count (2)
81 02          Input (Data,Var,Abs)
C0           End Collection
```

## Input report payload (9 bytes)

Passed to `BluetoothHidDevice.sendReport(device, 1, data)`; the Bluetooth
HID layer adds its own framing.

| Byte | Content |
|---|---|
| 0 | Buttons 1–8, button 1 = bit 0 (LSB-first) |
| 1 | Buttons 9–16 |
| 2 | Low nibble: hat 0–7 (0 = N, clockwise 45° steps), **8 = neutral** (null value). High nibble: 0 |
| 3 | X — left stick horizontal, signed, +right |
| 4 | Y — left stick vertical, signed, **+down** (HID convention) |
| 5 | Z — right stick horizontal |
| 6 | Rz — right stick vertical |
| 7 | Rx — left trigger, 0 released … 255 full pull |
| 8 | Ry — right trigger |

## Button assignment convention

| Buttons | Role |
|---|---|
| 1–4 | Face buttons A / B / X / Y |
| 5, 6 | Shoulders LB / RB |
| 7, 8 | Digital mirrors of the analog triggers |
| 9, 10 | Select / Start |
| 11, 12 | Stick clicks L3 / R3 |
| 13–16 | Toggles (latched **in the app** — hosts have no latch concept, so a toggle is just a button that stays held) |

Everything is remappable in the app; this is only the default.

## Change discipline

Changing the descriptor changes what hosts see, and **Windows caches HID
descriptors per bonded device** — after any descriptor change you must
unpair and re-pair on the host or you'll chase ghosts for hours. The
golden-byte unit test (`GamepadDescriptorTest`) exists to make descriptor
changes deliberate, and this file must be updated alongside.

## SDP / registration

Registered via `BluetoothHidDeviceAppSdpSettings(name, description,
provider, SUBCLASS2_GAMEPAD, descriptor)` with a best-effort outgoing QoS
(latency 11250 µs, token rate sized for 9-byte reports at ~90 Hz). See
`ClassicHidTransport.kt`.
