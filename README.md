# VeloFit — Bike Fit Analyzer

A browser-based bike fitting app inspired by [MyVeloFit](https://www.myvelofit.com/).
Point a webcam at yourself side-on while pedalling on a trainer and VeloFit
performs **markerless pose detection** in the browser, measures your joint
angles over the pedal stroke, and gives **fit recommendations** for several
cycling disciplines. Sessions are saved locally so you can compare changes
over time.

## Features

- **Live webcam pose tracking** — MediaPipe Pose Landmarker runs entirely in
  your browser; nothing is uploaded.
- **Joint-angle measurement** — knee, hip, torso (back), elbow, shoulder and
  ankle angles, sampled at the key points of the pedal stroke.
- **Discipline-aware fit model** — Road, TT/Triathlon, Mountain and Gravel,
  each with its own target ranges.
- **Recommendations** — concrete, prioritised adjustments (saddle height,
  front-end height, reach/drop) with the rationale behind each.
- **Reports & history** — save sessions to the browser and review past results.

## Running it

The app is fully static. Because webcams require a secure context, serve it
over `http://localhost` (allowed) or HTTPS:

```bash
# from the repo root
python3 -m http.server 8000
# then open http://localhost:8000
```

Allow camera access when prompted. An internet connection is needed on first
load to fetch the MediaPipe model and WASM runtime from the CDN.

## How to capture a good reading

1. Put the bike on a trainer and place the camera **directly to the side**,
   ~2–3 m away at roughly hip height. Keep your whole body in frame.
2. Choose your discipline, tap **Start camera**, then **Record** and pedal at a
   steady cadence for 15 seconds.
3. Review the measured angles vs. target ranges and the recommendations, then
   **Save to history**.

## Project structure

```
index.html        UI shell (Capture / History / About tabs)
css/styles.css    Styling
js/pose.js        MediaPipe Pose Landmarker wrapper
js/angles.js      Landmark indices + joint-angle geometry
js/fitModel.js    Per-discipline target ranges + recommendation engine
js/storage.js     localStorage-backed session history
js/app.js         Camera loop, recording, results & history wiring
```

## Notes & disclaimer

The target ranges are based on widely cited bike-fit guidance (e.g. the Holmes
25–35° knee-flexion-at-bottom range for road) and adapted per discipline; they
are configurable in `js/fitModel.js`. VeloFit provides **general guidance from
2D camera estimates** and is not a substitute for a professional bike fit or
medical advice. Make adjustments in small steps.
