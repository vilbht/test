# assets/

Drop a replacement fox sprite sheet here as `fox.png`, then run the game with
`?art=sprite`.

The sheet must match `SPRITE_LAYOUT` in `../js/art/fox.js`:

| | |
|---|---|
| Sheet | 1536 × 576 (8 columns × 3 rows of 192 × 192 cells) |
| Anchor | **(64, 168)** within each cell — the fox's *feet-centre*, not its middle |
| Scale | 4 sheet pixels per world unit (the fox is ~34 world units tall) |
| Row 0 | `idle` — 4 frames, played at 5 fps |
| Row 1 | `run` — 8 frames, one full stride, played at ~15 fps |
| Row 2 | `air` — 4 frames: rise · apex · fall · land |

The anchor is the part worth getting right. The game positions the fox by its
feet, so art centred in the cell instead will look fine standing still and sink
into the floor the moment it moves.

**Body only.** The tail is a verlet chain that lengthens with speed and whips on
direction changes, and it is drawn by the game over the top of your frames. If
you would rather draw the tail yourself, construct the renderer with
`createSpriteFox(image, { includesTail: true })` and the simulated one is
suppressed. The contact shadow is drawn by the game either way.

Generate a fresh template any time with `tools/spritesheet.html`:

- plain — the current procedural fox, transparent, to paint over
- `?guides=1` — frame grid, ground line and anchor crosshairs
- `?empty=1` — guides only, to draw from scratch
