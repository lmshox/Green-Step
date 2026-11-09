// Yashil Qadam — "Tabiat burchagi" (Nature corner): a calm 3D meadow.
//
// You stand in a big yard of long grass. You can't walk, only look around 360°.
// Trees and hills are further off, the sky has soft clouds, and the weather
// (clear, cloudy, rain, storm), the time of day and the wind can be changed.
// Flowers in the grass grow with the number of real cleanups on the site.
//
// Everything is generated in code: no image or model files to download.
import * as THREE from "./vendor/three.module.min.js";

const TAU = Math.PI * 2;
const WHITE = new THREE.Color(1, 1, 1);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth value noise, enough for hills, grass patches and tree shapes.
function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}

// Ground height: flat around you, gentle rolling land further away.
const groundY = (x, z) => {
  const r = Math.hypot(x, z);
  return (fbm(x * 0.008 + 3, z * 0.008 + 7) - 0.5) * 14 * clamp((r - 50) / 160) + (fbm(x * 0.05, z * 0.05) - 0.5) * 0.25;
};

/* ------------------------------------------------------------------ */
/* Looks: time of day × weather                                        */
/* ------------------------------------------------------------------ */

const TIMES = {
  day:    { top: "#7ea8d4", horizon: "#e4ebe4", sun: "#fff1d6", sunDir: [-0.42, 0.55, -0.72], sunI: 2.7, hemi: 2.1, sunVis: 1, stars: 0, cloud: "#ffffff", night: 0 },
  sunset: { top: "#5a6aa6", horizon: "#f2b088", sun: "#ffae6e", sunDir: [-0.55, 0.1, -0.83], sunI: 2.0, hemi: 1.15, sunVis: 1, stars: 0.05, cloud: "#f7cfb8", night: 0.15 },
  night:  { top: "#071022", horizon: "#1c2b40", sun: "#a9bde0", sunDir: [0.35, 0.5, -0.79], sunI: 0.55, hemi: 0.42, sunVis: 0.22, stars: 1, cloud: "#45526a", night: 1 },
};
const WEATHER = {
  clear:  { cover: 0.38, shade: 1.0, grey: 0.0, dark: 0.0, rain: 0, fog: 0.0016, sunMul: 1.0, flash: 0 },
  cloudy: { cover: 1.0, shade: 0.88, grey: 0.5, dark: 0.12, rain: 0, fog: 0.0021, sunMul: 0.5, flash: 0 },
  rain:   { cover: 1.0, shade: 0.66, grey: 0.75, dark: 0.32, rain: 0.6, fog: 0.0032, sunMul: 0.28, flash: 0 },
  storm:  { cover: 1.0, shade: 0.42, grey: 0.88, dark: 0.55, rain: 1, fog: 0.0042, sunMul: 0.14, flash: 1 },
};

function greyed(hex, grey, dark) {
  const c = new THREE.Color(hex);
  const l = c.r * 0.3 + c.g * 0.55 + c.b * 0.15;
  const g = new THREE.Color(l * 0.95, l, l * 1.04);
  return c.lerp(g, grey).multiplyScalar(1 - dark);
}

function targetLook(timeKey, weatherKey) {
  const T = TIMES[timeKey], Wt = WEATHER[weatherKey];
  const night = T.night;
  return {
    top: greyed(T.top, Wt.grey, Wt.dark * (1 - night * 0.6)),
    horizon: greyed(T.horizon, Wt.grey, Wt.dark * (1 - night * 0.6)),
    sun: new THREE.Color(T.sun),
    sunDir: new THREE.Vector3(...T.sunDir).normalize(),
    sunI: T.sunI * Wt.sunMul,
    hemi: T.hemi * (1 - Wt.dark * 0.45),
    sunVis: T.sunVis * clamp(1 - Wt.grey * 1.15),
    stars: T.stars * (weatherKey === "clear" ? 1 : 0),
    cloud: new THREE.Color(T.cloud).multiplyScalar(Wt.shade * (1 - night * 0.25)),
    cover: Wt.cover,
    rain: Wt.rain,
    fog: Wt.fog * (1 + night * 0.15),
    night,
    flash: Wt.flash,
  };
}

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */

const SKY_VS = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }`;
const SKY_FS = /* glsl */ `
  uniform vec3 uTop, uHorizon, uSun, uSunDir;
  uniform float uSunVis, uStars, uTime, uFlash;
  varying vec3 vDir;
  float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.5));
    col = mix(col, uHorizon * 0.92, smoothstep(0.0, -0.2, h));
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSun * (pow(s, 1400.0) * 3.0 * uSunVis * uSunVis + (pow(s, 60.0) * 0.28 + pow(s, 6.0) * 0.12) * uSunVis);
    if (uStars > 0.0 && h > 0.0) {
      vec3 q = floor(d * 380.0);
      float st = h3(q);
      float tw = 0.55 + 0.45 * sin(uTime * 1.7 + st * 60.0);
      col += vec3(0.85, 0.9, 1.0) * step(0.9972, st) * tw * uStars * smoothstep(0.02, 0.35, h);
    }
    col += vec3(0.75, 0.8, 0.95) * uFlash;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

