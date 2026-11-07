// Yashil Qadam — sounds for the Nature corner, made live in the browser.
//
// Music: slow, soft chords with an occasional gentle piano-like melody.
// Nature: wind, grasshoppers in the day, crickets and an owl at night,
// birds, rain and thunder. Nothing is downloaded and nothing is copyrighted:
// every sound is generated with the Web Audio API.

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const rand = (a, b) => a + Math.random() * (b - a);

// D major with a dreamy, open feel. Each chord lasts ~9.6 s.
const CHORDS = [
  { root: 38, pad: [50, 57, 61, 64, 66] },  // Dmaj9
  { root: 35, pad: [47, 54, 57, 62, 64] },  // Bm7(add11)
  { root: 31, pad: [43, 50, 54, 59, 57] },  // Gmaj7
  { root: 33, pad: [45, 52, 57, 59, 64] },  // Asus2
];
const SCALE = [74, 76, 78, 81, 83, 86, 88, 90]; // D E F# A B D E F#
const CHORD_LEN = 9.6;

export function createSoundscape() {
  let ctx = null, on = false;
  let master, musicBus, natureBus, reverb, reverbIn;
  let white, brown;
  let windSrc, windBand, windGain, whistleBand, whistleGain;
  let rainSrc, rainGain;
  const crickets = [];
  let timer = 0;
  let musicLevel = 0.7, natureLevel = 0.8;
  let state = { weather: "clear", time: "day", wind: 0.35, rain: 0, night: 0 };

  // Music timing
  let nextChord = 0, chordIdx = 0, nextNote = 0, phraseLeft = 0, lastDeg = 3;
  // Nature timing
  let nextBird = 2, nextHopper = 1, nextOwl = 15;

  function noiseBuffer(seconds, type) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (type === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
      }
    }
    return buf;
  }

  function impulse(seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function loopNoise(buf) {
    const s = ctx.createBufferSource();
    s.buffer = buf; s.loop = true;
    s.loopStart = 0; s.loopEnd = buf.duration;
    s.start(0, Math.random() * buf.duration);
    return s;
  }

  function panner(v) {
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(v, -1, 1);
    return p;
  }

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3;
    master = ctx.createGain(); master.gain.value = 0;
    master.connect(comp).connect(ctx.destination);

    musicBus = ctx.createGain(); musicBus.gain.value = musicLevel;
    natureBus = ctx.createGain(); natureBus.gain.value = natureLevel;
    musicBus.connect(master); natureBus.connect(master);

    reverb = ctx.createConvolver();
    reverb.buffer = impulse(3.8, 2.6);
    reverbIn = ctx.createGain(); reverbIn.gain.value = 1;
    const wet = ctx.createGain(); wet.gain.value = 0.55;
    reverbIn.connect(reverb).connect(wet).connect(musicBus);

    white = noiseBuffer(4, "white");
    brown = noiseBuffer(6, "brown");

    // Wind: a soft broadband rush plus a faint whistle.
    windSrc = loopNoise(white);
    windBand = ctx.createBiquadFilter(); windBand.type = "bandpass"; windBand.frequency.value = 380; windBand.Q.value = 0.55;
    const windLow = ctx.createBiquadFilter(); windLow.type = "lowpass"; windLow.frequency.value = 1300;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    windSrc.connect(windBand).connect(windLow).connect(windGain).connect(natureBus);
    whistleBand = ctx.createBiquadFilter(); whistleBand.type = "bandpass"; whistleBand.frequency.value = 1500; whistleBand.Q.value = 7;
    whistleGain = ctx.createGain(); whistleGain.gain.value = 0;
    windSrc.connect(whistleBand).connect(whistleGain).connect(natureBus);

    // Rain: steady hiss; individual drops are added in the scheduler.
    rainSrc = loopNoise(white);
    const rh = ctx.createBiquadFilter(); rh.type = "highpass"; rh.frequency.value = 800;
    const rl = ctx.createBiquadFilter(); rl.type = "lowpass"; rl.frequency.value = 6500;
    rainGain = ctx.createGain(); rainGain.gain.value = 0;
    rainSrc.connect(rh).connect(rl).connect(rainGain).connect(natureBus);

    // Crickets: a steady tone each, gated into short three-pulse chirps.
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.frequency.value = rand(4200, 4900);
      const g = ctx.createGain(); g.gain.value = 0;
      const lvl = ctx.createGain(); lvl.gain.value = 0;
      o.connect(g).connect(lvl).connect(panner(rand(-0.85, 0.85))).connect(natureBus);
      o.start();
      crickets.push({ g, lvl, next: rand(0, 1), period: rand(0.55, 0.95), vol: rand(0.5, 1) });
    }

    const now = ctx.currentTime;
    nextChord = now + 0.2; nextNote = now + 3;
  }

  /* ---------------- music ---------------- */

  function padChord(t, chord) {
    const len = CHORD_LEN + 4;
    const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = 760; filt.Q.value = 0.3;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 3.5);
    env.gain.setValueAtTime(1, t + CHORD_LEN - 0.5);
    env.gain.linearRampToValueAtTime(0, t + len);
    filt.connect(env);
    env.connect(musicBus);
    const send = ctx.createGain(); send.gain.value = 0.5;
    env.connect(send).connect(reverbIn);
    chord.pad.forEach((m, i) => {
      [-5, 5].forEach((cents, j) => {
        const o = ctx.createOscillator();
        o.type = j ? "sine" : "triangle";
        o.frequency.value = mtof(m);
        o.detune.value = cents + rand(-2, 2);
        const g = ctx.createGain(); g.gain.value = (j ? 0.022 : 0.014) * (i === 0 ? 1.1 : 1);
        o.connect(g).connect(filt);
        o.start(t); o.stop(t + len + 0.1);
      });
    });
    // Soft bass note.
    const b = ctx.createOscillator(); b.type = "sine"; b.frequency.value = mtof(chord.root + 12);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0, t); bg.gain.linearRampToValueAtTime(0.075, t + 1.2); bg.gain.exponentialRampToValueAtTime(0.0008, t + 8.5);
    b.connect(bg).connect(musicBus);
    b.start(t); b.stop(t + 9);
  }

  function bell(t, midi, vel) {
    const f = mtof(midi);
    const out = ctx.createGain(); out.gain.value = vel;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3200;
    out.connect(lp);
    lp.connect(musicBus);
    const send = ctx.createGain(); send.gain.value = 0.9;
    lp.connect(send).connect(reverbIn);
    const dur = rand(2.6, 3.6);
    [[1, 1], [2, 0.22], [3, 0.06], [4.01, 0.03]].forEach(([mult, amp]) => {
      const o = ctx.createOscillator(); o.frequency.value = f * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dur / mult);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + dur + 0.05);
    });
  }

  function scheduleMusic(until) {
    while (nextChord < until) {
      padChord(nextChord, CHORDS[chordIdx % CHORDS.length]);
      chordIdx++; nextChord += CHORD_LEN;
    }
    while (nextNote < until) {
      if (phraseLeft <= 0) {
        // Rest between phrases, then start a new short phrase.
        phraseLeft = 2 + ((Math.random() * 4) | 0);
        nextNote += rand(2.5, 6);
        lastDeg = 2 + ((Math.random() * 4) | 0);
        continue;
      }
      const stepBy = pick([-2, -1, -1, 1, 1, 2, 0, 3, -3]);
      lastDeg = clamp(lastDeg + stepBy, 0, SCALE.length - 1);
      bell(nextNote, SCALE[lastDeg], rand(0.09, 0.16));
      if (Math.random() < 0.18) bell(nextNote + 0.02, SCALE[lastDeg] - 12, 0.05);
      phraseLeft--;
      nextNote += pick([0.48, 0.6, 0.72, 0.96, 1.2]);
    }
  }

  /* ---------------- nature ---------------- */

  function burst(t, dur, freq, q, vol, pan, buf = white) {
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(panner(pan)).connect(natureBus);
    s.start(t, Math.random() * (buf.duration - dur - 0.1)); s.stop(t + dur + 0.02);
  }

  function birdPhrase(t) {
    const pan = rand(-0.9, 0.9), p = panner(pan);
    const out = ctx.createGain(); out.gain.value = rand(0.025, 0.05);
    out.connect(p).connect(natureBus);
    const send = ctx.createGain(); send.gain.value = 0.25; out.connect(send).connect(reverbIn);
    const base = rand(2400, 3800);
    const type = (Math.random() * 3) | 0;
    let tt = t;
    const n = 2 + ((Math.random() * 5) | 0);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      const d = rand(0.06, 0.14);
      const f0 = base * rand(0.9, 1.15);
      if (type === 0) { o.frequency.setValueAtTime(f0, tt); o.frequency.exponentialRampToValueAtTime(f0 * 1.45, tt + d); }
      else if (type === 1) { o.frequency.setValueAtTime(f0 * 1.4, tt); o.frequency.exponentialRampToValueAtTime(f0 * 0.8, tt + d); }
      else { o.frequency.setValueAtTime(f0, tt); o.frequency.linearRampToValueAtTime(f0 * 1.2, tt + d * 0.5); o.frequency.linearRampToValueAtTime(f0 * 0.95, tt + d); }
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(1, tt + 0.008); g.gain.exponentialRampToValueAtTime(0.001, tt + d);
      o.connect(g).connect(out); o.start(tt); o.stop(tt + d + 0.02);
      tt += d + rand(0.03, 0.12);
    }
  }

  function grasshopperSong(t, level) {
    const dur = rand(1.4, 3.8), rate = rand(13, 22), f = rand(5400, 7600);
    const o = ctx.createOscillator(); o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.frequency.value = f * 1.52;
    const o2g = ctx.createGain(); o2g.gain.value = 0.35;
    const am = ctx.createGain(); am.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.type = "square"; lfo.frequency.value = rate;
    const lfoSmooth = ctx.createBiquadFilter(); lfoSmooth.type = "lowpass"; lfoSmooth.frequency.value = rate * 5;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.5;
    lfo.connect(lfoSmooth).connect(lfoAmt).connect(am.gain);
    const env = ctx.createGain();
    const v = rand(0.012, 0.026) * level;
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(v, t + 0.25);
    env.gain.setValueAtTime(v, t + dur - 0.3); env.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(am); o2.connect(o2g).connect(am);
    am.connect(env).connect(panner(rand(-0.9, 0.9))).connect(natureBus);
    [o, o2, lfo].forEach((n) => { n.start(t); n.stop(t + dur + 0.05); });
  }

  function owl(t) {
    const p = panner(rand(-0.8, 0.8));
    const out = ctx.createGain(); out.gain.value = 0.05;
    out.connect(p).connect(natureBus);
    const send = ctx.createGain(); send.gain.value = 0.6; out.connect(send).connect(reverbIn);
    [[0, 0.32], [0.55, 0.22], [0.95, 0.6]].forEach(([off, d]) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), tt = t + off;
      o.frequency.setValueAtTime(390, tt); o.frequency.linearRampToValueAtTime(355, tt + d);
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(1, tt + 0.06); g.gain.linearRampToValueAtTime(0, tt + d);
      o.connect(g).connect(out); o.start(tt); o.stop(tt + d + 0.02);
    });
  }

  function thunderAt(t, power) {
    const pan = rand(-0.6, 0.6);
    // The crack.
    burst(t, 0.35, 500, 0.7, 0.5 * power, pan);
    // The long rumble, swelling a few times as it rolls away.
    const s = ctx.createBufferSource(); s.buffer = brown;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(260, t); lp.frequency.exponentialRampToValueAtTime(70, t + 6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.6 * power, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.5 * power, t + 1.2);
    g.gain.linearRampToValueAtTime(0.9 * power, t + 1.9);
    g.gain.exponentialRampToValueAtTime(0.25 * power, t + 3.4);
    g.gain.linearRampToValueAtTime(0.4 * power, t + 4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 7.5);
    s.connect(lp).connect(g).connect(panner(pan)).connect(natureBus);
    s.start(t); s.stop(t + 7.6);
  }

  function scheduleNature(now, until) {
    const { weather, time, wind, rain, night } = state;
    const raining = rain > 0.05;
    const dayLevel = clamp(1 - night * 1.4) * clamp(1 - rain * 1.6);

    // Wind and rain follow the scene smoothly.
    const windLevel = 0.012 + wind * 0.2 + (weather === "storm" ? 0.05 : 0);
    const gustNow = 0.7 + 0.3 * Math.sin(now * 0.37) * Math.sin(now * 0.23 + 2);
    windGain.gain.setTargetAtTime(windLevel * gustNow, now, 0.6);
    windBand.frequency.setTargetAtTime(260 + wind * 420 * gustNow, now, 0.8);
    whistleGain.gain.setTargetAtTime(Math.max(0, wind - 0.45) * 0.03 * gustNow, now, 0.8);
    whistleBand.frequency.setTargetAtTime(1200 + gustNow * 700, now, 1.2);
    rainGain.gain.setTargetAtTime(rain * 0.2, now, 0.8);

    // Close raindrops on leaves and grass.
    if (raining) {
      const drops = Math.round(rain * 4);
      for (let i = 0; i < drops; i++) burst(now + Math.random() * 0.1, rand(0.012, 0.03), rand(1800, 4500), 2, rand(0.03, 0.09) * rain, rand(-1, 1));
    }

    // Birds in the day and at sunset, when it isn't raining.
    if (now >= nextBird) {
      if (dayLevel > 0.15 && weather !== "storm") birdPhrase(now + 0.05);
      nextBird = now + rand(3.5, 11) / Math.max(0.3, dayLevel);
    }
    // Grasshoppers on warm, dry days.
    if (now >= nextHopper) {
      const lvl = dayLevel * (time === "day" ? 1 : 0.35) * (weather === "clear" ? 1 : 0.6);
      if (lvl > 0.1) grasshopperSong(now + 0.05, lvl);
      nextHopper = now + rand(1.2, 4.5);
    }
    // Crickets from sunset into the night.
    const cricketLevel = clamp(night * 1.3 + (time === "sunset" ? 0.45 : 0)) * clamp(1 - rain * 1.3);
    for (const c of crickets) {
      c.lvl.gain.setTargetAtTime(0.03 * c.vol * cricketLevel, now, 1.5);
      while (c.next < until) {
        if (c.next >= now) {
          for (let k = 0; k < 3; k++) {
            const tt = c.next + k * 0.045;
            c.g.gain.setValueAtTime(0, tt);
            c.g.gain.linearRampToValueAtTime(1, tt + 0.006);
            c.g.gain.linearRampToValueAtTime(0, tt + 0.024);
          }
        }
        c.next += c.period * rand(0.92, 1.08);
      }
    }
    // An owl, now and then, at night.
    if (now >= nextOwl) {
      if (night > 0.7 && !raining) owl(now + 0.1);
      nextOwl = now + rand(18, 40);
    }
  }

  function tick() {
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime, until = now + 0.6;
    if (nextChord < now) nextChord = now + 0.1;
    if (nextNote < now) nextNote = now + 0.5;
    crickets.forEach((c) => { if (c.next < now) c.next = now + rand(0, 0.5); });
    scheduleMusic(until);
    scheduleNature(now, until);
  }

  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else if (on) ctx.resume();
  });

  return {
    get on() { return on; },
    /** Must be called from a click or tap (browsers block sound until then). */
    async start() {
      if (!ctx) build();
      await ctx.resume();
      on = true;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.8);
      if (!timer) timer = setInterval(tick, 150);
      tick();
    },
    stop() {
      if (!ctx) return;
      on = false;
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
      setTimeout(() => { if (!on) ctx.suspend(); }, 900);
    },
    setMusic(v) { musicLevel = clamp(v); if (musicBus) musicBus.gain.setTargetAtTime(musicLevel, ctx.currentTime, 0.2); },
    setNature(v) { natureLevel = clamp(v); if (natureBus) natureBus.gain.setTargetAtTime(natureLevel, ctx.currentTime, 0.2); },
    update(s) { state = s; },
    thunder(delay, power) { if (ctx && on) thunderAt(ctx.currentTime + delay, power); },
  };
}
