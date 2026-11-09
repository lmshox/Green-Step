// Yashil Qadam — Nature corner page: moderator check, then the meadow and its controls.
//
// While this is a test, the 3D scene and its sounds load only after the
// signed-in user is confirmed as a moderator (an entry in the "admins"
// collection), so nobody else downloads or sees them.
import { fb, auth, db, data, signIn, EMULATOR, testSignIn } from "./backend.js";

const $ = (id) => document.getElementById(id);
const gate = $("g-gate");

function showGate(which) {
  gate.hidden = !which;
  gate.querySelectorAll("[data-gate]").forEach((el) => (el.hidden = el.dataset.gate !== which));
}

if (EMULATOR) window.__yqTestSignIn = testSignIn;
$("g-signin").addEventListener("click", () => signIn().catch(() => {}));

let booted = false;
fb.onAuthStateChanged(auth, async (user) => {
  if (booted) return;
  if (!user) { showGate("signin"); return; }
  showGate("checking");
  if (!(await data.isAdmin(user.uid))) { showGate("denied"); return; }
  booted = true;
  showGate("loading");
  try {
    await boot(user);
    showGate(null);
  } catch (e) {
    console.error(e);
    showGate("error");
  }
});

async function boot(user) {
  const [{ createMeadow }, { createSoundscape }] = await Promise.all([import("./garden-scene.js"), import("./garden-audio.js")]);
  const meadow = createMeadow($("meadow"));
  const sound = createSoundscape();
  meadow.onThunder((delay, power) => sound.thunder(delay, power));
  meadow.start();
  window.__meadow = meadow; // handy for testing in the browser console

  /* ---------- weather and time ---------- */
  document.querySelectorAll(".g-seg").forEach((seg) => {
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-v]");
      if (!b) return;
      seg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      if (seg.dataset.control === "weather") meadow.setWeather(b.dataset.v);
      else meadow.setTime(b.dataset.v);
    });
  });
  const wind = $("g-wind");
  wind.addEventListener("input", () => meadow.setWind(wind.value / 100));
  meadow.setWind(wind.value / 100);

  /* ---------- sound ---------- */
  const soundBtn = $("g-sound");
  soundBtn.addEventListener("click", async () => {
    if (sound.on) sound.stop(); else await sound.start();
    soundBtn.setAttribute("aria-pressed", String(sound.on));
    soundBtn.classList.toggle("is-on", sound.on);
  });
  $("g-music").addEventListener("input", (e) => sound.setMusic(e.target.value / 100));
  $("g-nature").addEventListener("input", (e) => sound.setNature(e.target.value / 100));
  setInterval(() => sound.update(meadow.state), 250);

  /* ---------- growth from real cleanups ---------- */
  const growth = $("g-growth"), growthV = $("g-growth-v"), own = $("g-own");
  const firstName = (user.displayName || sessionStorage.getItem("yq:testName") || "").split(" ")[0] || "🌱";
  const setGrowth = (n) => { growth.value = n; growthV.textContent = n; meadow.setGrowth(n); };
  growth.addEventListener("input", () => setGrowth(+growth.value));
  own.addEventListener("change", () => meadow.setOwnTree(own.checked ? firstName : null));
  setGrowth(0);
  try {
    const snap = await fb.getDocs(fb.query(fb.collection(db, "spots"), fb.where("status", "==", "cleaned")));
    const total = snap.size;
    const mine = snap.docs.filter((d) => d.data().cleanedBy === user.uid).length;
    $("g-real").textContent = String(total);
    growth.max = String(Math.max(150, total));
    setGrowth(total);
    own.checked = mine > 0;
    meadow.setOwnTree(own.checked ? firstName : null);
  } catch (e) {
    $("g-real").textContent = "—";
  }

  /* ---------- panel and hint ---------- */
  const panel = $("g-panel"), toggle = $("g-panel-toggle");
  const setPanel = (open) => { panel.classList.toggle("closed", !open); toggle.setAttribute("aria-expanded", String(open)); };
  setPanel(window.innerWidth > 760 && window.innerHeight > 560); // closed by default on phones, upright or sideways
  toggle.addEventListener("click", () => setPanel(panel.classList.contains("closed")));

  const hint = $("g-hint");
  const hideHint = () => hint.classList.add("gone");
  $("meadow").addEventListener("pointerdown", hideHint, { once: true });
  setTimeout(hideHint, 9000);

  /* ---------- full screen: only nature on the whole screen ---------- */
  const root = document.documentElement, body = document.body, fullBtn = $("g-full");
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  if (!request) fullBtn.hidden = true; // e.g. Safari on iPhone, which doesn't allow it for web pages
  const toggleFull = () => {
    if (isFull()) exit.call(document);
    else Promise.resolve(request.call(root, { navigationUI: "hide" })).catch(() => {});
  };
  fullBtn.addEventListener("click", toggleFull);

  /* ---------- phones: landscape ---------- */
  const phone = window.matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 600;
  const portrait = window.matchMedia("(orientation: portrait)");
  const canLock = !!(request && screen.orientation && typeof screen.orientation.lock === "function");
  const rotate = $("g-rotate"), rotGo = $("g-rot-go");
  let rotSkipped = false;
  try { rotSkipped = sessionStorage.getItem("yq:rotSkip") === "1"; } catch (e) { /* private mode */ }
  rotGo.hidden = !canLock;
  $("g-rot-note").hidden = canLock;

  // Full screen in landscape, where the phone allows it (Android); otherwise just full screen.
  async function goLandscape() {
    try { if (!isFull()) await request.call(root, { navigationUI: "hide" }); } catch (e) { /* not allowed */ }
    try { await screen.orientation.lock("landscape"); } catch (e) { /* not supported (e.g. iPhone) */ }
  }
  const checkRotate = () => { rotate.hidden = !(phone && portrait.matches && !rotSkipped); };
  rotGo.addEventListener("click", goLandscape);
  $("g-rot-skip").addEventListener("click", () => {
    rotSkipped = true;
    try { sessionStorage.setItem("yq:rotSkip", "1"); } catch (e) { /* private mode */ }
    checkRotate();
  });
  portrait.addEventListener("change", checkRotate);
  checkRotate();
  // The full-screen button on a phone also turns the view sideways.
  if (phone && canLock) {
    fullBtn.removeEventListener("click", toggleFull);
    fullBtn.addEventListener("click", () => (isFull() ? exit.call(document) : goLandscape()));
  }
  window.addEventListener("keydown", (e) => {
    if ((e.key === "f" || e.key === "F") && request && !e.target.closest("input, select, textarea")) toggleFull();
  });

  // In full screen the controls fade out after a few quiet seconds; a tap or a mouse move brings them back.
  let idleTimer = 0, overUI = false, downAt = null;
  const wake = () => {
    body.classList.remove("ui-hidden");
    clearTimeout(idleTimer);
    if (isFull()) idleTimer = setTimeout(() => { if (!overUI) body.classList.add("ui-hidden"); }, 3500);
  };
  const onFullChange = () => {
    const full = isFull();
    body.classList.toggle("is-full", full);
    fullBtn.setAttribute("aria-pressed", String(full));
    wake();
  };
  document.addEventListener("fullscreenchange", onFullChange);
  document.addEventListener("webkitfullscreenchange", onFullChange);
  document.querySelectorAll(".g-top, .g-panel, .g-panel-toggle").forEach((el) => {
    el.addEventListener("pointerenter", () => { overUI = true; wake(); });
    el.addEventListener("pointerleave", () => { overUI = false; wake(); });
  });
  window.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" && !e.buttons) wake(); });
  window.addEventListener("pointerdown", (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  window.addEventListener("pointerup", (e) => {
    // A tap (not a drag to look around) shows the controls.
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 8) wake();
    downAt = null;
  });
  window.addEventListener("keydown", wake);

  // Don't draw while the tab is hidden.
  document.addEventListener("visibilitychange", () => (document.hidden ? meadow.stop() : meadow.start()));
}
