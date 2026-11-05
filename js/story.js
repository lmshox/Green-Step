// Yashil Qadam — hero scroll story (realistic canvas version).
//
// The scene is painted procedurally once into separate canvases (sky and landscape,
// ground with grass, the tree in two depth layers) that the graphics card moves and
// tints with CSS. Only the small moving things are drawn per frame, from sprites.
//
// Scrolling drives the story: the camera glides down the trunk, rubbish appears,
// then Fix (pins) → Clean (into the bag) → Verify (check) → Reward (flowers, +120).
(function () {
  "use strict";

  const section = document.getElementById("story");
  if (!section) return;

  const sticky = section.querySelector(".story-sticky");
  const canvas = document.getElementById("story-canvas");
  const ctx = canvas.getContext("2d");
  const intro = document.getElementById("story-intro");
  const endBox = document.getElementById("story-end");
  const chip = document.getElementById("story-chip");
  const hint = document.getElementById("story-hint");
  const skip = document.getElementById("story-skip");
  const bar = document.getElementById("story-bar");
  const caps = [...section.querySelectorAll(".story-cap")];
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const smooth = (t) => t * t * (3 - 2 * t);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const lerp = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hsl = (h, s, l, a = 1) => `hsla(${h.toFixed(1)},${s.toFixed(1)}%,${l.toFixed(1)}%,${a.toFixed(3)})`;

  function layer(x0, y0, x1, y1, q) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil((x1 - x0) * q));
    c.height = Math.max(1, Math.ceil((y1 - y0) * q));
    const g = c.getContext("2d");
    g.setTransform(q, 0, 0, q, -x0 * q, -y0 * q);
    return { c, g, x0, y0, x1, y1, q };
  }

  /* ------------------------------------------------------------------ */
  /* World                                                               */
  /* ------------------------------------------------------------------ */
  // World units: 1600 wide, the tree stands at x = 800 with its base at y = 1548.

  const WX0 = -560, WX1 = 1680, WY0 = -820, WY1 = 2090;
  const TX = 800, BASE_Y = 1548;
  const groundTop = (x) => 1494 + 9 * Math.sin(x * 0.0042 + 0.6) + 5 * Math.sin(x * 0.013 + 2.1);
  const LIGHT = { x: -0.62, y: -0.78 }; // sun from the upper left

  /* ---------- background: sky, haze, distant forest, meadow ---------- */

  function ridge(R, base, amp, f1, f2) {
    const o1 = R() * 10, o2 = R() * 10, o3 = R() * 10;
    return (x) => base + amp * (0.55 * Math.sin(x * f1 + o1) + 0.3 * Math.sin(x * f2 + o2) + 0.15 * Math.sin(x * f2 * 2.7 + o3));
  }

  function paintBackground(L) {
    const g = L.g, R = rng(11);
    const W = WX1 - WX0;

    let gr = g.createLinearGradient(0, WY0, 0, 1460);
    gr.addColorStop(0, "#c5d2c4");
    gr.addColorStop(0.42, "#d9dfd0");
    gr.addColorStop(0.78, "#e9e5d6");
    gr.addColorStop(1, "#ece6d5");
    g.fillStyle = gr;
    g.fillRect(WX0, WY0, W, 1460 - WY0);

    // Sun glow, upper left.
    gr = g.createRadialGradient(-160, -300, 0, -160, -300, 1500);
    gr.addColorStop(0, "rgba(255,247,224,.85)");
    gr.addColorStop(0.35, "rgba(255,244,218,.35)");
    gr.addColorStop(1, "rgba(255,244,218,0)");
    g.fillStyle = gr;
    g.fillRect(WX0, WY0, W, 2300);

    // Soft clouds.
    for (let i = 0; i < 26; i++) {
      const cx = WX0 + R() * W, cy = -650 + R() * 900, r = 60 + R() * 140;
      const c = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      c.addColorStop(0, "rgba(255,255,252,.32)");
      c.addColorStop(1, "rgba(255,255,252,0)");
      g.fillStyle = c;
      g.beginPath(); g.ellipse(cx, cy, r * 2.2, r * 0.55, 0, 0, TAU); g.fill();
    }

    // Distant hills, getting greener and sharper as they come closer.
    const far = ridge(R, 1205, 55, 0.0021, 0.0063);
    const mid = ridge(R, 1290, 38, 0.0029, 0.0081);
    const near = ridge(R, 1352, 22, 0.0037, 0.011);
    const fillRidge = (fn, color, bottom) => {
      g.beginPath(); g.moveTo(WX0, bottom);
      for (let x = WX0; x <= WX1; x += 8) g.lineTo(x, fn(x));
      g.lineTo(WX1, bottom); g.closePath();
      g.fillStyle = color; g.fill();
    };
    fillRidge(far, "#b8c2b0", 1500);
    for (let x = WX0; x < WX1; x += 7) {
      const r = 6 + R() * 9;
      g.fillStyle = hsl(118 + R() * 14, 12 + R() * 6, 64 + R() * 6, 0.55);
      g.beginPath(); g.arc(x, far(x) - r * 0.4, r, 0, TAU); g.fill();
    }
    fillRidge(mid, "#9eac93", 1500);
    const crowns = (fn, n, rMin, rMax, hue, sat, lum, alpha, lift) => {
      for (let i = 0; i < n; i++) {
        const x = WX0 + R() * W;
        if (R() < 0.18) continue; // gaps between groves
        const h = rMin + Math.pow(R(), 1.6) * (rMax - rMin);
        const base = fn(x);
        const parts = 2 + Math.floor(R() * 3);
        for (let k = 0; k < parts; k++) {
          const r = h * (0.45 + R() * 0.45);
          const cx = x + (R() - 0.5) * h * 0.9, cy = base - h * lift - R() * h * 0.6;
          g.fillStyle = hsl(hue + R() * 22, sat + R() * 6, lum + R() * 8, alpha);
          g.beginPath(); g.ellipse(cx, cy, r, r * (0.8 + R() * 0.4), 0, 0, TAU); g.fill();
          g.fillStyle = hsl(80 + R() * 12, 22, lum + 16, 0.18);
          g.beginPath(); g.arc(cx - r * 0.3, cy - r * 0.3, r * 0.45, 0, TAU); g.fill();
        }
      }
    };
    crowns(mid, 340, 6, 22, 108, 14, 48, 0.75, 0.3);
    fillRidge(near, "#7d8f6c", 1500);
    crowns(near, 520, 8, 34, 100, 17, 29, 0.92, 0.35);
    // Haze in front of the forest (atmospheric depth).
    gr = g.createLinearGradient(0, 1250, 0, 1420);
    gr.addColorStop(0, "rgba(233,229,214,.35)");
    gr.addColorStop(1, "rgba(233,229,214,0)");
    g.fillStyle = gr;
    g.fillRect(WX0, 1250, W, 170);

    // Meadow behind the tree.
    gr = g.createLinearGradient(0, 1360, 0, 1520);
    gr.addColorStop(0, "#82936a");
    gr.addColorStop(1, "#6e8458");
    g.beginPath(); g.moveTo(WX0, 1530);
    for (let x = WX0; x <= WX1; x += 10) g.lineTo(x, near(x) + 26 + 6 * Math.sin(x * 0.01));
    g.lineTo(WX1, 1530); g.closePath();
    g.fillStyle = gr; g.fill();
    for (let i = 0; i < 2600; i++) {
      const x = WX0 + R() * W, y = 1385 + R() * 135;
      g.strokeStyle = hsl(80 + R() * 30, 22 + R() * 10, 38 + R() * 16, 0.5);
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 3, y - 3 - R() * 5); g.stroke();
    }
  }

  /* ---------- ground: soil, light patches, grass, the tree's shadow ---------- */

  function paintGround(L) {
    const g = L.g, R = rng(23);
    const W = WX1 - WX0;

    let gr = g.createLinearGradient(0, 1480, 0, WY1);
    gr.addColorStop(0, "#71865a");
    gr.addColorStop(0.35, "#5e7449");
    gr.addColorStop(1, "#465a37");
    g.beginPath(); g.moveTo(WX0, WY1);
    for (let x = WX0; x <= WX1; x += 6) g.lineTo(x, groundTop(x));
    g.lineTo(WX1, WY1); g.closePath();
    g.fillStyle = gr; g.fill();
    g.save(); g.clip();

    // Light and shade patches (perspective-squashed).
    for (let i = 0; i < 170; i++) {
      const x = WX0 + R() * W, y = 1500 + R() * (WY1 - 1500), r = 50 + R() * 170;
      const k = R();
      const col = k < 0.45 ? "176,186,120" : k < 0.85 ? "36,52,28" : "112,92,62";
      const c = g.createRadialGradient(x, y, 0, x, y, r);
      c.addColorStop(0, `rgba(${col},${(0.1 + R() * 0.12).toFixed(3)})`);
      c.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = c;
      g.save(); g.translate(x, y); g.scale(1, 0.35); g.translate(-x, -y);
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.restore();
    }

    // Bare soil around the trunk.
    gr = g.createRadialGradient(TX, BASE_Y + 6, 0, TX, BASE_Y + 6, 260);
    gr.addColorStop(0, "rgba(96,78,54,.65)");
    gr.addColorStop(0.6, "rgba(96,78,54,.25)");
    gr.addColorStop(1, "rgba(96,78,54,0)");
    g.save(); g.translate(TX, BASE_Y + 6); g.scale(1, 0.24); g.translate(-TX, -(BASE_Y + 6));
    g.fillStyle = gr; g.beginPath(); g.arc(TX, BASE_Y + 6, 260, 0, TAU); g.fill(); g.restore();

    // The tree's shadow, cast down and to the right.
    gr = g.createRadialGradient(TX + 150, BASE_Y + 40, 0, TX + 150, BASE_Y + 40, 520);
    gr.addColorStop(0, "rgba(20,30,16,.42)");
    gr.addColorStop(0.55, "rgba(20,30,16,.2)");
    gr.addColorStop(1, "rgba(20,30,16,0)");
    g.save(); g.translate(TX + 150, BASE_Y + 40); g.scale(1, 0.16); g.translate(-(TX + 150), -(BASE_Y + 40));
    g.fillStyle = gr; g.beginPath(); g.arc(TX + 150, BASE_Y + 40, 520, 0, TAU); g.fill(); g.restore();

    // Grass blades, far to near so closer ones overlap.
    const blades = [];
    for (let i = 0; i < 15000; i++) {
      const y = 1488 + Math.pow(R(), 0.85) * (WY1 - 1488);
      const x = WX0 + R() * W;
      if (y < groundTop(x) + 1) continue;
      blades.push([x, y, R(), R(), R(), R()]);
    }
    blades.sort((a, b) => a[1] - b[1]);
    for (const [x, y, r1, r2, r3, r4] of blades) {
      const depth = clamp((y - 1480) / 600);
      const len = 5 + depth * 30 + r1 * 10;
      const w = 0.7 + depth * 2.1;
      const lean = (r2 - 0.5) * 0.9;
      const inShade = Math.abs(x - TX - 150) < 420 && y < BASE_Y + 120;
      const shade = clamp(0.25 + r3 * 0.75 - (inShade ? 0.3 : 0));
      g.fillStyle = hsl(72 + r4 * 34, 20 + r3 * 18, 20 + shade * 30, 0.95);
      const tx = x + lean * len, ty = y - len;
      g.beginPath();
      g.moveTo(x - w / 2, y);
      g.quadraticCurveTo(x - w / 4 + lean * len * 0.35, y - len * 0.6, tx, ty);
      g.quadraticCurveTo(x + w / 4 + lean * len * 0.35, y - len * 0.6, x + w / 2, y);
      g.fill();
    }

    // Clover and small weeds.
    for (let i = 0; i < 90; i++) {
      const x = WX0 + R() * W, y = 1540 + R() * (WY1 - 1560);
      const s = 0.6 + clamp((y - 1500) / 600) * 0.9;
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU + R();
        g.fillStyle = hsl(105 + R() * 15, 24, 26 + R() * 10, 0.9);
        g.beginPath(); g.ellipse(x + Math.cos(a) * 3.5 * s, y + Math.sin(a) * 2 * s, 4 * s, 2.6 * s, a, 0, TAU); g.fill();
      }
    }
    // Tiny distant flowers for texture.
    for (let i = 0; i < 160; i++) {
      const x = WX0 + R() * W, y = 1500 + Math.pow(R(), 1.6) * 300;
      g.fillStyle = R() < 0.6 ? "rgba(246,243,232,.75)" : "rgba(232,205,110,.75)";
      g.beginPath(); g.arc(x, y, 0.9 + R() * 1.2, 0, TAU); g.fill();
    }
    g.restore();
  }

  /* ---------- the tree ---------- */

  function buildTree() {
    const R = rng(7);
    const branches = []; // x0, y0, x1, y1, w0, w1, depth, cx, cy (bend control)

    // An organic crown made of overlapping lobes with a wobbly edge.
    const LOBES = [
      [800, 450, 440, 300], [560, 540, 230, 190], [1050, 520, 240, 200],
      [690, 270, 230, 190], [930, 250, 240, 200], [810, 140, 200, 130], [440, 650, 140, 110], [1160, 640, 150, 115],
    ];
    const crownVal = (x, y) => {
      let v = -1;
      for (const [cx, cy, rx, ry] of LOBES) v = Math.max(v, 1 - ((x - cx) / rx) ** 2 - ((y - cy) / ry) ** 2);
      return v + 0.12 * Math.sin(x * 0.021 + y * 0.013) + 0.08 * Math.sin(x * 0.05 - y * 0.04);
    };
    const inCrown = (x, y, m = 0) => crownVal(x, y) > m;
    const ENV = { x: 800, y: 430, rx: 480, ry: 340 };

    function grow(x, y, ang, len, w, depth) {
      const a = ang + (R() - 0.5) * 0.36;
      let x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len;
      let tries = 0;
      const margin = depth >= 3 ? 0.22 : 0.08; // fine twigs stay inside the foliage
      while (!inCrown(x1, y1, margin) && tries++ < 8) { len *= 0.8; x1 = x + Math.cos(a) * len; y1 = y + Math.sin(a) * len; }
      const w1 = Math.max(1.2, w * (0.62 + R() * 0.08));
      const bend = (R() - 0.5) * len * 0.24;
      const nx = -Math.sin(a), ny = Math.cos(a);
      branches.push([x, y, x1, y1, w, w1, depth, (x + x1) / 2 + nx * bend, (y + y1) / 2 + ny * bend]);
      if (depth >= 5 || w1 < 3) return;
      const n = depth < 2 ? 3 : R() < 0.5 ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const spread = 0.32 + R() * 0.28;
        const off = n === 2 ? (i ? spread : -spread) : (i - 1) * spread * 1.1;
        let ca = lerp(a + off, -Math.PI / 2, 0.1);
        if (depth >= 3) ca += Math.cos(ca) * 0.06;
        grow(x1, y1, ca, len * (0.68 + R() * 0.14), w1 * (n === 3 && i === 1 ? 0.85 : 0.95), depth + 1);
      }
    }

    // Trunk centreline (slightly S-shaped) with a root flare.
    const TRUNK_TOP = 820;
    const trunk = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, y = lerp(BASE_Y, TRUNK_TOP, t);
      const x = TX + 10 * Math.sin(t * 3.1) - 6 * t;
      let w = lerp(86, 58, t);
      if (t < 0.12) w += Math.pow(1 - t / 0.12, 2.2) * 70;
      trunk.push([x, y, w]);
    }
    const top = trunk[trunk.length - 1];
    // Four main limbs fan out from the top of the trunk, like a real broadleaf.
    [[-2.25, 270, 34], [-1.85, 300, 38], [-1.32, 290, 38], [-0.92, 260, 34]].forEach(([a, len, w], i) => {
      grow(top[0] + (i - 1.5) * 8, top[1] + 6, a, len, w, 1);
    });

    // Surface roots.
    const roots = [];
    [[-1, 230, 0.07], [-1, 150, 0.18], [1, 210, 0.08], [1, 140, 0.2], [-0.2, 90, 0.5], [0.3, 100, 0.45]].forEach(([dir, len, drop]) => {
      const x0 = TX + dir * 50, y0 = BASE_Y - 6;
      roots.push([x0, y0, x0 + dir * len, y0 + 14 + drop * 60, 22, 2]);
    });

    // Foliage clusters packed through the crown (Poisson-style spacing).
    const clusters = [];
    for (let i = 0; i < 9000 && clusters.length < 260; i++) {
      const x = 260 + R() * 1080, y = 0 + R() * 860;
      const v = crownVal(x, y);
      if (v < 0) continue;
      const r = 44 + R() * 30 + Math.min(0.4, v) * 30;
      if (clusters.some((c) => Math.hypot(c.x - x, c.y - y) < (c.r + r) * 0.52)) continue;
      // Clusters near the front-bottom-left read as nearer; it varies per cluster.
      clusters.push({ x, y, r, z: R(), edge: v < 0.18 });
    }

    let minX = TX - 200, maxX = TX + 200, minY = TRUNK_TOP;
    const maxY = BASE_Y + 80;
    for (const c of clusters) { minX = Math.min(minX, c.x - c.r - 20); maxX = Math.max(maxX, c.x + c.r + 20); minY = Math.min(minY, c.y - c.r - 20); }
    for (const b of branches) { minX = Math.min(minX, b[0], b[2]); maxX = Math.max(maxX, b[0], b[2]); minY = Math.min(minY, b[1], b[3]); }
    for (const r of roots) { minX = Math.min(minX, r[2] - 20); maxX = Math.max(maxX, r[2] + 20); }
    return { branches, trunk, roots, clusters, ENV, TRUNK_TOP, box: [minX - 30, minY - 30, maxX + 30, maxY] };
  }

  function barkGradient(g, x0, y0, x1, y1, w) {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const s = nx * LIGHT.x + ny * LIGHT.y > 0 ? 1 : -1; // lit side faces the sun
    const gr = g.createLinearGradient(mx + nx * w * s, my + ny * w * s, mx - nx * w * s, my - ny * w * s);
    gr.addColorStop(0, "#8b7660");
    gr.addColorStop(0.35, "#68553f");
    gr.addColorStop(0.8, "#41352a");
    gr.addColorStop(1, "#30271f");
    return gr;
  }

  function drawLimb(g, b) {
    const [x0, y0, x1, y1, w0, w1, , cx, cy] = b;
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    const h0 = w0 / 2, h1 = w1 / 2, hc = (h0 + h1) / 2;
    g.beginPath();
    g.moveTo(x0 + nx * h0, y0 + ny * h0);
    g.quadraticCurveTo(cx + nx * hc, cy + ny * hc, x1 + nx * h1, y1 + ny * h1);
    g.lineTo(x1 - nx * h1, y1 - ny * h1);
    g.quadraticCurveTo(cx - nx * hc, cy - ny * hc, x0 - nx * h0, y0 - ny * h0);
    g.closePath();
    g.fillStyle = barkGradient(g, x0, y0, x1, y1, h0);
    g.fill();
    g.beginPath(); g.arc(x1, y1, h1, 0, TAU); g.fill();
  }

  function drawWood(g, T) {
    const R = rng(31);
    for (const [x0, y0, x1, y1, w0, w1] of T.roots) drawLimb(g, [x0, y0, x1, y1, w0, w1, 0, (x0 + x1) / 2, y0 + 2]);

    const L = T.trunk;
    g.beginPath();
    L.forEach(([x, y, w], i) => (i ? g.lineTo(x - w / 2, y) : g.moveTo(x - w / 2, y)));
    for (let i = L.length - 1; i >= 0; i--) g.lineTo(L[i][0] + L[i][2] / 2, L[i][1]);
    g.closePath();
    const gr = g.createLinearGradient(TX - 80, 0, TX + 80, 0);
    gr.addColorStop(0, "#8e7962");
    gr.addColorStop(0.3, "#6e5a45");
    gr.addColorStop(0.7, "#45382c");
    gr.addColorStop(1, "#2f271f");
    g.fillStyle = gr; g.fill();

    // Bark texture, clipped to the trunk.
    g.save(); g.clip();
    for (let i = 0; i < 230; i++) {
      const u = R() * 2 - 1;
      const y0 = BASE_Y + 20 - R() * (BASE_Y - T.TRUNK_TOP), len = 30 + R() * 140;
      g.beginPath();
      for (let k = 0; k <= 8; k++) {
        const y = y0 - (len * k) / 8;
        const t = clamp((BASE_Y - y) / (BASE_Y - T.TRUNK_TOP));
        const [cx, , w] = L[Math.min(L.length - 1, Math.round(t * (L.length - 1)))];
        const x = cx + u * w * 0.5 + Math.sin(y * 0.05 + i) * 1.6;
        k ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.strokeStyle = u < -0.2 && R() < 0.5 ? "rgba(178,156,124,.22)" : "rgba(28,22,16,.38)";
      g.lineWidth = 0.8 + R() * 2.2;
      g.stroke();
    }
    [[TX + 8, 1180, 7], [TX - 14, 1010, 5], [TX + 4, 870, 4]].forEach(([x, y, r]) => {
      g.fillStyle = "rgba(30,24,18,.55)"; g.beginPath(); g.ellipse(x, y, r, r * 1.6, 0, 0, TAU); g.fill();
      g.strokeStyle = "rgba(160,140,110,.25)"; g.lineWidth = 1.2; g.beginPath(); g.ellipse(x, y, r + 3, r * 1.6 + 4, 0, 0, TAU); g.stroke();
    });
    const ao = g.createLinearGradient(0, BASE_Y - 60, 0, BASE_Y + 10);
    ao.addColorStop(0, "rgba(20,16,10,0)");
    ao.addColorStop(1, "rgba(20,16,10,.45)");
    g.fillStyle = ao; g.fillRect(TX - 200, BASE_Y - 60, 400, 80);
    g.restore();

    [...T.branches].filter((b) => b[4] >= 16).sort((a, b) => b[4] - a[4]).forEach((b) => drawLimb(g, b));
  }

  function drawTwigs(g, T) {
    [...T.branches].filter((b) => b[4] < 16).sort((a, b) => b[4] - a[4]).forEach((b) => drawLimb(g, b));
  }

  function drawLeaves(L, T, filter, seed) {
    const g = L.g, q = L.q, R = rng(seed);
    const E = T.ENV;
    const list = T.clusters.filter(filter).sort((a, b) => a.z - b.z || a.y - b.y);
    const litAt = (x, y, c, d) => {
      const kx = (x - c.x) / c.r, ky = (y - c.y) / c.r;
      const ex = (x - E.x) / E.rx, ey = (y - E.y) / E.ry;
      const nx = kx * 0.65 + ex * 0.7, ny = ky * 0.65 + ey * 0.7;
      return 0.44 + (nx * LIGHT.x + ny * LIGHT.y) * 0.4 + c.z * 0.14 - Math.max(0, ey) * 0.22 + (d - 0.6) * 0.14;
    };

    for (const c of list) {
      // 1. A shaded foliage mass, so the crown is deep and full rather than see-through.
      const cl = clamp(litAt(c.x, c.y, c, 0.2));
      if (!c.edge) {
        const mr = c.r * 0.78;
        const m = g.createRadialGradient(c.x - mr * 0.25, c.y - mr * 0.3, mr * 0.1, c.x, c.y, mr);
        m.addColorStop(0, hsl(100 - cl * 14, 26, 13 + cl * 18, 0.96));
        m.addColorStop(0.7, hsl(110, 28, 10 + cl * 9, 0.85));
        m.addColorStop(1, hsl(110, 28, 10 + cl * 9, 0));
        g.fillStyle = m;
        g.beginPath(); g.arc(c.x, c.y, mr, 0, TAU); g.fill();
      }

      // 2. Individual leaves on top, lit from the upper left.
      const n = Math.round(c.r * (c.edge ? 3.6 : 4.4));
      for (let i = 0; i < n; i++) {
        const a = R() * TAU, d = Math.pow(R(), 0.5);
        const x = c.x + Math.cos(a) * c.r * d * 1.05, y = c.y + Math.sin(a) * c.r * d * 0.92;
        const lit = clamp(litAt(x, y, c, d) + (R() - 0.5) * 0.2);
        let hue = 108 - lit * 24 + (R() - 0.5) * 14;
        let sat = 18 + lit * 16 + R() * 8;
        let lum = 10 + lit * 33 + R() * 5;
        if (R() < 0.025) { hue = 60 + R() * 12; sat = 34; lum = 38 + R() * 10; } // the odd yellowing leaf
        const len = 9 + R() * 8, wid = len * (0.36 + R() * 0.14);
        const rot = Math.PI / 2 + (R() - 0.5) * 2.6;
        const co = Math.cos(rot) * q, si = Math.sin(rot) * q;
        g.setTransform(co, si, -si, co, (x - L.x0) * q, (y - L.y0) * q);
        g.fillStyle = hsl(hue, sat, lum, 0.94);
        g.beginPath();
        g.moveTo(0, -len / 2);
        g.quadraticCurveTo(wid, -len * 0.1, 0, len / 2);
        g.quadraticCurveTo(-wid, -len * 0.1, 0, -len / 2);
        g.fill();
        if (lit > 0.6 && R() < 0.4) { // sunlit sheen and midrib
          g.fillStyle = hsl(76, 40, 60 + R() * 8, 0.5);
          g.beginPath(); g.ellipse(-wid * 0.2, -len * 0.08, wid * 0.32, len * 0.3, 0, 0, TAU); g.fill();
        }
      }
      g.setTransform(q, 0, 0, q, -L.x0 * q, -L.y0 * q);
    }
  }

  /* ---------- sprites: rubbish, bag, pins, flowers ---------- */

  function sprite(w, h, q, draw) {
    const L = layer(-w / 2, -h / 2, w / 2, h / 2, q);
    draw(L.g);
    return L;
  }

  function blob(g, R, n, rx, ry, jitter) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, r = 1 + (R() - 0.5) * jitter;
      pts.push([Math.cos(a) * rx * r, Math.sin(a) * ry * r]);
    }
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const [x, y] = pts[i % n], [nx, ny] = pts[(i + 1) % n];
      const mx = (x + nx) / 2, my = (y + ny) / 2;
      i ? g.quadraticCurveTo(x, y, mx, my) : g.moveTo(mx, my);
    }
    g.closePath();
  }

  const RUBBISH_DRAW = {
    bottle(g) {
      // Clear PET bottle lying on its side.
      g.beginPath();
      g.moveTo(-31, -9); g.quadraticCurveTo(-34, 0, -31, 9);
      g.lineTo(14, 11); g.quadraticCurveTo(20, 11, 24, 5.5);
      g.lineTo(30, 5); g.lineTo(30, -5); g.lineTo(24, -5.5);
      g.quadraticCurveTo(20, -11, 14, -11); g.closePath();
      let gr = g.createLinearGradient(0, -11, 0, 11);
      gr.addColorStop(0, "rgba(176,206,214,.62)");
      gr.addColorStop(0.28, "rgba(236,246,248,.82)");
      gr.addColorStop(0.55, "rgba(158,190,200,.5)");
      gr.addColorStop(1, "rgba(96,128,138,.62)");
      g.fillStyle = gr; g.fill();
      g.strokeStyle = "rgba(90,118,128,.45)"; g.lineWidth = 0.8; g.stroke();
      g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 0.8;
      [-27, -24, 9, 12].forEach((x) => { g.beginPath(); g.moveTo(x, -9); g.lineTo(x + 0.5, 9); g.stroke(); });
      gr = g.createLinearGradient(0, -11, 0, 11);
      gr.addColorStop(0, "rgba(64,112,150,.85)"); gr.addColorStop(0.5, "rgba(96,146,180,.85)"); gr.addColorStop(1, "rgba(40,76,104,.9)");
      g.fillStyle = gr; g.fillRect(-15, -10.6, 18, 21.2);
      g.fillStyle = "rgba(245,240,226,.75)"; g.fillRect(-15, -2, 18, 3);
      gr = g.createLinearGradient(0, -6, 0, 6);
      gr.addColorStop(0, "#5f8db3"); gr.addColorStop(0.4, "#2f5f88"); gr.addColorStop(1, "#1d3c57");
      g.fillStyle = gr; g.fillRect(29, -6, 8, 12);
      g.strokeStyle = "rgba(255,255,255,.8)"; g.lineWidth = 1.8; g.lineCap = "round";
      g.beginPath(); g.moveTo(-26, -5.5); g.lineTo(12, -6.5); g.stroke();
    },
    can(g, R) {
      // Dented aluminium can.
      g.beginPath();
      g.moveTo(-17, -10);
      for (let x = -17; x <= 17; x += 4.25) g.lineTo(x, -10 + (Math.abs(x) < 12 ? (R() - 0.3) * 2.6 : 0));
      g.lineTo(17, 10);
      for (let x = 17; x >= -17; x -= 4.25) g.lineTo(x, 10 - (Math.abs(x) < 12 ? (R() - 0.3) * 2.4 : 0));
      g.closePath();
      let gr = g.createLinearGradient(0, -10, 0, 10);
      gr.addColorStop(0, "#7d8487"); gr.addColorStop(0.22, "#eef1f2"); gr.addColorStop(0.45, "#a9b0b3");
      gr.addColorStop(0.72, "#5d6467"); gr.addColorStop(1, "#b7bdc0");
      g.fillStyle = gr; g.fill();
      g.save(); g.clip();
      g.fillStyle = R() < 0.5 ? "rgba(150,36,32,.82)" : "rgba(40,86,58,.82)";
      g.fillRect(-11, -11, 22, 22);
      gr = g.createLinearGradient(0, -10, 0, 10);
      gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.22, "rgba(255,255,255,.45)"); gr.addColorStop(0.5, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(0,0,0,.25)");
      g.fillStyle = gr; g.fillRect(-11, -11, 22, 22);
      g.strokeStyle = "rgba(40,40,40,.35)"; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(-4, -10); g.lineTo(1, 2); g.lineTo(-2, 10); g.stroke();
      g.restore();
      g.fillStyle = "#9aa1a4"; g.beginPath(); g.ellipse(-17, 0, 2.6, 10, 0, 0, TAU); g.fill();
      g.fillStyle = "#c4c9cb"; g.beginPath(); g.ellipse(17, 0, 2.2, 9.5, 0, 0, TAU); g.fill();
    },
    bag(g, R) {
      // Crumpled thin plastic bag.
      blob(g, R, 18, 26, 17, 0.5);
      const gr = g.createRadialGradient(-8, -8, 2, 0, 0, 30);
      gr.addColorStop(0, "rgba(252,251,246,.96)"); gr.addColorStop(0.7, "rgba(226,224,214,.94)"); gr.addColorStop(1, "rgba(190,186,172,.94)");
      g.fillStyle = gr; g.fill();
      g.save(); g.clip();
      for (let i = 0; i < 9; i++) {
        const x = (R() - 0.5) * 44, y = (R() - 0.5) * 28;
        g.strokeStyle = R() < 0.5 ? "rgba(255,255,255,.75)" : "rgba(120,114,98,.3)";
        g.lineWidth = 0.8 + R() * 1.2;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (R() - 0.5) * 20, y + (R() - 0.5) * 14, x + (R() - 0.5) * 26, y + (R() - 0.5) * 18); g.stroke();
      }
      g.restore();
      g.strokeStyle = "rgba(200,196,182,.9)"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(-6, -14); g.quadraticCurveTo(-12, -28, -1, -26); g.stroke();
    },
    paper(g, R) {
      // Crumpled paper ball with faceted shading.
      blob(g, R, 11, 13, 12, 0.35);
      g.fillStyle = "#e7e2d4"; g.fill();
      g.save(); g.clip();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + R() * 0.4, b = a + 0.7 + R() * 0.5;
        const lit = Math.cos(a - 3.9);
        g.fillStyle = lit > 0 ? `rgba(255,255,250,${(0.25 + lit * 0.4).toFixed(2)})` : `rgba(110,100,80,${(0.1 - lit * 0.25).toFixed(2)})`;
        g.beginPath(); g.moveTo((R() - 0.5) * 4, (R() - 0.5) * 4); g.lineTo(Math.cos(a) * 16, Math.sin(a) * 16); g.lineTo(Math.cos(b) * 16, Math.sin(b) * 16); g.fill();
      }
      g.restore();
    },
    sheet(g, R) {
      // A dropped, folded flyer.
      g.beginPath(); g.moveTo(-22, -13); g.lineTo(20, -16); g.lineTo(23, 14); g.lineTo(-20, 16); g.closePath();
      const gr = g.createLinearGradient(-22, -15, 22, 15);
      gr.addColorStop(0, "#f4f1e8"); gr.addColorStop(0.5, "#e6e1d3"); gr.addColorStop(0.52, "#d8d2c2"); gr.addColorStop(1, "#ece8dc");
      g.fillStyle = gr; g.fill();
      g.strokeStyle = "rgba(150,140,120,.35)"; g.lineWidth = 0.7; g.stroke();
      g.strokeStyle = "rgba(90,90,90,.28)"; g.lineWidth = 1.2;
      for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(-16, -8 + i * 5); g.lineTo(6 + R() * 10, -9 + i * 5); g.stroke(); }
      g.fillStyle = "rgba(170,70,50,.6)"; g.fillRect(6, -10, 10, 8);
    },
    cup(g) {
      // Paper coffee cup on its side.
      g.beginPath(); g.moveTo(-17, -8); g.lineTo(15, -12); g.lineTo(15, 12); g.lineTo(-17, 8); g.closePath();
      let gr = g.createLinearGradient(0, -12, 0, 12);
      gr.addColorStop(0, "#d6d0c2"); gr.addColorStop(0.3, "#fbf9f3"); gr.addColorStop(1, "#bdb5a4");
      g.fillStyle = gr; g.fill();
      gr = g.createLinearGradient(0, -11, 0, 11);
      gr.addColorStop(0, "#8a6a4c"); gr.addColorStop(0.35, "#a8845f"); gr.addColorStop(1, "#6d523a");
      g.fillStyle = gr; g.beginPath(); g.moveTo(-6, -9.5); g.lineTo(6, -11); g.lineTo(6, 11); g.lineTo(-6, 9.5); g.fill();
      g.fillStyle = "#3b2f25"; g.beginPath(); g.ellipse(15, 0, 3.5, 12, 0, 0, TAU); g.fill();
      g.strokeStyle = "#f2efe6"; g.lineWidth = 1.6; g.stroke();
    },
    wrapper(g, R) {
      // Crinkled foil snack wrapper.
      g.beginPath(); g.moveTo(-14, -9);
      for (let x = -14; x <= 14; x += 4) g.lineTo(x, -9 + (R() - 0.5) * 2);
      g.lineTo(14, 9);
      for (let x = 14; x >= -14; x -= 4) g.lineTo(x, 9 + (R() - 0.5) * 2);
      g.closePath();
      const gr = g.createLinearGradient(-14, -9, 14, 9);
      gr.addColorStop(0, "#c98a3a"); gr.addColorStop(0.3, "#f1cf8a"); gr.addColorStop(0.55, "#b8762c"); gr.addColorStop(1, "#e2a85a");
      g.fillStyle = gr; g.fill();
      g.fillStyle = "rgba(255,255,255,.3)"; g.fillRect(-6, -9, 4, 18);
      [1, -1].forEach((s) => {
        g.beginPath(); g.moveTo(14 * s, -9);
        for (let i = 0; i <= 6; i++) g.lineTo(14 * s + (i % 2 ? 5 : 3) * s, -9 + i * 3);
        g.lineTo(14 * s, 9); g.closePath();
        g.fillStyle = "#c9cdd0"; g.fill();
      });
    },
    cap(g) {
      const gr = g.createRadialGradient(-2, -2, 0, 0, 0, 6);
      gr.addColorStop(0, "#5f8db3"); gr.addColorStop(1, "#1d3c57");
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 5.5, 0, TAU); g.fill();
    },
  };
  const RUBBISH_SIZE = { bottle: [80, 30], can: [42, 28], bag: [68, 66], paper: [36, 34], sheet: [52, 40], cup: [42, 30], wrapper: [44, 26], cap: [14, 14] };

  // type, x, y, rotation (deg), scale
  const RUBBISH = [
    ["bottle", 640, 1640, -24, 1], ["bag", 724, 1702, 8, 1], ["can", 864, 1620, 22, 1], ["paper", 962, 1690, 0, 1.15],
    ["bottle", 902, 1784, 58, 1.1], ["cup", 602, 1760, 14, 1.05], ["bag", 1014, 1612, -10, 0.9], ["can", 702, 1826, -38, 1.1],
    ["wrapper", 822, 1724, 12, 1], ["sheet", 1060, 1764, -16, 1.1], ["paper", 556, 1664, 0, 0.95], ["can", 1124, 1652, 30, 0.9],
    ["sheet", 478, 1806, 18, 1.1], ["cup", 1184, 1824, -20, 1.1], ["wrapper", 418, 1704, -18, 0.95], ["bottle", 764, 1886, 78, 1.15],
    ["bag", 1252, 1722, 4, 0.95], ["cap", 980, 1820, 0, 1.2],
  ];
  const BIN = { x: 1000, y: 1840 };

  function drawBagSprite(g) {
    const R = rng(77);
    g.save(); g.translate(0, 6);
    blob(g, R, 16, 50, 46, 0.18);
    const gr = g.createRadialGradient(-16, -18, 4, 0, 0, 60);
    gr.addColorStop(0, "#4e5d4c"); gr.addColorStop(0.45, "#2a3529"); gr.addColorStop(1, "#141b14");
    g.fillStyle = gr; g.fill(); g.restore();
    g.strokeStyle = "rgba(255,255,255,.14)"; g.lineWidth = 3; g.lineCap = "round";
    g.beginPath(); g.moveTo(-30, -14); g.quadraticCurveTo(-38, 8, -26, 30); g.stroke();
    g.beginPath(); g.moveTo(-8, -26); g.quadraticCurveTo(-14, -6, -10, 10); g.stroke();
    g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(10, -24); g.quadraticCurveTo(20, 4, 12, 38); g.stroke();
    g.fillStyle = "#1c251c"; // tied neck
    g.beginPath(); g.moveTo(-9, -36); g.quadraticCurveTo(0, -44, 9, -36); g.lineTo(6, -48); g.quadraticCurveTo(18, -60, 12, -52); g.lineTo(2, -50); g.lineTo(-12, -60); g.quadraticCurveTo(-16, -52, -6, -48); g.closePath(); g.fill();
  }

  function drawPinSprite(g) {
    g.translate(0, 26);
    const gr = g.createLinearGradient(-20, -60, 20, 0);
    gr.addColorStop(0, "#c46a40"); gr.addColorStop(1, "#8c3c1f");
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-14, -18, -21, -30, -21, -41); g.arc(0, -41, 21, Math.PI, 0); g.bezierCurveTo(21, -30, 14, -18, 0, 0); g.fill();
    g.fillStyle = "#fbf8f1"; g.beginPath(); g.arc(0, -41, 7.5, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,.25)"; g.beginPath(); g.ellipse(-8, -50, 5, 8, -0.5, 0, TAU); g.fill();
  }

  const FLOWER_TYPES = ["daisy", "daisy", "buttercup", "daisy", "cornflower", "clover", "buttercup", "daisy"];
  function drawFlowerHead(g, type, R) {
    if (type === "daisy") {
      for (let i = 0; i < 13; i++) {
        g.save(); g.rotate((i / 13) * TAU + R() * 0.2);
        g.fillStyle = i % 3 ? "#f8f6ee" : "#ece8dc";
        g.beginPath(); g.ellipse(0, -7, 1.9, 5.2, 0, 0, TAU); g.fill(); g.restore();
      }
      const gr = g.createRadialGradient(-1, -1, 0, 0, 0, 3.6);
      gr.addColorStop(0, "#f5cf55"); gr.addColorStop(1, "#c98b1d");
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 3.4, 0, TAU); g.fill();
    } else if (type === "buttercup") {
      for (let i = 0; i < 5; i++) {
        g.save(); g.rotate((i / 5) * TAU);
        const gr = g.createRadialGradient(0, -5, 0, 0, -5, 5);
        gr.addColorStop(0, "#fbe57a"); gr.addColorStop(1, "#d9a21f");
        g.fillStyle = gr; g.beginPath(); g.arc(0, -4.5, 4.4, 0, TAU); g.fill(); g.restore();
      }
      g.fillStyle = "#b9861a"; g.beginPath(); g.arc(0, 0, 2, 0, TAU); g.fill();
    } else if (type === "cornflower") {
      for (let i = 0; i < 9; i++) {
        g.save(); g.rotate((i / 9) * TAU);
        g.fillStyle = i % 2 ? "#6f7fc4" : "#5a6ab3";
        g.beginPath(); g.moveTo(0, 0); g.lineTo(-2.6, -7.5); g.lineTo(0, -6.2); g.lineTo(2.6, -7.5); g.closePath(); g.fill(); g.restore();
      }
      g.fillStyle = "#3f4a8a"; g.beginPath(); g.arc(0, 0, 2.2, 0, TAU); g.fill();
    } else {
      for (let i = 0; i < 22; i++) {
        const a = R() * TAU, d = R() * 4.5;
        g.fillStyle = R() < 0.5 ? "#d99bb3" : "#c47a98";
        g.beginPath(); g.ellipse(Math.cos(a) * d, Math.sin(a) * d - 1, 1.6, 2.6, a, 0, TAU); g.fill();
      }
    }
  }

  // Wildflowers that bloom where the rubbish was.
  const FLOWERS = (() => {
    const R = rng(404), out = [];
    while (out.length < 40) {
      const x = 360 + R() * 920, y = 1610 + R() * 300;
      if (Math.abs(x - TX) < 70 && y < 1600) continue;
      if (out.some(([fx, fy]) => Math.hypot(fx - x, fy - y) < 34)) continue;
      out.push([Math.round(x), Math.round(y)]);
    }
    return out.sort((a, b) => a[1] - b[1]);
  })();

  /* ------------------------------------------------------------------ */
  /* Build cached layers                                                 */
  /* ------------------------------------------------------------------ */
  // The landscape, the ground and the tree are painted once, each into its own
  // <canvas> inside #story-scene. Frames only move them with CSS transforms,
  // which the graphics card does almost for free. #story-canvas on top holds
  // just the small moving things (rubbish, pins, bag, flowers, grass, leaves).

  const scene = document.getElementById("story-scene");
  const fxRays = document.getElementById("story-rays");
  const fxWarm = document.getElementById("story-warm");
  const fxFlash = document.getElementById("story-flash");

  let S = null;
  let builtQ = 0;
  const TREE = buildTree();
  const GRASS_TONES = 10;

  function mount(L) {
    L.c.className = "story-layer";
    L.c.setAttribute("aria-hidden", "true");
    scene.appendChild(L.c);
    return L;
  }

  function build(q) {
    scene.querySelectorAll(".story-layer").forEach((n) => n.remove());

    const qb = Math.max(0.35, q * 0.5); // the background is soft on purpose (depth of field)
    const bg = layer(WX0, WY0, WX1, 1530, qb);
    paintBackground(bg);
    const ground = layer(WX0, 1440, WX1, WY1, q);
    paintGround(ground);

    const [bx0, by0, bx1, by1] = TREE.box;
    const back = layer(bx0, by0, bx1, by1, q);
    const tb = performance.now();
    drawTwigs(back.g, TREE);
    drawLeaves(back, TREE, (c) => c.z < 0.28, 101);
    drawWood(back.g, TREE);
    drawLeaves(back, TREE, (c) => c.z >= 0.28 && c.z < 0.74, 202);
    const front = layer(bx0, by0, bx1, by1, q);
    drawLeaves(front, TREE, (c) => c.z >= 0.74, 303);
    window.__storyTreeMs = Math.round(performance.now() - tb);
    back.tree = front.tree = true;
    [bg, ground, back, front].forEach(mount);

    const sq = Math.min(2.5, q * 1.4);
    const items = RUBBISH.map(([type, x, y, rot, sc], i) => {
      const [w, h] = RUBBISH_SIZE[type];
      const R = rng(500 + i);
      return { x, y, rot: (rot * Math.PI) / 180, sc, w, spr: sprite(w + 6, h + 6, sq, (g) => RUBBISH_DRAW[type](g, R)) };
    });
    const bagSpr = sprite(120, 140, sq, drawBagSprite);
    const pinSpr = sprite(48, 70, sq, drawPinSprite);
    const flowers = FLOWERS.map(([x, y], i) => {
      const type = FLOWER_TYPES[i % FLOWER_TYPES.length];
      const R = rng(900 + i);
      const depth = clamp((y - 1600) / 320);
      return { x, y, h: 24 + R() * 18 + depth * 10, size: 1.35 + depth * 0.45, lean: (R() - 0.5) * 8, spr: sprite(22, 22, sq, (g) => drawFlowerHead(g, type, R)) };
    });

    // Soft contact shadow, drawn once and stretched under each object.
    const shadowSpr = sprite(100, 100, 0.6, (g) => {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 50);
      gr.addColorStop(0, "rgba(18,24,12,.7)"); gr.addColorStop(1, "rgba(18,24,12,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.fill();
    });

    // The verify check mark, with its blurred shadow baked in.
    const checkSpr = sprite(270, 270, sq, (g) => {
      g.save();
      g.shadowColor = "rgba(10,20,12,.35)"; g.shadowBlur = 24 * sq; g.shadowOffsetY = 8 * sq;
      g.fillStyle = "#24402d"; g.beginPath(); g.arc(0, 0, 70, 0, TAU); g.fill();
      g.restore();
      g.strokeStyle = "rgba(201,216,160,.85)"; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 88, 0, TAU); g.stroke();
      g.strokeStyle = "#f6f3ea"; g.lineWidth = 13; g.lineCap = "round"; g.lineJoin = "round";
      g.beginPath(); g.moveTo(-29, 2); g.lineTo(-8, 23); g.lineTo(31, -19); g.stroke();
    });

    // Foreground grass that sways (drawn each frame, over the rubbish). Blades share
    // a few tones so each tone is filled in one go.
    const R = rng(61);
    const tones = Array.from({ length: GRASS_TONES }, () => ({ h: 75 + R() * 30, s: 22 + R() * 16, l: 24 + R() * 20 }));
    const fg = Array.from({ length: GRASS_TONES }, () => []);
    for (let i = 0; i < 440; i++) {
      const y = 1530 + Math.pow(R(), 0.6) * (WY1 - 1530);
      const x = WX0 + R() * (WX1 - WX0);
      const depth = clamp((y - 1480) / 600);
      fg[(R() * GRASS_TONES) | 0].push({ x, y, len: 12 + depth * 30 + R() * 12, w: 1.4 + depth * 2.2, lean: (R() - 0.5) * 0.7, ph: R() * TAU });
    }

    S = { layers: [bg, ground, back, front], bg, ground, back, front, items, bagSpr, pinSpr, flowers, shadowSpr, checkSpr, tones, fg, grassDq: -1, grassCols: [] };
    builtQ = q;
    sizeLayers();
  }

  function sizeLayers() {
    if (!S) return;
    for (const L of S.layers) {
      L.c.style.width = `${((L.x1 - L.x0) * scale).toFixed(2)}px`;
      L.c.style.height = `${((L.y1 - L.y0) * scale).toFixed(2)}px`;
      if (L.tree) L.c.style.transformOrigin = `${((TX - L.x0) * scale).toFixed(2)}px ${((BASE_Y - L.y0) * scale).toFixed(2)}px`;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Layout and camera                                                   */
  /* ------------------------------------------------------------------ */

  let W = 0, H = 0, dpr = 1, scale = 1, wide = true, startY = 0, total = 1, secTop = 0;
  const view = { ox: 0, oy: 0, s: 1 }; // world -> CSS px

  function layout(force) {
    const w = sticky.clientWidth, h = sticky.clientHeight;
    if (!w || !h) return;
    const d = Math.min(1.5, window.devicePixelRatio || 1);
    // Phones fire resize when the address bar slides; the scene's size doesn't change, so do nothing.
    if (!force && S && w === W && h === H && d === dpr) return;
    if (w !== W || h !== H || d !== dpr) {
      W = w; H = h; dpr = d;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      paintRays();
    }
    scale = Math.max(W / 1600, H / 1000);
    wide = W / H > 1.05 && W > 760;
    startY = wide ? 80 : clamp(((intro.offsetTop + intro.offsetHeight) / H) * 1000 + 20, 0, 760);
    total = section.offsetHeight - sticky.offsetHeight;
    secTop = section.getBoundingClientRect().top + window.scrollY;
    const q = clamp(Math.round(Math.min(scale * (window.devicePixelRatio || 1), 1.4) * 4) / 4, 0.5, 1.4);
    if (!S || Math.abs(q - builtQ) > 0.3) build(q);
    else sizeLayers();
    frame(performance.now(), true);
  }

  // Sun rays: painted once per size into a soft, low-resolution image (a static image
  // is cheaper to show than a live canvas, and no blending modes are needed).
  function paintRays() {
    const c = document.createElement("canvas");
    const cw = (c.width = Math.max(1, Math.round(W / 2)));
    const ch = (c.height = Math.max(1, Math.round(H / 2)));
    const g = c.getContext("2d");
    for (let i = 0; i < 4; i++) {
      const x0 = cw * (-0.15 + i * 0.16), w0 = cw * (0.05 + i * 0.015);
      const gr = g.createLinearGradient(x0, 0, x0 + cw * 0.5, ch);
      gr.addColorStop(0, "rgba(255,246,222,.17)");
      gr.addColorStop(1, "rgba(255,246,222,0)");
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(x0, -10); g.lineTo(x0 + w0, -10); g.lineTo(x0 + w0 + cw * 0.55, ch); g.lineTo(x0 + cw * 0.5, ch); g.closePath(); g.fill();
    }
    fxRays.style.backgroundImage = `url(${c.toDataURL()})`;
  }

  function progress() {
    // From the scroll position alone, so reading it never makes the browser recompute the layout.
    return total > 0 ? clamp((window.scrollY - secTop) / total) : 0;
  }

  /* ------------------------------------------------------------------ */
  /* Frame                                                               */
  /* ------------------------------------------------------------------ */

  let born = 0, lastP = -1, lastDraw = 0, fxUsed = true;
  const leaves = Array.from({ length: 9 }, (_, i) => ({ seed: i * 1.37, x: TX - 380 + ((i * 97) % 760), dur: 9 + (i % 4) * 1.6 }));

  // Write a style only when it changes (writes are what make the browser work).
  function css(el, prop, v) {
    const c = el.__yq || (el.__yq = {});
    if (c[prop] !== v) { c[prop] = v; el.style[prop] = v; }
  }
  function show(el, o, interactive) {
    css(el, "opacity", o.toFixed(2));
    css(el, "visibility", o < 0.01 ? "hidden" : "visible");
    if (interactive) css(el, "pointerEvents", o > 0.5 ? "auto" : "none");
  }
  const px = (v) => v.toFixed(1);

  function frame(now, force) {
    if (!S) return;
    if (!born) born = now;
    const t = reduce ? 0 : (now - born) / 1000;
    const p = reduce ? 0 : progress();
    // When the page isn't scrolling, the gentle idle motion runs at 30 fps.
    if (!force && t > 2 && p === lastP && now - lastDraw < 30) return;
    lastP = p; lastDraw = now;

    const grow = reduce ? 1 : easeOut(clamp(t / 1.8));
    const fadeIn = reduce ? 1 : clamp(t / 0.6);

    // Camera.
    const cam = smooth(seg(p, 0.04, 0.4));
    const camY = lerp(startY, -1000, cam);
    const vbx = wide ? lerp(-480, -260, cam) : 0;
    const s = (view.s = scale);
    view.ox = (W - 1600 * s) / 2 - vbx * s;
    view.oy = (H - 1000 * s) / 2 + camY * s;

    const dirty = seg(p, 0.28, 0.42) * (1 - seg(p, 0.78, 0.9));
    const bloom = seg(p, 0.8, 0.95);

    /* ---------- painted layers: moved by the graphics card ---------- */
    const at = (L) => `translate3d(${px(view.ox + L.x0 * s)}px,${px(view.oy + L.y0 * s)}px,0)`;
    css(S.bg.c, "transform", at(S.bg));
    css(S.ground.c, "transform", at(S.ground));
    css(S.bg.c, "opacity", fadeIn.toFixed(2));
    css(S.ground.c, "opacity", fadeIn.toFixed(2));

    // Tree: grows in on load, then sways gently from the base.
    const sway = reduce ? 0 : 0.0032 * Math.sin(t * 0.55) + 0.0012 * Math.sin(t * 1.43 + 1);
    const treeT = ` rotate(${sway.toFixed(5)}rad) scale(${(0.9 + 0.1 * grow).toFixed(4)},${(0.86 + 0.14 * grow).toFixed(4)})`;
    css(S.back.c, "transform", at(S.back) + treeT);
    const fdx = reduce ? 0 : 2.2 * Math.sin(t * 1.05 + 0.4) * s, fdy = reduce ? 0 : 1.1 * Math.sin(t * 1.31) * s;
    css(S.front.c, "transform", at(S.front) + treeT + ` translate(${fdx.toFixed(2)}px,${fdy.toFixed(2)}px)`);
    css(S.back.c, "opacity", grow.toFixed(2));
    css(S.front.c, "opacity", grow.toFixed(2));

    // Pollution: the scene loses colour and warmth (the rubbish on top keeps its colour).
    const dq = Math.round(dirty * 50) / 50;
    css(scene, "filter", dq > 0 ? `saturate(${(1 - 0.62 * dq).toFixed(2)}) sepia(${(0.24 * dq).toFixed(2)}) brightness(${(1 - 0.08 * dq).toFixed(2)})` : "none");

    // Screen light: sun rays, warm glow at the end, the verify flash.
    show(fxRays, Math.min(1, ((1 - seg(p, 0.05, 0.3)) * 0.85 + bloom) * fadeIn));
    show(fxWarm, bloom * 0.13);
    show(fxFlash, Math.max(0, seg(p, 0.705, 0.72) - seg(p, 0.72, 0.75)) * 0.6);

    /* ---------- moving details: drawn on the canvas ---------- */
    const k = s * dpr;
    const top = -view.oy / s, bottom = (H - view.oy) / s;
    const left = -view.ox / s, right = (W - view.ox) / s;
    // Leave the canvas alone when it was empty and stays empty.
    const busy = (!reduce && top < 1520) || bottom > 1500 || (bottom > 1240 && p > 0.29);
    if (busy || fxUsed) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    fxUsed = busy;
    ctx.setTransform(k, 0, 0, k, view.ox * dpr, view.oy * dpr);

    // Drifting leaves (only while the canopy is in view).
    if (!reduce && top < 1520) {
      for (const lf of leaves) {
        const u = ((t + lf.seed * 7) % lf.dur) / lf.dur;
        const a = clamp(u * 8) * clamp((1 - u) * 6) * 0.9;
        if (a <= 0) continue;
        const x = lf.x + Math.sin(u * 6 + lf.seed) * 40 - u * 60, y = 640 + u * 880;
        if (y < top - 10 || y > bottom + 10) continue;
        ctx.save(); ctx.translate(x, y); ctx.rotate(u * 9 + lf.seed); ctx.scale(1, Math.cos(u * 14 + lf.seed));
        ctx.globalAlpha = a;
        ctx.fillStyle = lf.seed % 2 > 1 ? "#8a8f45" : "#5d7b45";
        ctx.beginPath(); ctx.ellipse(0, 0, 6, 3, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }

    if (busy && bottom > 1240) {
      // Reward: wildflowers grow, stem first.
      if (p > 0.8) {
        ctx.lineCap = "round";
        S.flowers.forEach((fw, i) => {
          const g = easeOut(seg(p, 0.8 + i * 0.0028, 0.87 + i * 0.0028));
          if (g <= 0 || fw.y - fw.h > bottom || fw.y < top) return;
          const sw = reduce ? 0 : Math.sin(t * 1.6 + i) * 1.5;
          const hx = fw.x + fw.lean * g + sw * g, hy = fw.y - fw.h * g;
          ctx.strokeStyle = "#4b6b3a"; ctx.lineWidth = 1.4 + fw.size * 0.5;
          ctx.beginPath(); ctx.moveTo(fw.x, fw.y); ctx.quadraticCurveTo(fw.x + fw.lean * 0.3, fw.y - fw.h * 0.5 * g, hx, hy); ctx.stroke();
          ctx.fillStyle = "#56783f"; ctx.beginPath(); ctx.ellipse(fw.x + 4 * g, fw.y - fw.h * 0.35 * g, 5 * g, 2 * g, -0.5, 0, TAU); ctx.fill();
          const hs = clamp((g - 0.4) / 0.6);
          if (hs > 0) {
            const w = 22 * hs * fw.size, h = 22 * hs * fw.size * 0.85;
            ctx.drawImage(fw.spr.c, hx - w / 2, hy - h / 2, w, h);
          }
        });
      }

      // Rubbish: settles in, then is picked up into the bag.
      let collected = 0;
      S.items.forEach((it, i) => {
        const a = seg(p, 0.3 + i * 0.007, 0.35 + i * 0.007);
        if (a <= 0) return;
        const c = smooth(seg(p, 0.56 + i * 0.0065, 0.6 + i * 0.0065));
        if (c >= 1) { collected++; return; }
        const ap = easeOut(a);
        const x = lerp(it.x, BIN.x, c);
        const y = lerp(it.y - 14 * (1 - ap), BIN.y - 30, c) - Math.sin(Math.PI * c) * 90;
        if (y < top - 60 || y > bottom + 60) return;
        const sc = it.sc * (0.92 + 0.08 * ap) * (1 - 0.55 * c);
        const alpha = ap * (1 - seg(c, 0.8, 1));
        if (c < 0.3) { // contact shadow
          const r = it.w * 0.5 * it.sc;
          ctx.globalAlpha = alpha * (1 - c / 0.3) * 0.55;
          ctx.drawImage(S.shadowSpr.c, it.x + 5 - r, it.y + 7 - r * 0.4, r * 2, r * 0.8);
        }
        ctx.globalAlpha = alpha;
        ctx.save();
        ctx.translate(x, y); ctx.rotate(it.rot + c * 0.7); ctx.scale(sc, sc);
        const L = it.spr;
        ctx.drawImage(L.c, L.x0, L.y0, L.x1 - L.x0, L.y1 - L.y0);
        ctx.restore();
      });
      ctx.globalAlpha = 1;

      // Fix: pins drop onto the rubbish.
      const pinsGone = seg(p, 0.53, 0.56);
      if (pinsGone < 1) {
        [[724, 1690], [962, 1680], [602, 1752]].forEach(([x, y], j) => {
          const d = seg(p, 0.42 + j * 0.025, 0.46 + j * 0.025);
          if (d <= 0) return;
          const e = easeOut(d);
          ctx.globalAlpha = (1 - pinsGone) * clamp(d * 3);
          ctx.fillStyle = "rgba(20,24,14,.3)"; ctx.beginPath(); ctx.ellipse(x + 3, y + 2, 12 * e, 4 * e, 0, 0, TAU); ctx.fill();
          const L = S.pinSpr, py = y - 40 - 220 * (1 - e);
          ctx.drawImage(L.c, x + L.x0, py + L.y0, L.x1 - L.x0, L.y1 - L.y0);
        });
        ctx.globalAlpha = 1;
      }

      // Clean: the bag appears, fills, and is carried away.
      const bagIn = easeOut(seg(p, 0.52, 0.56));
      const bagOut = smooth(seg(p, 0.8, 0.86));
      if (bagIn > 0 && bagOut < 1) {
        const fill = 0.82 + 0.3 * (collected / S.items.length);
        const bx = BIN.x + bagOut * 520;
        const al = bagIn * (1 - bagOut);
        ctx.globalAlpha = al * 0.72;
        ctx.drawImage(S.shadowSpr.c, bx + 8 - 70, BIN.y + 50 - 17.5, 140, 35);
        ctx.globalAlpha = al;
        const L = S.bagSpr, sx = fill * bagIn, sy = fill * (0.9 + 0.1 * bagIn);
        ctx.drawImage(L.c, bx + L.x0 * sx, BIN.y + L.y0 * sy, (L.x1 - L.x0) * sx, (L.y1 - L.y0) * sy);
        ctx.globalAlpha = 1;
      }

      // Foreground grass swaying in the wind (desaturated while polluted).
      if (bottom > 1500) {
        const gq = Math.round(dirty * 10);
        if (gq !== S.grassDq) {
          const d = gq / 10;
          S.grassCols = S.tones.map((c) => hsl(c.h, c.s * (1 - d * 0.7), c.l + d * 6, 0.95));
          S.grassDq = gq;
        }
        const wind = reduce ? 0 : 0.16, tw = t * 1.7;
        for (let n = 0; n < GRASS_TONES; n++) {
          ctx.beginPath();
          for (const b of S.fg[n]) {
            if (b.y < top || b.y - b.len > bottom || b.x < left - 40 || b.x > right + 40) continue;
            const bend = (b.lean + wind * Math.sin(tw + b.x * 0.015 + b.ph)) * b.len;
            ctx.moveTo(b.x - b.w / 2, b.y);
            ctx.quadraticCurveTo(b.x + bend * 0.35, b.y - b.len * 0.6, b.x + bend, b.y - b.len);
            ctx.quadraticCurveTo(b.x + bend * 0.35 + b.w * 0.4, b.y - b.len * 0.6, b.x + b.w / 2, b.y);
            ctx.closePath();
          }
          ctx.fillStyle = S.grassCols[n];
          ctx.fill();
        }
      }

      // Verify: a check mark (an interface element, so it stays crisp).
      const ck = easeOut(seg(p, 0.72, 0.76));
      const ckOut = seg(p, 0.8, 0.83);
      if (ck > 0 && ckOut < 1) {
        const cs = ck * (1 - 0.3 * ckOut), L = S.checkSpr;
        ctx.globalAlpha = 1 - ckOut;
        ctx.drawImage(L.c, TX + L.x0 * cs, 1370 + L.y0 * cs, (L.x1 - L.x0) * cs, (L.y1 - L.y0) * cs);
        ctx.globalAlpha = 1;
      }
    }

    /* ---------- HTML overlays ---------- */
    const out = seg(p, 0.02, 0.09);
    show(intro, 1 - out, true);
    css(intro, "translate", `0 ${px(-24 * out)}px`);
    show(hint, 1 - seg(p, 0, 0.03));
    show(skip, 1 - seg(p, 0.88, 0.92), true);
    css(bar, "transform", `scaleX(${p.toFixed(4)})`);

    const cIn = seg(p, 0.83, 0.87), cOut = seg(p, 0.92, 0.95);
    show(chip, cIn * (1 - cOut));
    if (cIn > 0 && cOut < 1) {
      const sx = view.ox + TX * s, sy = view.oy + 1370 * s - 60 * seg(p, 0.83, 0.95);
      css(chip, "transform", `translate(${px(sx)}px, ${px(sy)}px) translate(-50%, -50%) scale(${(0.85 + 0.15 * easeOut(cIn)).toFixed(3)})`);
    }

    const RANGES = [[0.4, 0.53], [0.53, 0.7], [0.7, 0.8], [0.8, 0.93]];
    caps.forEach((cap, i) => {
      const [a, b] = RANGES[i];
      show(cap, seg(p, a, a + 0.025) * (1 - seg(p, b - 0.02, b)));
      css(cap, "transform", `translateY(${px(12 * (1 - seg(p, a, a + 0.025)))}px)`);
    });
    show(endBox, seg(p, 0.93, 0.97), true);
  }

  /* ------------------------------------------------------------------ */
  /* Loop: only runs while the story is on screen                        */
  /* ------------------------------------------------------------------ */

  let visible = true, raf = 0;
  function loop(now) {
    raf = 0;
    frame(now);
    if (visible && !document.hidden && !reduce) raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

  if (!reduce) section.classList.add("on");
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }).observe(section);
  }
  document.addEventListener("visibilitychange", kick);
  window.addEventListener("scroll", kick, { passive: true });
  window.addEventListener("resize", () => { layout(); kick(); });
  document.addEventListener("langchange", () => requestAnimationFrame(() => { layout(true); kick(); }));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { layout(true); kick(); });

  skip.addEventListener("click", () => {
    const next = document.getElementById("how");
    if (next) next.scrollIntoView({ behavior: "smooth" });
  });

  // Paint after the page has shown its text, so the headline never waits for the scene.
  requestAnimationFrame(() => setTimeout(() => { layout(); kick(); }, 0));
})();
