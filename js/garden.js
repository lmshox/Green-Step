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
  setPanel(window.innerWidth > 760);
  toggle.addEventListener("click", () => setPanel(panel.classList.contains("closed")));

  const hint = $("g-hint");
  const hideHint = () => hint.classList.add("gone");
  $("meadow").addEventListener("pointerdown", hideHint, { once: true });
  setTimeout(hideHint, 9000);

  // Don't draw while the tab is hidden.
  document.addEventListener("visibilitychange", () => (document.hidden ? meadow.stop() : meadow.start()));
}
