# The Quiet Web

A calm 2.5D side-scroller. You play a fox running east through a dusk world,
lighting privacy beacons and dispersing ad-trackers.

**Nothing here can kill you.** There is no health, no lives and no fail state.
Fall into a gap and you are lifted back onto the path with everything you had.
The only pressure is friction: trackers cling to you and slow you down until you
shake them off with a shield pulse.

## Run it

```sh
cd quiet-web
python3 -m http.server 8000
# open http://localhost:8000
```

No build step and no install. The game is native ES modules loaded straight from
disk — it needs a server only because browsers refuse module imports over
`file://`.

| Key | |
|---|---|
| <kbd>←</kbd> <kbd>→</kbd> | run |
| <kbd>Space</kbd> | jump — hold for height |
| <kbd>↓</kbd> | drop through a ledge |
| <kbd>Shift</kbd> | shield pulse — the fox spins into the Firefox mark and back |
| <kbd>M</kbd> | mute |
| <kbd>`</kbd> | physics debug overlay |

`?seed=42` generates a different world. `?art=grey` swaps the fox for flat
boxes, which is how the movement was tuned before any art existed.

## Tests

```sh
node --test test/*.test.mjs      # 59 unit tests, no install
node tools/bundle.mjs            # → dist/quiet-web.html
node tools/smoke.mjs http://localhost:8000/index.html   # needs Playwright
```

`tools/preview.html` renders a fox pose sheet for iterating on the art without
playing to the pose you want to look at.

## How it is built

```
core/     pure, DOM-free simulation — unit tested, no canvas required
  physics.mjs   fixed-step integrator, kinematic controller, swept AABB
  verlet.mjs    soft-body solver, shared by the fox's tail and the vines
  springs.mjs   critically-damped secondary motion
  bodies.mjs    wind fields, see-saw planks, pushable crates
  level.mjs     seeded generation for the three zones
  rules.mjs     focus, tracker cling, beacon charging
  spin.mjs      timing for the shield-pulse flourish
  facts.mjs     the nine privacy facts
js/       rendering and glue — main.js is the only file that touches the DOM
test/     node --test
tools/    bundler, smoke test, art pose sheet
```

### The physics is hand-rolled, on purpose

No Matter.js, no Rapier. Three reasons, in order of weight:

1. **A rigid-body solver makes platformers feel wrong.** Friction-driven
   characters slide, snag on seams and feel floaty. Well-regarded 2D platformers
   use a bespoke *kinematic* controller; hand-rolling is the quality choice here,
   not the compromise.
2. **The shipped artifact is one file** under a CSP that blocks every external
   host.
3. **Testability.** Pure `.mjs` modules are directly importable by `node --test`.

Jump feel is derived rather than guessed. From a target 90px peak and 0.34s to
apex, `v0 = 2h/t` and `g = 2h/t²` give the constants in `TUNING`, with heavier
gravity on the way down because asymmetric arcs read as weighty. That fixes a
level constraint — a maximum safe gap of 99px — which the generator treats as
the upper bound of its gap range, so an uncrossable gap is *unrepresentable*
rather than merely unlikely.

The strongest test in the suite is `test/playable.test.mjs`: a bot drives forty
whole generated levels end to end. Piecewise invariants can all hold while a
level is still impassable somewhere, and the bot is what catches that.

### Everything is drawn and synthesised

There are no image or audio assets. The fox, the scenery and the score are all
generated at runtime — the fox from filled vector shapes with gradients doing
the shading, the scenery from an integer hash of world position, and the music
from a slow random walk over a pentatonic scale. Each beacon you light adds a
sustained voice, so by the end of a run you have assembled the chord yourself.

Fox rendering sits behind a swappable interface. `ProceduralFox` ships today,
`createSpriteFox` takes over the moment a sheet is dropped into `assets/` — see
`assets/README.md` for the layout, and `tools/spritesheet.html` to generate a
template.

The shield pulse spins the fox into the Firefox mark and unwinds back out of it.
The mark is drawn procedurally in the tail's own gradient rather than traced, so
the flame reads as the same fire the fox is trailing. Motion blur is the subject
redrawn along the arc it swept since the last frame — no filters, and the smear
covers exactly the angles actually travelled, so it thickens and thins with the
spin on its own.

## Accuracy

The nine facts are written to be true as stated, with no implied absolute that a
browser feature cannot actually deliver. Private browsing does not make you
anonymous, HTTPS hides contents rather than destinations, and DNS-over-HTTPS
moves who can see your lookups rather than eliminating them. If you spot
something overstated, that is a bug.

## Credit

The fox is Mozilla's mascot and Firefox is Mozilla's trademark. The mark drawn
during the shield pulse is an evocation of it, not a reproduction. This is a
personal fan project, not affiliated with or endorsed by Mozilla, and is not
intended for distribution as a product.