// Grass and flowers share the wind and the lighting.
const WIND_VS = /* glsl */ `
  attribute vec3 aOffset;
  attribute vec4 aParams;   // height, width, rotation, phase
  attribute vec3 aTint;
  uniform float uTime, uWind, uGust;
  varying float vY;
  varying vec3 vTint;
  varying float vDepth;
  varying float vPart;
  void wind(inout vec3 wp, float t, float h, float ph) {
    float speed = 1.0 + uWind * 1.8;
    float wave = sin(uTime * speed + aOffset.x * 0.17 + aOffset.z * 0.11 + ph) * 0.55
               + sin(uTime * speed * 1.9 + aOffset.x * 0.41 - aOffset.z * 0.33 + ph * 1.7) * 0.22;
    float gust = uGust * (0.55 + 0.45 * sin(aOffset.x * 0.045 - uTime * 0.9 + aOffset.z * 0.02));
    float b = (0.06 + uWind * 0.32) * wave + uWind * 0.28 + gust * 0.35 + (ph - 3.14) * 0.025;
    vec2 dir = normalize(vec2(0.85, 0.5));
    float k = t * t;
    wp.xz += dir * b * k * h;
    wp.y -= abs(b) * k * h * 0.3;
  }
`;
const GRASS_VS = WIND_VS + /* glsl */ `
  void main() {
    float h = aParams.x, w = aParams.y, a = aParams.z, ph = aParams.w;
    vec3 p = position; p.x *= w; p.y *= h; p.z *= h;
    float c = cos(a), s = sin(a);
    p = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
    vec3 wp = aOffset + p;
    wind(wp, position.y, h, ph);
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    gl_Position = projectionMatrix * mv;
    vY = position.y; vTint = aTint; vDepth = -mv.z; vPart = 0.0;
  }`;
const FLOWER_VS = WIND_VS + /* glsl */ `
  attribute float aPartA;
  void main() {
    float h = aParams.x, s0 = aParams.y, a = aParams.z, ph = aParams.w;
    vec3 p = position;
    p.xz *= mix(1.0, s0, aPartA);
    p.y *= h;
    float c = cos(a), s = sin(a);
    p = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
    vec3 wp = aOffset + p;
    wind(wp, clamp(position.y, 0.0, 1.0), h, ph);
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    gl_Position = projectionMatrix * mv;
    vY = position.y; vTint = aTint; vDepth = -mv.z; vPart = aPartA;
  }`;
const GRASS_FS = /* glsl */ `
  uniform vec3 uBase, uTip, uLight, uAmb, uFogColor;
  uniform float uFog, uFlash;
  varying float vY;
  varying vec3 vTint;
  varying float vDepth;
  varying float vPart;
  void main() {
    vec3 col = mix(uBase, uTip, smoothstep(0.0, 1.0, vY)) * vTint;
    if (vPart > 0.5) col = vTint;
    col *= uAmb + uLight * (0.3 + 0.7 * clamp(vY, 0.0, 1.0)) + uFlash;
    float f = 1.0 - exp(-uFog * uFog * vDepth * vDepth);
    col = mix(col, uFogColor, clamp(f, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

const RAIN_VS = /* glsl */ `
  attribute vec4 aSeed;  // x, z, start height, threshold
  attribute float aEnd;
  uniform float uTime, uWind, uRain;
  varying float vA;
  void main() {
    float H = 26.0;
    float y = mod(aSeed.z * H - uTime * (17.0 + aSeed.w * 5.0), H) - 3.0;
    vec3 p = vec3(aSeed.x * 32.0, y, aSeed.y * 32.0);
    vec2 slant = normalize(vec2(0.85, 0.5)) * (0.12 + uWind * 0.55);
    float len = 0.75;
    p.xz -= slant * len * aEnd;
    p.y += len * aEnd;
    vA = aSeed.w < uRain ? 1.0 : 0.0;
    vec4 mv = viewMatrix * vec4(p + cameraPosition * vec3(1.0, 0.0, 1.0), 1.0);
    gl_Position = vA > 0.5 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
  }`;
const RAIN_FS = /* glsl */ `
  uniform vec3 uColor;
  varying float vA;
  void main() {
    gl_FragColor = vec4(uColor, 0.32 * vA);
    #include <colorspace_fragment>
  }`;

const FLY_VS = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime, uPx;
  varying float vGlow;
  void main() {
    vec3 p = aSeed.xyz;
    p.x += sin(uTime * 0.4 + aSeed.w * 6.0) * 0.8;
    p.z += cos(uTime * 0.33 + aSeed.w * 4.0) * 0.8;
    p.y += sin(uTime * 0.7 + aSeed.w * 9.0) * 0.25;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vGlow = 0.5 + 0.5 * sin(uTime * 2.2 + aSeed.w * 30.0);
    gl_PointSize = min(36.0, uPx * (6.0 + 6.0 * vGlow) / max(1.0, -mv.z));
  }`;
