# The Quiet Web

A calm one-button descent. You ride a fox down a mountainside from first light to
night, lighting campfires and shaking off ad-trackers.

**Nothing here can kill you.** No health, no lives, no fail state. Fall into a
chasm and you are lifted out on the far lip with everything you had. The only
currency is momentum: rocks and clinging trackers take speed away, clean landings
and grinds give it back.

## Run it

```sh
cd quiet-web
python3 -m http.server 8000
# open http://localhost:8000
```

No build step and no install. The game is native ES modules loaded straight from
disk — it needs a server only because browsers refuse module imports over
`file://`.

| | |
|---|---|
| <kbd>Space</kbd> / click / tap | tap to jump |
| hold it in the air | backflip |
| <kbd>M</kbd> | mute |
| <kbd>`</kbd> | physics debug overlay |

That is the whole control scheme. **Speed is the slope, not a button** — a long
descent winds you up and a rise bleeds you out. Land a flip to shake off any
trackers riding along, and pass a campfire to light it.

`?seed=42` builds a different mountain.

## Tests

```sh
node --test test/*.test.mjs      # 63 unit tests, no install
node tools/bundle.mjs            # → dist/quiet-web.html
node tools/smoke.mjs http://localhost:8000/index.html   # needs Playwright
```

`tools/preview.html` renders a riding pose sheet for iterating on the fox
without playing to the pose you want to look at.

## How it is built

```
core/     pure, DOM-free simulation — unit tested, no canvas required
  terrain.mjs   the heightfield: sine octaves, launch ramps, chasms
  ride.mjs      momentum, launches, backflips, grinding, chasm recovery
  level.mjs     placement: coins, campfires, rocks, rails, trackers
  daylight.mjs  the day/night cycle
  rules.mjs     scoring, tracker cling, what a landed trick is worth
  verlet.mjs    soft-body solver, drives the fox's tail
  springs.mjs   critically-damped secondary motion
  physics.mjs   the fixed-timestep clock
  facts.mjs     the nine privacy facts
js/       rendering and glue — main.js is the only file that touches the DOM
test/     node --test
tools/    bundler, smoke test, pose sheet
```

### The mountain is a function, not a mesh

The surface is a sum of sine octaves over a descending baseline, sampled
analytically — no stored samples, no interpolation, exact at any x. Its first and
second derivatives are exact too, which matters more than it sounds: the rider
reads the gradient every step for acceleration and landing alignment, and the
curvature to decide when it leaves the ground.

What gets budgeted across those octaves is *gradient*, not amplitude. An octave
contributes `amp × freq` to the slope, so halving both together contributes
exactly as much tilt as the octave above it — the first attempt did that across
five octaves and produced a 65° mountainside built from ripples too small to see.

Launching is stated as physics rather than as a step comparison: contact ends when
the centripetal demand of following the surface, `v²·κ`, exceeds the gravity
holding the fox down, `g·cos θ`. There is no timestep in that, so the ride would
not change if the fixed step ever did.

### Chasms are validated by playing them

Whether a gap is fair depends on the speed the fox arrives with, and that is a
running total of everything upstream — not something the local gradient knows.
Two attempts to predict it were not good enough, so the generator stopped
predicting: it rides the finished mountain exactly as the game asks to be played,
shrinks whatever the fox actually fell into, and rides again until a full descent
comes back clean. That costs about 20ms per level and makes the guarantee real
rather than statistical.

`test/descent.test.mjs` then drives a bot down twenty whole mountains, because
piecewise invariants can all hold while a descent is still miserable to ride.

### Everything is drawn and synthesised

No image or audio assets. The fox, the mountain and the score are all generated at
runtime — the fox from filled vector shapes, the scenery from an integer hash of
world position, and the music from a slow random walk over a pentatonic scale
whose root drops as the light fades. Each campfire adds a sustained voice, so by
the valley floor you have assembled the chord yourself.

Fox rendering sits behind a swappable interface; a `SpriteFox` reading real art
would replace `ProceduralFox` by changing one line of `js/main.js`.

## Accuracy

The nine facts are written to be true as stated, with no implied absolute that a
browser feature cannot deliver. Private browsing does not make you anonymous,
HTTPS hides contents rather than destinations, and DNS-over-HTTPS moves who can
see your lookups rather than eliminating them. If something reads as overstated,
that is a bug.

## Credit

Owes its whole shape to [Alto's Adventure](http://www.altosadventure.com/) —
the endless descent, the one-button trick system, the flat silhouettes and the
day/night cycle. This is a personal homage, not a clone of its code.

The fox is Mozilla's mascot and Firefox is Mozilla's trademark. This is a fan
project, not affiliated with or endorsed by Mozilla, and not intended for
distribution as a product.
