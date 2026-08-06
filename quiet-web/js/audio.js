// audio.js — generative score. Everything is synthesised; there are no assets.
//
// Two reasons that matters: the artifact build inlines to a single file under a
// CSP that blocks every external host, and a fixed audio loop would fight the
// brief. The score is meant to be calm and non-repeating, so it is a slow random
// walk over a pentatonic scale — a scale with no semitone clashes, so no two
// notes the walk happens to pick can sound wrong together.
//
// Each lit beacon adds a sustained voice. By the end of a run the player has
// assembled the chord themselves, which is the only reward the game gives that
// cannot be shown on the HUD.

const SCALE = [0, 3, 5, 7, 10];      // minor pentatonic, in semitones

const ZONE_ROOT = {
  meadow: 146.83,   // D3
  canyon: 110.00,   // A2 — lower, heavier
  grove: 174.61,    // F3
};

const semis = (root, n) => root * Math.pow(2, n / 12);

export function createAudio() {
  let ctx = null;
  let master = null;
  let wet = null;
  let drone = [];
  let voices = [];
  let timer = null;
  let nextNote = 0;
  let root = ZONE_ROOT.meadow;
  let muted = false;
  let started = false;
  let suspended = false;

  /** Built lazily: an AudioContext created before a gesture starts suspended. */
  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    master = ctx.createGain();
    master.gain.value = 0.0001;

    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1900;
    tone.Q.value = 0.4;

    // A short feedback delay stands in for reverb: far cheaper than convolution
    // and, at this feedback level, indistinguishable from a soft room.
    const delay = ctx.createDelay(1.2);
    delay.delayTime.value = 0.38;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.34;
    wet = ctx.createGain();
    wet.gain.value = 0.30;

    tone.connect(master);
    tone.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(master);
    master.connect(ctx.destination);

    master.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 3);
    return tone;
  }

  let bus = null;

  function makeDrone() {
    for (const o of drone) { try { o.stop(); } catch { /* already stopped */ } }
    drone = [];
    // two slightly detuned oscillators — the beat between them is what stops a
    // held sine sounding like a test tone
    for (const detune of [-4, 5]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = root / 2;
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = 0.10;
      osc.connect(g).connect(bus);
      osc.start();
      drone.push(osc);
    }
  }

  /** One plucked note with a long tail. */
  function pluck(freq, when, gain = 0.10, dur = 2.6) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    osc.connect(g).connect(bus);
    osc.start(when);
    osc.stop(when + dur + 0.1);
  }

  /**
   * Lookahead scheduler. Notes are queued against the audio clock rather than
   * fired from a timer, because timer jitter would be audible as a limp.
   */
  function schedule() {
    if (!ctx || muted) return;
    const horizon = ctx.currentTime + 0.6;
    while (nextNote < horizon) {
      const step = SCALE[Math.floor(Math.random() * SCALE.length)];
      const octave = Math.random() < 0.32 ? 12 : 0;
      pluck(semis(root, step + octave + 12), nextNote, 0.055 + Math.random() * 0.05);
      nextNote += 0.72 + Math.random() * 1.5;
    }
  }

  return {
    /** Must be called from a user gesture, or the context stays suspended. */
    start() {
      if (started) return;
      started = true;
      bus = build();
      makeDrone();
      nextNote = ctx.currentTime + 0.4;
      timer = setInterval(schedule, 180);
    },

    setZone(key) {
      const next = ZONE_ROOT[key] || ZONE_ROOT.meadow;
      if (!ctx || next === root) return;
      root = next;
      makeDrone();
    },

    /**
     * A beacon's voice: a sustained tone that stays for the rest of the run.
     * The nth beacon takes the nth scale degree, so the chord grows upward.
     */
    beacon(index) {
      if (!ctx) return;
      const step = SCALE[index % SCALE.length] + 12 * Math.floor(index / SCALE.length);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = semis(root, step + 12);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.045, ctx.currentTime + 2.4);

      osc.connect(g).connect(bus);
      osc.start();
      voices.push({ osc, g });

      // a small flourish so lighting one is an event, not just a level-up
      for (let i = 0; i < 3; i++) {
        pluck(semis(root, SCALE[(index + i) % SCALE.length] + 24),
          ctx.currentTime + i * 0.11, 0.07, 1.6);
      }
    },

    sparkle() {
      if (!ctx || muted) return;
      const step = SCALE[Math.floor(Math.random() * SCALE.length)];
      pluck(semis(root, step + 36), ctx.currentTime, 0.05, 0.7);
    },

    pulse() {
      if (!ctx || muted) return;
      // filtered noise sweep — a breath rather than a bang
      const len = Math.floor(ctx.sampleRate * 0.5);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);

      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(320, ctx.currentTime);
      bp.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 0.42);
      bp.Q.value = 1.4;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.16, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);

      src.connect(bp).connect(g).connect(bus);
      src.start();
    },

    land(strength) {
      if (!ctx || muted || strength < 0.18) return;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(58, ctx.currentTime + 0.14);

      const g = ctx.createGain();
      g.gain.setValueAtTime(Math.min(0.13, strength * 0.4), ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);

      osc.connect(g).connect(bus);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    },

    /**
     * Pause the score along with the game.
     *
     * Suspending the AudioContext alone is not enough: the lookahead scheduler
     * queues notes against `ctx.currentTime`, which stops advancing while the
     * context is suspended, so the scheduler would spin at its horizon and then
     * dump every missed note at once on resume. The timer has to stop too, and
     * `nextNote` has to be re-based off the clock it finds when it comes back.
     */
    setSuspended(next) {
      if (!ctx || !started || suspended === next) return suspended;
      suspended = next;

      if (next) {
        if (timer) { clearInterval(timer); timer = null; }
        ctx.suspend();
      } else {
        ctx.resume();
        nextNote = ctx.currentTime + 0.25;
        timer = setInterval(schedule, 180);
      }
      return suspended;
    },

    get suspended() { return suspended; },

    toggleMute() {
      muted = !muted;
      if (master && ctx) {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.exponentialRampToValueAtTime(muted ? 0.0001 : 0.5, ctx.currentTime + 0.3);
      }
      return muted;
    },

    get muted() { return muted; },

    stop() {
      if (timer) clearInterval(timer);
      for (const v of voices) { try { v.osc.stop(); } catch { /* already stopped */ } }
      for (const o of drone) { try { o.stop(); } catch { /* already stopped */ } }
      voices = [];
      drone = [];
    },
  };
}
