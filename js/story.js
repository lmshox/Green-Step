// Yashil Qadam — hero scroll story.
// A big tree; scrolling moves the "camera" down to the ground, rubbish appears,
// then the four steps play out: Fix (pins) → Clean (into the bag) → Verify (check)
// → Reward (flowers, +120). Scroll position drives everything, so the user sets the pace.
(function () {
  "use strict";

  const section = document.getElementById("story");
  if (!section) return;

  const NS = "http://www.w3.org/2000/svg";
  const sticky = section.querySelector(".story-sticky");
  const svg = section.querySelector(".story-svg");
  const world = document.getElementById("world");
  const intro = document.getElementById("story-intro");
  const endBox = document.getElementById("story-end");
  const chip = document.getElementById("story-chip");
  const hint = document.getElementById("story-hint");
  const skip = document.getElementById("story-skip");
  const bar = document.getElementById("story-bar");
  const caps = [...section.querySelectorAll(".story-cap")];
  const $ = (id) => document.getElementById(id);
  const dull = $("dull"), flash = $("flash"), dirt = $("dirt"), lush = $("lush"), bag = $("bag"), check = $("check");

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- helpers ---------- */
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const ease = (t) => t * t * (3 - 2 * t);
  const back = (t) => { const c = 1.7; return t <= 0 ? 0 : 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const f = (n) => n.toFixed(1);

  /* ---------- rubbish ---------- */
  const SHAPES = {
    bottle: '<rect x="-9" y="-30" width="18" height="48" rx="6" fill="#8cc1cf"/><rect x="-5" y="-41" width="10" height="13" fill="#8cc1cf"/><rect x="-5.5" y="-47" width="11" height="7" rx="1.5" fill="#2f6fa0"/><rect x="-9" y="-12" width="18" height="12" fill="#eaf3f5" opacity=".8"/>',
    can: '<rect x="-10" y="-16" width="20" height="32" rx="3" fill="#c2452f"/><rect x="-10" y="-16" width="20" height="4" fill="#922f1f"/><rect x="-10" y="-2" width="20" height="6" fill="#f1e4d4"/>',
    bag: '<path d="M-30 10 C-34 -10 -18 -26 -2 -22 C6 -32 22 -28 24 -16 C36 -10 34 12 22 18 C6 26 -22 26 -30 10Z" fill="#f4f3ee" stroke="#d6d3c6" stroke-width="2"/><path d="M-8 -22 C-10 -34 0 -38 4 -28" fill="none" stroke="#d6d3c6" stroke-width="3"/>',
    box: '<rect x="-26" y="-18" width="52" height="36" rx="2" fill="#c9a26b"/><path d="M-26 -18 L-14 -28 L14 -28 L26 -18" fill="#b48a52"/><rect x="-4" y="-18" width="8" height="36" fill="#e2c792"/>',
    cup: '<path d="M-12 -16 L12 -16 L9 18 L-9 18Z" fill="#f3efe6" stroke="#d8d2c4" stroke-width="2"/><rect x="-14" y="-21" width="28" height="6" rx="2" fill="#6b5440"/><path d="M3 -21 L9 -36" stroke="#c2452f" stroke-width="3" stroke-linecap="round"/>',
    wrap: '<path d="M-18 -9 L18 -11 L19 8 L-17 10Z" fill="#e0b23a"/><path d="M-18 -9 L-27 -14 L-25 1 L-27 14 L-17 10Z M18 -11 L27 -16 L26 0 L28 13 L19 8Z" fill="#c99a25"/>',
  };
  // type, x, y, rotation (world units; the tree stands at x = 800)
  const RUBBISH = [
    ["bottle", 640, 1640, -30], ["bag", 720, 1700, 0], ["can", 862, 1622, 20], ["box", 962, 1692, -8],
    ["bottle", 900, 1782, 62], ["cup", 600, 1762, 10], ["bag", 1012, 1610, 0], ["can", 700, 1824, -40],
    ["wrap", 822, 1722, 15], ["bottle", 1060, 1762, -70], ["bag", 560, 1660, 0], ["can", 1122, 1652, 30],
    ["box", 478, 1802, 12], ["cup", 1182, 1822, -15], ["wrap", 420, 1702, -20], ["bottle", 760, 1882, 80],
    ["bag", 1250, 1720, 0], ["can", 360, 1620, -25],
  ];
  const BIN = { x: 1000, y: 1840 };
  const rubbishG = $("rubbish");
  const items = RUBBISH.map(([type, x, y, r]) => {
    const g = document.createElementNS(NS, "g");
    g.innerHTML = `<ellipse cx="0" cy="20" rx="24" ry="5" fill="#55704a" opacity=".35"/>` + SHAPES[type];
    g.setAttribute("opacity", "0");
    rubbishG.appendChild(g);
    return { g, x, y, r };
  });

  /* ---------- pins (Fix) ---------- */
  const PINS = [[720, 1680], [962, 1672], [600, 1745]];
  const pinsG = $("pins");
  const pins = PINS.map(([x, y]) => {
    const g = document.createElementNS(NS, "g");
    g.innerHTML =
      '<ellipse cx="0" cy="2" rx="12" ry="4" fill="#3b2a1d" opacity=".25"/>' +
      '<path d="M0 0 C-14 -18 -22 -30 -22 -42 A22 22 0 1 1 22 -42 C22 -30 14 -18 0 0Z" fill="#b4532a"/>' +
      '<circle cx="0" cy="-42" r="8" fill="#fff"/>';
    g.setAttribute("opacity", "0");
    pinsG.appendChild(g);
    return { g, x, y };
  });

  /* ---------- flowers (Reward) ---------- */
  const FLOWER_COLORS = ["#f2d16b", "#f7f3ea", "#e8a0a0", "#d4ec7a", "#f2d16b", "#c9b8ea"];
  const FLOWERS = [
    [640, 1650], [720, 1720], [870, 1630], [960, 1710], [905, 1800], [600, 1780], [1010, 1625], [700, 1840],
    [820, 1740], [1060, 1780], [555, 1675], [1120, 1665], [480, 1815], [1180, 1840], [420, 1715], [770, 1900],
    [1250, 1740], [360, 1640], [1000, 1880], [530, 1900],
  ];
  const flowersG = $("flowers");
  const flowers = FLOWERS.map(([x, y], i) => {
    const c = FLOWER_COLORS[i % FLOWER_COLORS.length];
    const g = document.createElementNS(NS, "g");
    const petals = [0, 72, 144, 216, 288]
      .map((a) => `<circle cx="${f(Math.cos((a * Math.PI) / 180) * 7)}" cy="${f(-34 + Math.sin((a * Math.PI) / 180) * 7)}" r="6" fill="${c}"/>`)
      .join("");
    g.innerHTML =
      '<path d="M0 0 C1 -12 -1 -22 0 -32" stroke="#3f7d57" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<path d="M0 -12 C8 -18 14 -16 16 -12 C10 -8 4 -9 0 -12Z" fill="#4f8c63"/>' +
      petals + '<circle cx="0" cy="-34" r="4.5" fill="#d9962f"/>';
    g.setAttribute("transform", `translate(${x} ${y}) scale(0)`);
    flowersG.appendChild(g);
    return { g, x, y };
  });

  /* ---------- layout ---------- */
  let startY = 0;
  let wide = true;
  function layout() {
    const w = sticky.clientWidth, h = sticky.clientHeight;
    wide = w / h > 1.05 && w > 760;
    if (wide) {
      startY = 0;
    } else {
      // Push the tree below the headline; in portrait the full 1000 units of height are visible.
      const bottom = intro.offsetTop + intro.offsetHeight;
      startY = clamp((bottom / h) * 1000 + 20, 0, 760);
    }
    render();
  }

  function progress() {
    const r = section.getBoundingClientRect();
    const total = section.offsetHeight - sticky.offsetHeight;
    return total > 0 ? clamp(-r.top / total) : 0;
  }

  function screenPoint(x, y) {
    const m = world.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = x; pt.y = y;
    const s = pt.matrixTransform(m), box = sticky.getBoundingClientRect();
    return { x: s.x - box.left, y: s.y - box.top };
  }

  function show(el, o, interactive) {
    el.style.opacity = o.toFixed(3);
    el.style.visibility = o < 0.01 ? "hidden" : "visible";
    if (interactive) el.style.pointerEvents = o > 0.5 ? "auto" : "none";
  }

  /* ---------- the timeline ---------- */
  function render() {
    const p = reduce ? 0 : progress();

    // Camera glides down the trunk.
    const cam = ease(seg(p, 0.04, 0.4));
    world.setAttribute("transform", `translate(0 ${f(lerp(startY, -1000, cam))})`);
    // On wide screens the tree starts on the right, beside the headline, and the
    // camera pans back toward it on the way down.
    svg.setAttribute("viewBox", `${wide ? f(lerp(-480, -260, cam)) : 0} 0 1600 1000`);

    // Headline fades as the story starts.
    const io = 1 - seg(p, 0.02, 0.09);
    show(intro, io, true);
    intro.style.marginTop = `${f(-24 * seg(p, 0.02, 0.09))}px`;
    show(hint, 1 - seg(p, 0, 0.03));
    show(skip, 1 - seg(p, 0.88, 0.92), true);
    bar.style.width = `${(p * 100).toFixed(2)}%`;

    // The place gets dirty, then clean again.
    const dirty = seg(p, 0.28, 0.42) * (1 - seg(p, 0.78, 0.9));
    dull.setAttribute("opacity", (dirty * 0.3).toFixed(3));
    dirt.setAttribute("opacity", (dirty * 0.65).toFixed(3));
    lush.setAttribute("opacity", (seg(p, 0.8, 0.92) * 0.45).toFixed(3));

    // Rubbish pops in, then flies into the bag one piece at a time.
    let collected = 0;
    items.forEach((it, i) => {
      const s = back(seg(p, 0.3 + i * 0.007, 0.35 + i * 0.007));
      const t = ease(seg(p, 0.56 + i * 0.0065, 0.6 + i * 0.0065));
      if (t >= 1) collected++;
      const x = lerp(it.x, BIN.x, t);
      const y = lerp(it.y, BIN.y - 20, t) - Math.sin(Math.PI * t) * 140;
      const sc = s * (1 - 0.7 * t);
      it.g.setAttribute("transform", `translate(${f(x)} ${f(y)}) rotate(${f(it.r + t * 260)}) scale(${sc.toFixed(3)})`);
      it.g.setAttribute("opacity", s > 0 ? (1 - seg(t, 0.75, 1)).toFixed(3) : "0");
    });

    // Fix: pins drop onto the rubbish.
    const pinsGone = seg(p, 0.53, 0.56);
    pins.forEach((pin, j) => {
      const d = seg(p, 0.42 + j * 0.025, 0.46 + j * 0.025);
      pin.g.setAttribute("transform", `translate(${pin.x} ${f(pin.y - 260 * (1 - back(d)))})`);
      pin.g.setAttribute("opacity", d > 0 ? (1 - pinsGone).toFixed(3) : "0");
    });

    // Clean: the bag appears, fills up, then is carried away.
    const bagIn = back(seg(p, 0.52, 0.56));
    const bagOut = ease(seg(p, 0.8, 0.86));
    const fill = 1 + 0.18 * (collected / items.length);
    bag.setAttribute("transform", `translate(${f(BIN.x + bagOut * 520)} ${BIN.y}) scale(${(bagIn * fill).toFixed(3)})`);
    bag.setAttribute("opacity", bagIn > 0 ? (1 - bagOut).toFixed(3) : "0");

    // Verify: a camera flash and a check mark.
    const fl = seg(p, 0.705, 0.72) - seg(p, 0.72, 0.75);
    flash.setAttribute("opacity", (Math.max(0, fl) * 0.7).toFixed(3));
    const ck = back(seg(p, 0.72, 0.76));
    const ckOut = seg(p, 0.8, 0.83);
    check.setAttribute("transform", `translate(800 1370) scale(${(ck * (1 - 0.3 * ckOut)).toFixed(3)})`);
    check.setAttribute("opacity", ck > 0 ? (1 - ckOut).toFixed(3) : "0");

    // Reward: flowers grow and the points pop up.
    flowers.forEach((fw, k) => {
      const s = back(seg(p, 0.8 + k * 0.005, 0.85 + k * 0.005));
      fw.g.setAttribute("transform", `translate(${fw.x} ${fw.y}) scale(${(s * 1.25).toFixed(3)})`);
    });
    const c = seg(p, 0.83, 0.87) * (1 - seg(p, 0.92, 0.95));
    // The points appear where the check mark was.
    const pt = screenPoint(800, 1370);
    chip.style.transform = `translate(${f(pt.x)}px, ${f(pt.y - 60 * seg(p, 0.83, 0.95))}px) translate(-50%, -50%) scale(${(0.8 + 0.2 * back(seg(p, 0.83, 0.87))).toFixed(3)})`;
    show(chip, c);

    // Step captions.
    const RANGES = [[0.4, 0.53], [0.53, 0.7], [0.7, 0.8], [0.8, 0.93]];
    caps.forEach((cap, i) => {
      const [a, b] = RANGES[i];
      const o = seg(p, a, a + 0.025) * (1 - seg(p, b - 0.02, b));
      show(cap, o);
      cap.style.transform = `translateY(${f(12 * (1 - seg(p, a, a + 0.025)))}px)`;
    });

    // Closing message.
    show(endBox, seg(p, 0.93, 0.97), true);
  }

  /* ---------- wiring ---------- */
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; render(); });
  };

  if (!reduce) {
    section.classList.add("on");
    window.addEventListener("scroll", onScroll, { passive: true });
  }
  window.addEventListener("resize", layout);
  document.addEventListener("langchange", () => requestAnimationFrame(layout));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);

  skip.addEventListener("click", () => {
    const next = document.getElementById("how");
    if (next) next.scrollIntoView({ behavior: "smooth" });
  });

  layout();
})();