const FLY_FS = /* glsl */ `
  uniform float uOn;
  varying float vGlow;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.0, length(c)) * uOn * (0.35 + 0.65 * vGlow);
    gl_FragColor = vec4(vec3(1.0, 0.92, 0.55) * a, a);
  }`;

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

// Turn a "soup" geometry into an indexed one so displaced blobs get smooth normals.
function toIndexed(g) {
  const pos = g.attributes.position;
  const map = new Map(), verts = [], index = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    let k = map.get(key);
    if (k === undefined) { k = verts.length / 3; map.set(key, k); verts.push(x, y, z); }
    index.push(k);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  out.setIndex(index);
  return out;
}

// A soft, lumpy leaf blob, lighter on top and darker underneath.
function blobGeometry(seed, detail = 2, lump = 0.24) {
  const g = toIndexed(new THREE.IcosahedronGeometry(1, detail));
  const p = g.attributes.position, colors = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = fbm(x * 1.6 + seed, z * 1.6 + y * 1.3 + seed * 0.7, 3);
    const k = 1 + (n - 0.5) * 2 * lump;
    p.setXYZ(i, x * k, y * k * 0.92, z * k);
    const shade = 0.62 + 0.38 * (y + 1) / 2 + (n - 0.5) * 0.25;
    colors.push(shade, shade, shade);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

function bladeGeometry(segments = 5) {
  const pos = [], idx = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const w = 0.5 * Math.pow(1 - t, 0.85);
    const z = t * t * 0.18;
    pos.push(-w, t, z, w, t, z);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// Stem (two crossed strips) plus a small round head on top.
function flowerGeometry() {
  const pos = [], part = [], idx = [];
  const quad = (ax, az) => {
    const b = pos.length / 3, w = 0.012;
    pos.push(-w * ax, 0, -w * az, w * ax, 0, w * az, -w * ax, 1, -w * az, w * ax, 1, w * az);
    part.push(0, 0, 0, 0);
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  };
  quad(1, 0); quad(0, 1);
  const head = new THREE.IcosahedronGeometry(1, 1);
  const hp = head.attributes.position, b = pos.length / 3;
  for (let i = 0; i < hp.count; i++) {
    pos.push(hp.getX(i) * 0.055, 1 + hp.getY(i) * 0.02, hp.getZ(i) * 0.055);
    part.push(1);
    idx.push(b + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aPartA", new THREE.Float32BufferAttribute(part, 1));
  g.setIndex(idx);
  return g;
}

function cloudTexture(seed) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const g = c.getContext("2d"), R = rng(seed);
  for (let i = 0; i < 22; i++) {
    // Every puff stays well inside the canvas, so no cloud ever shows a hard edge.
    const x = 70 + R() * 116, r = 18 + R() * 24;
    const y = clamp(78 - Math.sin(((x - 70) / 116) * Math.PI) * 22 + (R() - 0.5) * 14, r + 6, 122 - r);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(255,255,255,.55)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function labelTexture(text) {
  const c = document.createElement("canvas");
  const g = c.getContext("2d");
  const font = "600 44px Geist, system-ui, sans-serif";
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 64;
  c.width = w; c.height = 84;
  g.font = font;
  g.fillStyle = "rgba(22,35,27,.82)";
  g.beginPath(); g.roundRect(0, 0, w, 84, 42); g.fill();
  g.fillStyle = "#e9f0cf";
  g.textBaseline = "middle";
  g.fillText(text, 32, 44);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, aspect: w / 84 };
}

/* ------------------------------------------------------------------ */
/* The meadow                                                          */
/* ------------------------------------------------------------------ */

export function createMeadow(canvas, opts = {}) {
  const small = Math.min(window.innerWidth, window.innerHeight) < 700 || (navigator.hardwareConcurrency || 4) <= 4;
  const Q = {
    grass: opts.grass || (small ? 38000 : 95000),
    farTrees: small ? 220 : 420,
    rain: small ? 2600 : 6000,
    ratio: Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.5),
  };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !small, powerPreference: "high-performance" });
  renderer.setPixelRatio(Q.ratio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xdde5e0, 0.0016);
  const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 3000);
  camera.position.set(0, 1.55, 0);

  const look = targetLook("day", "clear");
  const cur = {
    top: look.top.clone(), horizon: look.horizon.clone(), sun: look.sun.clone(), sunDir: look.sunDir.clone(),
    sunI: look.sunI, hemi: look.hemi, sunVis: look.sunVis, stars: look.stars, cloud: look.cloud.clone(),
    cover: look.cover, rain: look.rain, fog: look.fog, night: look.night, flash: 0,
  };
  let target = look, timeKey = "day", weatherKey = "clear";
  let wind = 0.35, windCur = 0.35, gust = 0;

  /* ---------- lights ---------- */
  const hemi = new THREE.HemisphereLight(0xdfeaf2, 0x4b5a33, 1.7);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.7);
  scene.add(hemi, sun);

  /* ---------- sky ---------- */
  const skyU = {
    uTop: { value: cur.top }, uHorizon: { value: cur.horizon }, uSun: { value: cur.sun }, uSunDir: { value: cur.sunDir },
    uSunVis: { value: 1 }, uStars: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 48, 24),
    new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: skyU, side: THREE.BackSide, depthWrite: false })
  );
  sky.renderOrder = -2;
  sky.frustumCulled = false;
  scene.add(sky);

  /* ---------- clouds ---------- */
  const clouds = new THREE.Group();
  const cloudTex = [1, 2, 3, 4].map(cloudTexture);
  const cloudList = [];
  {
    const R = rng(9);
    for (let i = 0; i < 48; i++) {
      const a = R() * TAU, d = 420 + R() * 420, h = 120 + R() * 190;
      const m = new THREE.SpriteMaterial({ map: cloudTex[i % 4], transparent: true, depthWrite: false, fog: false, opacity: 0 });
      const s = new THREE.Sprite(m);
      const w = 260 + R() * 320;
      s.scale.set(w, w * (0.42 + R() * 0.16), 1);
      s.position.set(Math.cos(a) * d, h, Math.sin(a) * d);
      s.renderOrder = -1;
      clouds.add(s);
      cloudList.push({ s, threshold: R(), base: 0.75 + R() * 0.25 });
    }
  }
  scene.add(clouds);

  /* ---------- ground ---------- */
  {
    const g = new THREE.PlaneGeometry(3200, 3200, 160, 160);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, col = [];
    const c1 = new THREE.Color("#55703a"), c2 = new THREE.Color("#7d9147"), c3 = new THREE.Color("#3f5a2e");
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, groundY(x, z));
      const n = fbm(x * 0.02, z * 0.02, 3);
      const c = c1.clone().lerp(c2, clamp((n - 0.35) * 2)).lerp(c3, clamp((0.45 - n) * 2) * 0.6);
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })));
  }

  /* ---------- distant hills (two rings, the far one paler) ---------- */
  function hillRing(radius, depth, base, amp, color, seed) {
    const seg = 256, pos = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * TAU, x = Math.cos(a), z = Math.sin(a);
      const h = base + amp * fbm(x * 2.2 + seed, z * 2.2 + seed, 4);
      pos.push(x * radius, -12, z * radius, x * (radius + depth), h, z * (radius + depth));
    }
    for (let i = 0; i < seg; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
    scene.add(m);
  }
  hillRing(900, 260, 40, 170, "#7d977f", 11);
  hillRing(620, 160, 6, 75, "#5d7a4c", 4);

  /* ---------- far trees: round ones in groves, and rows of poplars ---------- */
  const leafMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const barkMat = new THREE.MeshLambertMaterial({ color: "#5b4a3a" });
  {
    const R = rng(21);
    const blob = blobGeometry(5, 1, 0.2);
    const trunk = new THREE.CylinderGeometry(0.22, 0.38, 1, 6);
    trunk.translate(0, 0.5, 0);
    const spots = [];
    let guard = 0;
    while (spots.length < Q.farTrees && guard++ < 20000) {
      const a = R() * TAU, d = 95 + Math.pow(R(), 0.8) * 380;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (fbm(x * 0.012 + 40, z * 0.012, 3) < 0.5) continue; // trees grow in groves, leaving open fields
      spots.push({ x, z, poplar: false });
    }
    // Poplar rows along two field edges.
    [[-0.9, 160, 70], [2.2, 210, 90]].forEach(([ang, dist, len]) => {
      const cx = Math.cos(ang) * dist, cz = Math.sin(ang) * dist;
      const tx = -Math.sin(ang), tz = Math.cos(ang);
      for (let i = 0; i < len; i += 3.2) {
        const o = i - len / 2;
        spots.push({ x: cx + tx * o * 2 + (R() - 0.5) * 1.2, z: cz + tz * o * 2 + (R() - 0.5) * 1.2, poplar: true });
      }
    });
    const crowns = new THREE.InstancedMesh(blob, leafMat, spots.length);
    const trunks = new THREE.InstancedMesh(trunk, barkMat, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    const greens = ["#4a6d3c", "#587a41", "#648447", "#42623a", "#6b8a4c"].map((c) => new THREE.Color(c));
    spots.forEach((t, i) => {
      const y = groundY(t.x, t.z);
      const s = t.poplar ? 1 : 3.5 + R() * 4.5;
      const crownR = t.poplar ? 2.1 + R() * 0.5 : s;
      const crownH = t.poplar ? 9 + R() * 3 : s * (0.85 + R() * 0.3);
      const trunkH = t.poplar ? 3 : s * 0.9;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * TAU);
      m.compose(ps.set(t.x, y + trunkH + crownH * 0.75, t.z), q, sc.set(crownR, crownH, crownR));
      crowns.setMatrixAt(i, m);
      crowns.setColorAt(i, greens[(R() * greens.length) | 0].clone().multiplyScalar(0.9 + R() * 0.25));
      m.compose(ps.set(t.x, y - 0.5, t.z), q, sc.set(t.poplar ? 0.9 : s * 0.22, trunkH + 1.5, t.poplar ? 0.9 : s * 0.22));
      trunks.setMatrixAt(i, m);
    });
    scene.add(crowns, trunks);
  }

  /* ---------- near trees: a few big ones you can look up at ---------- */
  const nearTrees = [];
  const blobs = [1, 2, 3, 4].map((s) => blobGeometry(s * 7.3, 3, 0.24));
  function makeTree(R, x, z, s, greenHex) {
    const tree = new THREE.Group();
    const y = groundY(x, z);
    tree.position.set(x, y, z);
    const trunkH = 3.4 * s;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.38 * s, trunkH, 9), barkMat);
    trunk.position.y = trunkH / 2;
    tree.add(trunk);
    for (let b = 0; b < 3; b++) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.13 * s, 2.2 * s, 6), barkMat);
      const a = (b / 3) * TAU + R();
      br.position.set(Math.cos(a) * 0.55 * s, trunkH * 0.9 + 0.5 * s, Math.sin(a) * 0.55 * s);
      br.rotation.set(Math.sin(a) * 0.65, 0, -Math.cos(a) * 0.65);
      tree.add(br);
    }
    const crown = new THREE.Group();
    crown.position.y = trunkH + 1.3 * s;
    const base = new THREE.Color(greenHex);
    const n = 7 + ((R() * 4) | 0);
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, color: base.clone().multiplyScalar(0.85 + R() * 0.3) });
      const m = new THREE.Mesh(blobs[i % 4], mat);
      const a = R() * TAU, r = (i === 0 ? 0 : 1.1 + R() * 1.3) * s;
      const k = (1.4 + R() * 1.1) * s;
      m.position.set(Math.cos(a) * r, (R() - 0.3) * 1.6 * s, Math.sin(a) * r);
      m.scale.set(k, k * (0.8 + R() * 0.3), k);
      m.rotation.y = R() * TAU;
      crown.add(m);
    }
    tree.add(crown);
    scene.add(tree);
    return { tree, crown, phase: R() * TAU };
  }
  {
    const R = rng(77);
    [[0.35, 34, 1.25], [1.4, 52, 1.6], [2.3, 28, 1.1], [3.0, 64, 1.8], [3.9, 40, 1.35], [4.7, 58, 1.5], [5.6, 46, 1.2]].forEach(([a, d, s], i) => {
      nearTrees.push(makeTree(R, Math.cos(a) * d, Math.sin(a) * d, s, ["#5f8a45", "#6b944a", "#557f40"][i % 3]));
    });
  }

  /* ---------- "your tree": a young blossoming tree in front of you ---------- */
  const ownTree = (() => {
    const R = rng(404);
    const t = makeTree(R, -3.5, -15, 0.62, "#6f9a4c");
    const blossoms = [new THREE.MeshLambertMaterial({ color: "#f7c9d8", emissive: "#5a2a3a" }), new THREE.MeshLambertMaterial({ color: "#fff4f6", emissive: "#4a4040" })];
    const petal = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(petal, blossoms[i % 2]);
      // On the outside of the crown, mostly on top and towards you.
      const a = R() * TAU, el = R() * 1.2 - 0.25, r = 1.7 + R() * 0.5;
      m.position.set(Math.cos(a) * Math.cos(el) * r, Math.sin(el) * r * 0.85 + 0.2, Math.sin(a) * Math.cos(el) * r);
      m.scale.setScalar(0.07 + R() * 0.06);
      t.crown.add(m);
    }
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false }));
    label.position.set(0, 5.6, 0);
    t.tree.add(label);
    nearTrees.push(t);
    t.tree.visible = false;
    return { group: t.tree, label };
  })();

  /* ---------- long grass ---------- */
  const grassU = {
    uTime: { value: 0 }, uWind: { value: wind }, uGust: { value: 0 },
    uBase: { value: new THREE.Color("#203a17") }, uTip: { value: new THREE.Color("#a6bd5c") },
    uLight: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: new THREE.Color(0.5, 0.5, 0.5) },
    uFogColor: { value: cur.horizon }, uFog: { value: cur.fog }, uFlash: { value: 0 },
  };
  function scatter(count, seed, place) {
    const R = rng(seed);
    const off = new Float32Array(count * 3), par = new Float32Array(count * 4), tint = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) place(R, i, off, par, tint);
    return { off, par, tint };
  }
  {
    const geo = new THREE.InstancedBufferGeometry().copy(bladeGeometry(5));
    const dry = new THREE.Color("#d6c27a"), fresh = new THREE.Color("#ffffff"), deep = new THREE.Color("#c9dcae");
    const { off, par, tint } = scatter(Q.grass, 3, (R, i, off, par, tint) => {
      const a = R() * TAU, d = 0.55 + 62 * Math.pow(R(), 1.25);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const patch = fbm(x * 0.07 + 9, z * 0.07, 3);
      const tall = 0.55 + patch * 0.9 + R() * 0.25;
      off.set([x, groundY(x, z) - 0.02, z], i * 3);
      par.set([tall * (d < 3 ? 0.8 : 1), (0.05 + R() * 0.04) * (1 + d * 0.025), R() * TAU, R() * TAU], i * 4);
      const c = fresh.clone().lerp(deep, R() * 0.6);
      if (R() < 0.12 + clamp((patch - 0.6) * 0.8)) c.lerp(dry, 0.55 + R() * 0.4);
      c.multiplyScalar(0.82 + R() * 0.3);
      tint.set([c.r, c.g, c.b], i * 3);
    });
    geo.setAttribute("aOffset", new THREE.InstancedBufferAttribute(off, 3));
    geo.setAttribute("aParams", new THREE.InstancedBufferAttribute(par, 4));
    geo.setAttribute("aTint", new THREE.InstancedBufferAttribute(tint, 3));
    geo.instanceCount = Q.grass;
    const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: GRASS_VS, fragmentShader: GRASS_FS, uniforms: grassU, side: THREE.DoubleSide }));
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  /* ---------- wildflowers (grow with real cleanups) ---------- */
  const MAX_FLOWERS = small ? 2500 : 5000;
  const flowerGeo = new THREE.InstancedBufferGeometry().copy(flowerGeometry());
  {
    const colors = ["#f6f3ea", "#f6f3ea", "#f3cf4e", "#7c8fe0", "#e48fb0", "#f1a65a", "#ffffff", "#c8a4e6"].map((c) => new THREE.Color(c));
    const { off, par, tint } = scatter(MAX_FLOWERS, 8, (R, i, off, par, tint) => {
      const a = R() * TAU, d = 2.2 + 40 * Math.pow(R(), 1.1);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      off.set([x, groundY(x, z), z], i * 3);
      par.set([0.45 + R() * 0.55, 0.8 + R() * 0.7, R() * TAU, R() * TAU], i * 4);
      const c = colors[(R() * colors.length) | 0];
      tint.set([c.r, c.g, c.b], i * 3);
    });
    flowerGeo.setAttribute("aOffset", new THREE.InstancedBufferAttribute(off, 3));
    flowerGeo.setAttribute("aParams", new THREE.InstancedBufferAttribute(par, 4));
    flowerGeo.setAttribute("aTint", new THREE.InstancedBufferAttribute(tint, 3));
    flowerGeo.instanceCount = 0;
    const mesh = new THREE.Mesh(flowerGeo, new THREE.ShaderMaterial({ vertexShader: FLOWER_VS, fragmentShader: GRASS_FS, uniforms: grassU, side: THREE.DoubleSide }));
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  /* ---------- rain ---------- */
  const rainU = { uTime: { value: 0 }, uWind: { value: wind }, uRain: { value: 0 }, uColor: { value: new THREE.Color("#c9d3dc") } };
  {
    const R = rng(55), n = Q.rain;
    const seeds = new Float32Array(n * 2 * 4), ends = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const s = [R() * 2 - 1, R() * 2 - 1, R(), R()];
      seeds.set(s, i * 8); seeds.set(s, i * 8 + 4);
      ends[i * 2] = 0; ends[i * 2 + 1] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(n * 2 * 3), 3));
    g.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 4));
    g.setAttribute("aEnd", new THREE.Float32BufferAttribute(ends, 1));
    const lines = new THREE.LineSegments(g, new THREE.ShaderMaterial({ vertexShader: RAIN_VS, fragmentShader: RAIN_FS, uniforms: rainU, transparent: true, depthWrite: false }));
    lines.frustumCulled = false;
    scene.add(lines);
  }

  /* ---------- fireflies at night ---------- */
  const flyU = { uTime: { value: 0 }, uOn: { value: 0 }, uPx: { value: 1 } };
  {
    const R = rng(66), n = 140, s = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, d = 3 + R() * 26;
      s.set([Math.cos(a) * d, 0.4 + R() * 1.6, Math.sin(a) * d, R()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aSeed", new THREE.Float32BufferAttribute(s, 4));
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: FLY_VS, fragmentShader: FLY_FS, uniforms: flyU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false;
    scene.add(pts);
  }

  /* ------------------------------------------------------------------ */
  /* Looking around                                                      */
  /* ------------------------------------------------------------------ */

  let yaw = 0, pitch = 0.04, vYaw = 0, vPitch = 0, zoom = 1, dragging = false, lastX = 0, lastY = 0, idle = 0;
  // The vertical viewing angle suits the screen's shape: wider for an upright phone,
  // narrower for a wide landscape phone, so the meadow looks natural either way.
  const baseFov = () => {
    const a = camera.aspect || 1.6;
    return a < 1 ? 80 : a > 1.9 ? 54 : a > 1.6 ? 60 : 66;
  };
  let fov = baseFov();
  const pointers = new Map();
  let pinch0 = 0, zoom0 = zoom;
  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    dragging = true; lastX = e.clientX; lastY = e.clientY; idle = 0;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = zoom; }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0) zoom = clamp(zoom0 * (pinch0 / d), 0.45, 1.2);
      return;
    }
    if (!dragging) return;
    const k = (camera.fov / 66) * 0.0042;
    vYaw = -(e.clientX - lastX) * k; vPitch = -(e.clientY - lastY) * k;
    yaw += vYaw; pitch = clamp(pitch + vPitch, -0.5, 0.75);
    lastX = e.clientX; lastY = e.clientY;
  });
  const up = (e) => { pointers.delete(e.pointerId); if (!pointers.size) dragging = false; pinch0 = 0; };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); zoom = clamp(zoom * (1 + e.deltaY * 0.0012), 0.45, 1.2); }, { passive: false });
  const keys = new Set();
  window.addEventListener("keydown", (e) => { if (e.key.startsWith("Arrow")) keys.add(e.key); });
  window.addEventListener("keyup", (e) => keys.delete(e.key));

  /* ------------------------------------------------------------------ */
  /* Loop                                                                */
  /* ------------------------------------------------------------------ */

  let thunderCb = null, nextBolt = 6, flash = 0, flashPhase = 0;
  let running = false, raf = 0, last = 0, t = 0;
  let slowFrames = 0, ratio = Q.ratio;

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = fov = baseFov() * zoom; // turning the phone changes the view at once
    camera.updateProjectionMatrix();
    flyU.uPx.value = h * ratio * 0.016;
  }
  window.addEventListener("resize", resize);

  function step(now) {
    raf = running ? requestAnimationFrame(step) : 0;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now; t += dt;

    // Gently drop the resolution on slow devices.
    if (dt > 0.034) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 90 && ratio > 0.7) { ratio = Math.max(0.7, ratio - 0.25); renderer.setPixelRatio(ratio); resize(); slowFrames = 0; }

    // Look-around with a little momentum.
    if (!dragging) {
      yaw += vYaw; pitch = clamp(pitch + vPitch, -0.5, 0.75);
      vYaw *= 0.92; vPitch *= 0.92;
    }
    if (keys.has("ArrowLeft")) yaw -= dt * 0.9;
    if (keys.has("ArrowRight")) yaw += dt * 0.9;
    if (keys.has("ArrowUp")) pitch = clamp(pitch - dt * 0.6, -0.5, 0.75);
    if (keys.has("ArrowDown")) pitch = clamp(pitch + dt * 0.6, -0.5, 0.75);
    camera.rotation.set(0, 0, 0);
    camera.rotation.order = "YXZ";
    camera.rotation.y = -yaw;
    camera.rotation.x = -pitch;
    fov = baseFov() * zoom;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = lerp(camera.fov, fov, 0.2); camera.updateProjectionMatrix(); }

    // Ease every look value towards the chosen weather and time of day.
    const k = 1 - Math.exp(-dt * 1.1);
    cur.top.lerp(target.top, k); cur.horizon.lerp(target.horizon, k); cur.sun.lerp(target.sun, k);
    cur.sunDir.lerp(target.sunDir, k).normalize(); cur.cloud.lerp(target.cloud, k);
    for (const key of ["sunI", "hemi", "sunVis", "stars", "cover", "rain", "fog", "night"]) cur[key] = lerp(cur[key], target[key], k);
    windCur = lerp(windCur, Math.max(wind, target.flash ? 0.75 : 0), 1 - Math.exp(-dt * 0.8));
    gust = Math.max(0, Math.sin(t * 0.21) * Math.sin(t * 0.13 + 1)) * windCur;

    // Lightning in a storm: a double flicker, then thunder a moment later.
    flash *= Math.exp(-dt * 9);
    if (target.flash) {
      nextBolt -= dt;
      if (nextBolt <= 0) {
        flash = 1; flashPhase = 0.18;
        const delay = 0.4 + Math.random() * 2.2;
        if (thunderCb) thunderCb(delay, 0.6 + Math.random() * 0.4);
        nextBolt = 7 + Math.random() * 11;
      }
      if (flashPhase > 0) { flashPhase -= dt; if (flashPhase <= 0.08 && flashPhase > 0.08 - dt) flash = 0.8; }
    }

    // Apply.
    scene.fog.color.copy(cur.horizon);
    scene.fog.density = cur.fog;
    hemi.color.copy(cur.top).lerp(WHITE, 0.45);
    hemi.groundColor.setRGB(0.26 * (1 - cur.night * 0.7), 0.31 * (1 - cur.night * 0.7), 0.17 * (1 - cur.night * 0.7));
    hemi.intensity = cur.hemi + flash * 2.5;
    sun.color.copy(cur.sun);
    sun.intensity = cur.sunI;
    sun.position.copy(cur.sunDir).multiplyScalar(100);
    skyU.uSunVis.value = cur.sunVis;
    skyU.uStars.value = cur.stars;
    skyU.uTime.value = t;
    skyU.uFlash.value = flash * 0.55;

    grassU.uTime.value = t;
    grassU.uWind.value = windCur;
    grassU.uGust.value = gust;
    grassU.uFog.value = cur.fog;
    grassU.uFlash.value = flash * 0.6;
    const L = Math.max(0, cur.sunDir.y) * 0.9 + 0.1;
    grassU.uLight.value.copy(cur.sun).multiplyScalar((cur.sunI / 2.7) * L * 0.85);
    grassU.uAmb.value.copy(cur.top).lerp(WHITE, 0.4).multiplyScalar(cur.hemi / 1.7 * 0.55);

    rainU.uTime.value = t;
    rainU.uWind.value = windCur;
    rainU.uRain.value = cur.rain;
    rainU.uColor.value.setRGB(0.75, 0.8, 0.86).multiplyScalar(1 - cur.night * 0.55);

    flyU.uTime.value = t;
    flyU.uOn.value = clamp((cur.night - 0.5) * 2) * (1 - cur.rain);

    // Clouds drift and fill the sky with the chosen cover.
    clouds.rotation.y += dt * (0.0025 + windCur * 0.012);
    for (const c of cloudList) {
      const vis = clamp((cur.cover - c.threshold) * 4);
      c.s.material.opacity = vis * c.base;
      c.s.material.color.copy(cur.cloud);
      c.s.visible = vis > 0.01;
    }

    // Trees sway a little in the wind.
    for (const tr of nearTrees) {
      const sw = (0.004 + windCur * 0.022) * Math.sin(t * (0.6 + windCur * 0.9) + tr.phase) + gust * 0.012;
      tr.crown.rotation.z = sw;
      tr.crown.rotation.x = sw * 0.5;
    }

    renderer.render(scene, camera);
  }

  /* ------------------------------------------------------------------ */
  /* Public controls                                                     */
  /* ------------------------------------------------------------------ */

  return {
    start() { if (running) return; running = true; last = 0; resize(); raf = requestAnimationFrame(step); },
    stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
    setWeather(w) { if (!WEATHER[w]) return; weatherKey = w; target = targetLook(timeKey, weatherKey); if (w === "storm") nextBolt = 3; },
    setTime(tk) { if (!TIMES[tk]) return; timeKey = tk; target = targetLook(timeKey, weatherKey); },
    setWind(v) { wind = clamp(v); },
    get wind() { return windCur; },
    get state() { return { weather: weatherKey, time: timeKey, wind: windCur, rain: cur.rain, night: cur.night }; },
    /** How many verified cleanups there are: each one adds flowers to the meadow. */
    setGrowth(cleanups) { flowerGeo.instanceCount = Math.min(MAX_FLOWERS, Math.round(40 + cleanups * 30)); },
    /** Show "your tree" with a name label (null hides it). */
    setOwnTree(name) {
      ownTree.group.visible = !!name;
      if (!name) return;
      const { tex, aspect } = labelTexture(name);
      ownTree.label.material.map = tex;
      ownTree.label.material.needsUpdate = true;
      ownTree.label.scale.set(0.9 * aspect, 0.9, 1);
    },
    onThunder(fn) { thunderCb = fn; },
    /** Skip the slow fade to the chosen weather/time (used by automated tests). */
    settle() {
      for (const key of ["top", "horizon", "sun", "sunDir", "cloud"]) cur[key].copy(target[key]);
      for (const key of ["sunI", "hemi", "sunVis", "stars", "cover", "rain", "fog", "night"]) cur[key] = target[key];
    },
    get quality() { return { grass: Q.grass, ratio }; },
  };
}
