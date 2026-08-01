# assets/

Drop a replacement fox sprite sheet here as `fox.png`, then run the game with
`?art=sprite`.

The sheet must match `SPRITE_LAYOUT` in `../js/art/fox.js`:

| | |
|---|---|
| Sheet | 2048 × 1280 (8 columns × 5 rows of 256 × 256 cells) |
| Anchor | **(96, 224)** within each cell — the fox's *feet-centre*, not its middle |
| Scale | 4 sheet pixels per world unit (the fox is ~34 world units tall) |
| Row 0 | `idle` — 4 frames, played at 5 fps |
| Row 1 | `walk` — 8 frames, one full stride, played at ~10 fps |
| Row 2 | `run` — 8 frames, one full stride, played at ~15 fps |
| Row 3 | `air` — 4 frames: rise · apex · fall · land |
| Row 4 | `pulse` — 4 frames of the shift flourish, deepest brace first |

The anchor is the part worth getting right. The game positions the fox by its
feet, so art centred in the cell instead will look fine standing still and sink
into the floor the moment it moves.

**What each row is for.** `walk` and `run` are separate rows rather than one
cycle played faster because they are different gaits: the walk keeps its feet
down two-thirds of the cycle and carries its head level, the run spends most of
the cycle airborne with the head lowered and the ears swept back. `air` is the
jump, and its three flight frames have to be distinct at a glance — gathered
going up, tucked at the top, forelegs reaching on the way down. `pulse` is the
shift powerup: the fox drops onto its haunches and throws its head back before
the spin, and that gathering is the anticipation the flourish needs. `blocking`
runs 1 → 0 across the pulse, so cell 0 is the deepest crouch and cell 3 is
nearly recovered.

Rows the game asks for but your sheet omits fall back sensibly — a missing
`walk` row means the run cycle is used at both speeds, and a missing `pulse` row
means the flourish plays from whatever gait the fox was in.

**Body only.** The tail is a verlet chain that lengthens with speed and whips on
direction changes, and it is drawn by the game over the top of your frames. If
you would rather draw the tail yourself, construct the renderer with
`createSpriteFox(image, { includesTail: true })` and the simulated one is
suppressed. The contact shadow is drawn by the game either way.

Generate a fresh template any time with `tools/spritesheet.html`:

- plain — the current procedural fox, transparent, to paint over
- `?guides=1` — frame grid, ground line and anchor crosshairs
- `?empty=1` — guides only, to draw from scratch
