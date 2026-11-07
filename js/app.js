// Yashil Qadam app.
// Spots, points, rewards and gifts live in Firebase (see js/backend.js and
// js/yq-data.js); the security rules in firestore.rules keep points honest.
// All visible text comes from js/i18n.js (window.I18N).

import { data, fb, db, auth, signIn, signOut, testSignIn, EMULATOR } from "./backend.js";
import { SIZE_POINTS, SIZE_HOURS, REPORT_POINTS, HOLD_DAYS, OWN_REPORT_WAIT_DAYS, CONFIRMS_NEEDED, DAILY_CLEANUPS, MAX_DISTANCE as MAX_DIST, distance } from "./yq-data.js";

const L = window.I18N;
const t = L.t;
const DAY = 86400000;

// Example rewards until real partners are signed up (prices also live in firestore.rules).
const REWARDS = [
  { id: "coffee", cost: 200, icon: "cup",
    uz: ["Hamkor kafeda qahva", "Hamkor kafelarning birida bitta ichimlik."],
    ru: ["Кофе в кафе-партнёре", "Один напиток в любом кафе-партнёре."],
    en: ["Coffee at a partner café", "One drink at any partner café."] },
  { id: "bag", cost: 300, icon: "bag",
    uz: ["Yashil Qadam eko-sumkasi", "Qayta ishlatiladigan mato sumka."],
    ru: ["Эко-сумка Yashil Qadam", "Многоразовая тканевая сумка."],
    en: ["Yashil Qadam tote bag", "A reusable cotton bag."] },
  { id: "tree", cost: 500, icon: "tree",
    uz: ["Siz nomingizdan daraxt", "Hamkor bog‘bonlar siz nomingizdan ko‘chat ekadi."],
    ru: ["Дерево от вашего имени", "Партнёры-садоводы посадят саженец от вашего имени."],
    en: ["A tree in your name", "Partner gardeners plant a sapling in your name."] },
  { id: "bottle", cost: 600, icon: "bottle",
    uz: ["Suv idishi", "Qayta ishlatiladigan po‘lat suv idishi."],
    ru: ["Бутылка для воды", "Многоразовая стальная бутылка."],
    en: ["Water bottle", "A reusable steel water bottle."] },
  { id: "cinema", cost: 800, icon: "ticket",
    uz: ["Kino chiptasi", "Hamkor kinoteatrga bitta chipta."],
    ru: ["Билет в кино", "Один билет в кинотеатр-партнёр."],
    en: ["Cinema ticket", "One ticket at a partner cinema."] },
];
const rewardText = (r) => r[L.lang] || r.en;
const SIZE_TEXT = {
  uz: { small: ["Kichik", "2 qopgacha"], medium: ["O‘rtacha", "3–5 qop yoki yirik buyumlar"], large: ["Katta", "6+ qop yoki chiqindi uyumi"] },
  ru: { small: ["Мало", "до 2 мешков"], medium: ["Средне", "3–5 мешков или крупный мусор"], large: ["Много", "6+ мешков или свалка"] },
  en: { small: ["Small", "up to 2 bags"], medium: ["Medium", "3–5 bags or bulky items"], large: ["Large", "6+ bags or a dump site"] },
};
const sizeLabel = (s) => SIZE_TEXT[L.lang][s][0];
const sizeDetail = (s) => SIZE_TEXT[L.lang][s][1];
const HOURS_BY_POINTS = Object.fromEntries(Object.entries(SIZE_POINTS).map(([k, v]) => [v, SIZE_HOURS[k]]));

/* ---------------- State (kept in sync with Firebase) ---------------- */

const state = {
  user: null,      // signed-in Firebase user
  profile: null,   // users/{uid}: name, balance, held, ...
  ledger: [],      // users/{uid}/ledger
  spots: [],       // all spots, newest first
  admin: false,
  spotsLoaded: false,
};
let unsubUser = [];

// Firestore timestamps → milliseconds (pending server times are estimated).
const ms = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : typeof v === "number" ? v : Date.now());
const me = () => state.user && state.user.uid;
const myName = () => (state.profile && state.profile.name) || (state.user && state.user.displayName) || "Volunteer";
const balance = () => (state.profile ? state.profile.balance || 0 : 0);
const held = () => (state.profile ? state.profile.held || 0 : 0);
const cleanupEntries = () => state.ledger.filter((l) => l.kind === "cleanup");
const hoursNum = () => cleanupEntries().reduce((h, e) => h + (HOURS_BY_POINTS[e.heldDelta] || 0), 0);
const hoursText = () => t("hours", { h: L.fmt(hoursNum()) });
const fmt = (n) => L.fmt(n);
const pts = (n) => L.pts(n);

function ago(ts) {
  const s = Math.round((Date.now() - ms(ts)) / 1000);
  if (s < 60) return t("just_now");
  const m = Math.round(s / 60);
  if (m < 60) return t("min_ago", { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t("h_ago", { n: h });
  const d = Math.round(h / 24);
  if (d < 30) return t("d_ago", { n: d });
  return dateFmt(ts);
}

// Browsers often lack Uzbek month names, so Uzbek dates are built by hand.
const UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
function dateFmt(ts) {
  const d = new Date(ms(ts));
  if (L.lang === "uz") return `${d.getDate()}-${UZ_MONTHS[d.getMonth()]}, ${d.getFullYear()}-yil`;
  return d.toLocaleDateString(L.lang === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function errText(e) {
  const c = (e && e.code) || "";
  if (c === "permission-denied") return t("err_rules");
  return t("err_save");
}

  /* ---------------- Camera: live photos only, with GPS ---------------- */
  // Photos can only come from the live camera inside the page (no file picker,
  // no gallery). Each photo is stamped with time and GPS location.

  const cam = {
    el: document.getElementById("camera"),
    video: document.getElementById("cam-video"),
    preview: document.getElementById("cam-preview"),
    msg: document.getElementById("cam-msg"),
    loc: document.getElementById("cam-loc"),
    stream: null, ready: false, watch: null, fix: null, locErr: false, errKey: null,
    facing: "environment", shot: null, onDone: null, titleKey: "cam_title_before",
  };
  const camBtn = (name) => cam.el.querySelector(`[data-cam="${name}"]`);

  function camRender() {
    document.getElementById("cam-title").textContent = t(cam.titleKey);
    camBtn("close").setAttribute("aria-label", t("cam_close"));
    camBtn("shoot").setAttribute("aria-label", t("cam_shoot"));
    camBtn("switch").setAttribute("aria-label", t("cam_switch"));
    camBtn("retake").textContent = t("cam_retake");
    camBtn("use").textContent = t("cam_use");

    let cls = "";
    if (cam.locErr && !cam.fix) { cam.loc.textContent = t("loc_denied"); cls = "err"; }
    else if (cam.fix) { cam.loc.textContent = t("loc_ok", { acc: Math.round(cam.fix.acc) }); cls = "ok"; }
    else cam.loc.textContent = t("loc_wait");
    cam.loc.className = "cam-loc " + cls;

    if (cam.errKey) { cam.msg.hidden = false; cam.msg.textContent = t(cam.errKey); }
    else if (!cam.ready && !cam.shot) { cam.msg.hidden = false; cam.msg.textContent = t("cam_starting"); }
    else cam.msg.hidden = true;

    camBtn("shoot").disabled = !(cam.ready && cam.fix);
  }

  function stopStream() {
    if (cam.stream) cam.stream.getTracks().forEach((tr) => tr.stop());
    cam.stream = null;
    cam.ready = false;
    cam.video.srcObject = null;
  }

  async function camStart() {
    cam.errKey = null;
    cam.ready = false;
    camRender();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cam.errKey = "cam_unsupported";
      return camRender();
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: cam.facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      if (cam.el.hidden) { stream.getTracks().forEach((tr) => tr.stop()); return; } // closed while waiting
      cam.stream = stream;
      cam.video.srcObject = stream;
      cam.video.classList.toggle("mirror", cam.facing === "user");
      await cam.video.play().catch(() => {});
      cam.ready = true;
      const devices = await navigator.mediaDevices.enumerateDevices();
      camBtn("switch").hidden = devices.filter((d) => d.kind === "videoinput").length < 2;
    } catch (e) {
      const n = e && e.name;
      cam.errKey = n === "NotAllowedError" || n === "SecurityError" ? "cam_denied"
        : n === "NotFoundError" || n === "OverconstrainedError" ? "cam_notfound" : "cam_unsupported";
    }
    camRender();
  }

  function showLive(live) {
    cam.video.hidden = !live;
    cam.preview.hidden = live;
    document.getElementById("cam-live").hidden = !live;
    document.getElementById("cam-review").hidden = live;
  }

  function openCamera(titleKey, onDone) {
    cam.titleKey = titleKey;
    cam.onDone = onDone;
    cam.shot = null;
    cam.fix = null;
    cam.locErr = false;
    showLive(true);
    cam.el.hidden = false;
    document.body.style.overflow = "hidden";
    if (navigator.geolocation) {
      cam.watch = navigator.geolocation.watchPosition(
        (pos) => {
          cam.fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
          cam.locErr = false;
          camRender();
        },
        () => { cam.locErr = true; camRender(); },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
      );
    } else {
      cam.locErr = true;
    }
    camStart();
    camBtn("close").focus();
  }

  function closeCamera() {
    stopStream();
    if (cam.watch != null) navigator.geolocation.clearWatch(cam.watch);
    cam.watch = null;
    cam.el.hidden = true;
    document.body.style.overflow = document.getElementById("modal").hidden ? "" : "hidden";
  }

  function stampText(m) {
    const d = new Date(m.at), pad = (n) => String(n).padStart(2, "0");
    return `YASHIL QADAM · ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} · ${m.lat.toFixed(5)}, ${m.lng.toFixed(5)} ±${Math.round(m.acc)}m`;
  }

  function capture() {
    const v = cam.video;
    if (!v.videoWidth || !cam.fix) return;
    const scale = Math.min(1, 1100 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    const g = c.getContext("2d");
    g.drawImage(v, 0, 0, c.width, c.height);

    const meta = { lat: +cam.fix.lat.toFixed(6), lng: +cam.fix.lng.toFixed(6), acc: cam.fix.acc, at: Date.now() };
    // Burn the time and location into the image itself.
    const fs = Math.max(11, Math.round(c.width / 64));
    const padX = Math.round(fs * 0.7), h = Math.round(fs * 2);
    g.font = `500 ${fs}px ui-monospace, Menlo, Consolas, monospace`;
    const text = stampText(meta);
    const w = Math.min(c.width, g.measureText(text).width + padX * 2);
    g.fillStyle = "rgba(17,25,21,.72)";
    g.fillRect(0, c.height - h, w, h);
    g.fillStyle = "#ffffff";
    g.textBaseline = "middle";
    g.fillText(text, padX, c.height - h / 2, c.width - padX * 2);

    // A small copy for lists and cards (kept inside the spot record).
    const ts = Math.min(1, 360 / Math.max(c.width, c.height));
    const tc = document.createElement("canvas");
    tc.width = Math.round(c.width * ts); tc.height = Math.round(c.height * ts);
    tc.getContext("2d").drawImage(c, 0, 0, tc.width, tc.height);
    cam.shot = Object.assign({ data: c.toDataURL("image/jpeg", 0.72), thumb: tc.toDataURL("image/jpeg", 0.62) }, meta);
    cam.preview.src = cam.shot.data;
    showLive(false);
    camRender();
  }

  cam.el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cam]");
    if (!b || b.disabled) return;
    const a = b.dataset.cam;
    if (a === "close") closeCamera();
    else if (a === "shoot") capture();
    else if (a === "retake") { cam.shot = null; showLive(true); camRender(); }
    else if (a === "switch") { cam.facing = cam.facing === "environment" ? "user" : "environment"; stopStream(); camStart(); }
    else if (a === "use" && cam.shot) { const shot = cam.shot, done = cam.onDone; closeCamera(); done(shot); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !cam.el.hidden) { e.stopPropagation(); closeCamera(); }
  }, true);

  // The photo field shown in forms: a camera button, or the taken photo.
  function shotHTML(shot, emptyKey) {
    if (!shot) {
      return `
        <button type="button" class="shot-empty" data-shot="open">
          <span class="d-icon">${icons.camera}</span>
          <strong>${esc(t(emptyKey))}</strong>
          <small>${esc(t("cam_hint"))}</small>
        </button>`;
    }
    return `
      <div class="shot-full">
        <img src="${shot.data}" alt="${esc(t("selected_photo"))}">
        <div class="shot-bar">
          <span class="shot-meta">${icons.pin}<span>${esc(t("loc_ok", { acc: Math.round(shot.acc) }))}</span></span>
          <button type="button" class="btn btn-ghost btn-sm" data-shot="open">${esc(t("cam_retake"))}</button>
        </div>
      </div>`;
  }

  /* ---------------- Toast ---------------- */

  let toastTimer;
  function toast(text) {
    const el = document.getElementById("toast");
    document.getElementById("toast-text").textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3600);
  }

  // Disable a button while a write is in flight.
  async function busy(btn, fn) {
    const label = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.textContent = t("saving"); }
    try { return await fn(); }
    finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = label; } }
  }

  const icons = {
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10l-1 16H8L7 4Z"/><path d="M5 4h14"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><circle cx="12" cy="12.5" r="3.5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
    google: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-7.9Z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.7-2.8Z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4Z"/></svg>',
  };

  /* ---------------- Sign-in ---------------- */

  async function doSignIn() {
    try { await signIn(); } catch (e) { toast(t("signin_failed")); }
  }
  // Exposed for automated tests against the local emulator only.
  if (EMULATOR) window.__yqTestSignIn = testSignIn;

  const account = document.getElementById("account");
  function renderAccount() {
    const pill = document.querySelector(".points-pill");
    pill.hidden = !state.user;
    if (!state.user) {
      account.innerHTML = `<button class="btn btn-primary btn-sm signin-btn" data-signin>${icons.google}<span>${esc(t("signin_short"))}</span></button>`;
      return;
    }
    const u = state.user;
    const initial = (myName()[0] || "?").toUpperCase();
    const avatar = u.photoURL ? `<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : `<span>${esc(initial)}</span>`;
    account.innerHTML = `
      <button class="avatar-btn" data-account-menu aria-haspopup="true" aria-expanded="false" title="${esc(myName())}">${avatar}</button>
      <div class="account-menu" hidden>
        <div class="am-name">${esc(myName())}</div>
        ${u.email ? `<div class="am-mail">${esc(u.email)}</div>` : ""}
        ${state.admin ? `<div class="am-role">${esc(t("moderator"))}</div>` : ""}
        ${state.admin ? `<a class="btn btn-light btn-sm btn-block am-garden" href="garden.html">${esc(t("garden_link"))}</a>` : ""}
        <button class="btn btn-ghost btn-sm btn-block" data-signout>${esc(t("signout"))}</button>
      </div>`;
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-signin]")) { e.preventDefault(); doSignIn(); return; }
    if (e.target.closest("[data-signout]")) { signOut(); return; }
    const toggle = e.target.closest("[data-account-menu]");
    const menu = account.querySelector(".account-menu");
    if (toggle && menu) {
      menu.hidden = !menu.hidden;
      toggle.setAttribute("aria-expanded", String(!menu.hidden));
    } else if (menu && !e.target.closest(".account-menu")) {
      menu.hidden = true;
    }
  });

  // On computers, the account menu also opens when the mouse rests on the profile picture.
  if (window.matchMedia("(hover: hover)").matches) {
    let closeTimer = 0;
    const setOpen = (open) => {
      const menu = account.querySelector(".account-menu");
      const toggle = account.querySelector("[data-account-menu]");
      if (!menu || !toggle) return;
      menu.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
    };
    account.addEventListener("mouseenter", () => { clearTimeout(closeTimer); setOpen(true); });
    account.addEventListener("mouseleave", () => { closeTimer = setTimeout(() => setOpen(false), 220); });
  }

  function gateHTML(textKey) {
    return `
      <div class="gate-card">
        <div class="e-icon">${icons.check}</div>
        <h3>${esc(t("gate_title"))}</h3>
        <p>${esc(t(textKey))}</p>
        <button class="btn btn-primary signin-btn" data-signin>${icons.google}<span>${esc(t("signin"))}</span></button>
      </div>`;
  }
  function renderGates() {
    const out = !state.user;
    const gr = document.getElementById("gate-report"), gw = document.getElementById("gate-wallet");
    gr.hidden = gw.hidden = !out;
    document.getElementById("report-form").hidden = out;
    document.getElementById("wallet-main").hidden = out;
    if (out) { gr.innerHTML = gateHTML("gate_report"); gw.innerHTML = gateHTML("gate_wallet"); }
  }

  /* ---------------- Router ---------------- */

  const views = ["spots", "report", "wallet"];
  const currentView = () => (views.includes(location.hash.slice(1)) ? location.hash.slice(1) : "spots");

  function route() {
    const name = currentView();
    views.forEach((v) => (document.getElementById("view-" + v).hidden = v !== name));
    document.querySelectorAll("[data-tab]").forEach((a) => a.classList.toggle("active", a.dataset.tab === name));
    renderGates();
    if (name === "spots") renderSpots();
    if (name === "wallet") renderWallet();
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  /* ---------------- Balance & language-dependent bits ---------------- */

  function renderBalance() {
    const b = balance();
    document.querySelectorAll("[data-balance]").forEach((el) => (el.textContent = fmt(b)));
    document.querySelectorAll("[data-unit]").forEach((el) => (el.textContent = L.unit(b)));
    document.querySelectorAll("[data-hours]").forEach((el) => (el.textContent = hoursText()));
    document.querySelectorAll("[data-held-line]").forEach((el) => {
      const h = held();
      el.hidden = !h;
      el.innerHTML = h ? `${icons.clock}<span>${esc(t("held_line", { n: h }))}</span>` : "";
    });
  }

  function renderStatic() {
    document.querySelectorAll("[data-size-pts]").forEach((el) => {
      el.textContent = t("pts_to_clean", { n: SIZE_POINTS[el.dataset.sizePts] });
    });
  }

  /* ---------------- Spots ---------------- */

  let filter = "all";
  let query = "";

  const badge = (spot) => `<span class="badge ${spot.status}"><span>${esc(t("st_" + spot.status))}</span></span>`;
  const reviewBadge = (spot) =>
    spot.status === "cleaned" ? `<span class="badge rv-${spot.review}"><span>${esc(t("rv_" + spot.review))}</span></span>` : "";

  function renderSpots() {
    const grid = document.getElementById("spots-grid");
    const empty = document.getElementById("spots-empty");
    const counts = {
      all: state.spots.length,
      open: state.spots.filter((s) => s.status !== "cleaned").length,
      cleaned: state.spots.filter((s) => s.status === "cleaned").length,
    };
    Object.keys(counts).forEach((k) => (document.querySelector(`[data-count="${k}"]`).textContent = counts[k]));

    const q = query.trim().toLowerCase();
    const list = state.spots.filter((s) => {
      if (filter === "open" && s.status === "cleaned") return false;
      if (filter === "cleaned" && s.status !== "cleaned") return false;
      if (q && !(s.title + " " + s.place + " " + (s.note || "")).toLowerCase().includes(q)) return false;
      return true;
    });

    grid.innerHTML = list
      .map((s) => {
        const media = s.status === "cleaned" && s.afterThumb
          ? `<div class="split"><img src="${s.thumb}" alt=""><img src="${s.afterThumb}" alt=""></div>`
          : `<img src="${s.thumb}" alt="">`;
        const p = SIZE_POINTS[s.size];
        const foot = s.hazard
          ? `<span class="badge hazard">${esc(t("hazardous"))}</span>`
          : `<span class="reward">${esc(t(s.status === "cleaned" ? "pts_earned" : "pts_to_clean", { n: p }))}</span>`;
        return `
          <button class="spot" data-id="${s.id}">
            <div class="spot-media">${media}<span class="status">${badge(s)}</span></div>
            <div class="spot-body">
              <h3>${esc(s.title)}</h3>
              <div class="spot-meta">
                <span>${icons.pin}${esc(s.place)}</span>
                <span>${icons.bag}${esc(sizeLabel(s.size))}</span>
              </div>
              ${s.status === "cleaned" && s.cleanedName ? `<p class="spot-who done">${icons.check}${esc(t("cleaned_by_short", { name: s.cleanedName }))}</p>`
                : s.status === "claimed" && s.claimedName ? `<p class="spot-who">${icons.clock}${esc(t("cleaning_by", { name: s.claimedName }))}</p>` : ""}
              <div class="spot-foot">${foot}<span style="color:var(--muted)">${esc(ago(s.createdAt))}</span></div>
            </div>
          </button>`;
      })
      .join("");

    if (!state.spotsLoaded) {
      empty.innerHTML = `<div class="empty"><p>${esc(t("loading"))}</p></div>`;
    } else if (list.length) {
      empty.innerHTML = "";
    } else if (!state.spots.length) {
      empty.innerHTML = `
        <div class="empty">
          <div class="e-icon">${icons.camera}</div>
          <h3>${esc(t("empty_title"))}</h3>
          <p>${esc(t("empty_text"))}</p>
          <a href="#report" class="btn btn-primary">${esc(t("empty_btn"))}</a>
        </div>`;
    } else {
      empty.innerHTML = `
        <div class="empty">
          <div class="e-icon">${icons.search}</div>
          <h3>${esc(t("nomatch_title"))}</h3>
          <p>${esc(t("nomatch_text"))}</p>
        </div>`;
    }
  }

  document.querySelectorAll(".seg button").forEach((b) =>
    b.addEventListener("click", () => {
      filter = b.dataset.filter;
      document.querySelectorAll(".seg button").forEach((x) => x.classList.toggle("active", x === b));
      renderSpots();
    })
  );
  document.getElementById("spot-search").addEventListener("input", (e) => {
    query = e.target.value;
    renderSpots();
  });
  document.getElementById("spots-grid").addEventListener("click", (e) => {
    const card = e.target.closest(".spot");
    if (card) openSpot(card.dataset.id);
  });

  /* ---------------- Spot detail modal ---------------- */

  const modal = document.getElementById("modal");
  const modalContent = document.getElementById("modal-content");
  let lastFocus = null;
  let openSpotId = null;
  let certOpen = false;

  function openModal(html) {
    if (modal.hidden) lastFocus = document.activeElement;
    modal.querySelector(".modal-panel").classList.remove("wide");
    modalContent.innerHTML = html;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    modal.querySelector(".modal-close").focus();
  }
  function closeModal() {
    modal.hidden = true;
    openSpotId = null;
    certOpen = false;
    modal.querySelector(".modal-panel").classList.remove("wide");
    document.body.style.overflow = "";
    if (lastFocus) lastFocus.focus();
  }
  modal.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeModal(); });

  const afterShots = {};   // "after" photos waiting to be submitted, by spot id
  const fullPhotos = {};   // full-size photos fetched on demand
  const confirmedByMe = {}; // spot id -> true/false

  async function loadPhoto(pid) {
    if (fullPhotos[pid] !== undefined) return fullPhotos[pid];
    try {
      const snap = await fb.getDoc(fb.doc(db, "spotPhotos", pid));
      fullPhotos[pid] = snap.exists() ? snap.data().data : null;
    } catch (e) { fullPhotos[pid] = null; }
    return fullPhotos[pid];
  }

  function ownWait(s) {
    if (s.uid !== me()) return null;
    const until = ms(s.createdAt) + OWN_REPORT_WAIT_DAYS * DAY;
    if ((s.confirms || 0) >= CONFIRMS_NEEDED || until <= Date.now()) return null;
    return until;
  }
  function dailyLimitReached() {
    const p = state.profile;
    if (!p || !p.dayStart) return false;
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return ms(p.dayStart) === today && (p.cleanupsToday || 0) >= DAILY_CLEANUPS;
  }

  function openSpot(id) {
    const s = state.spots.find((x) => x.id === id);
    if (!s) return;
    openSpotId = id;
    const p = SIZE_POINTS[s.size];
    const before = fullPhotos[id] || s.thumb;
    const after = fullPhotos[id + "_after"] || s.afterThumb;
    const media = s.status === "cleaned"
      ? `<div class="detail-media two"><figure><img data-photo="${id}" src="${before}" alt="${esc(t("alt_before"))}"><figcaption>${esc(I18N_PAGE("c.before"))}</figcaption></figure><figure><img data-photo="${id}_after" src="${after}" alt="${esc(t("alt_after"))}"><figcaption>${esc(I18N_PAGE("c.after"))}</figcaption></figure></div>`
      : `<div class="detail-media"><figure><img data-photo="${id}" src="${before}" alt="${esc(t("alt_spot"))}"></figure></div>`;

    const coords = s.lat != null
      ? `<a href="https://www.google.com/maps?q=${s.lat},${s.lng}" target="_blank" rel="noopener">${esc(t("open_maps"))}</a>`
      : esc(t("not_provided"));

    const signedIn = !!state.user;
    const mine = s.uid === me();
    let actions = "";

    // "I saw it too" confirmations, for spots that aren't cleaned yet.
    let confirmRow = "";
    if (s.status !== "cleaned" && !s.hazard) {
      const n = s.confirms || 0;
      let btn = "";
      if (signedIn && !mine) {
        btn = confirmedByMe[id]
          ? `<span class="confirmed">${icons.check}${esc(t("confirmed"))}</span>`
          : `<button class="btn btn-ghost btn-sm" data-act="confirm">${icons.eye} ${esc(t("confirm_btn"))}</button>`;
      }
      confirmRow = `<div class="confirm-row"><span>${esc(t("confirms_n", { n }))}</span>${btn}</div>`;
    }

    if (s.hazard) {
      actions = `<div class="warn">${t("hazard_warn")}</div>`;
    } else if (s.status === "open") {
      actions = signedIn
        ? `<div class="row">
             <button class="btn btn-green" data-act="claim">${icons.bag} ${esc(t("claim_btn"))}</button>
             <span style="align-self:center;color:var(--muted);font-size:14px">${t("claim_hint", { n: p }).replace("<b>", '<b style="color:var(--green)">')}</span>
           </div>`
        : `<button class="btn btn-primary signin-btn" data-signin>${icons.google}<span>${esc(t("signin"))}</span></button>`;
    } else if (s.status === "claimed" && s.claimedBy === me()) {
      const wait = ownWait(s);
      const limit = dailyLimitReached();
      const blocked = wait ? `<div class="note-box">${esc(t("own_wait", { date: dateFmt(wait) }))}</div>`
        : limit ? `<div class="note-box">${esc(t("daily_limit"))}</div>` : "";
      actions = `
        <h3 style="font-size:17px">${esc(t("finished"))}</h3>
        <p style="color:var(--muted);font-size:14px;margin:4px 0 14px">${esc(t("finished_sub"))}</p>
        ${blocked}
        <div class="shot" id="after-shot"></div>
        <p class="form-error" id="after-error" role="alert" style="margin-top:12px"></p>
        <div class="row" style="margin-top:12px">
          <button class="btn btn-green" data-act="complete" disabled ${wait || limit ? 'data-blocked="1"' : ""}>${esc(t("complete_btn", { n: p }))}</button>
          <button class="btn btn-ghost" data-act="unclaim">${esc(t("release_btn"))}</button>
        </div>`;
    } else if (s.status === "claimed") {
      actions = `<p class="muted-line">${esc(t("cleaning_by", { name: s.claimedName || "—" }))}</p>`;
    } else {
      actions = `<p style="color:var(--green-2);font-weight:500">${esc(t("cleaned_by", { name: s.cleanedName || "—", ago: ago(s.cleanedAt) }))}</p>`;
    }

    let modRow = "";
    if (state.admin && s.status === "cleaned") {
      modRow = `
        <div class="mod-row">
          <span class="am-role">${esc(t("moderator"))}</span>
          <button class="btn btn-green btn-sm" data-act="approve" ${s.review === "approved" ? "disabled" : ""}>${icons.check} ${esc(t("mod_approve"))}</button>
          <button class="btn btn-ghost btn-sm mod-reject" data-act="reject" ${s.review === "rejected" ? "disabled" : ""}>${esc(t("mod_reject"))}</button>
        </div>`;
    }

    openModal(`
      ${media}
      <div class="detail-body">
        <div style="display:flex;gap:8px;flex-wrap:wrap">${badge(s)}${reviewBadge(s)}${s.hazard ? `<span class="badge hazard">${esc(t("hazardous"))}</span>` : ""}</div>
        <h2 id="modal-title">${esc(s.title)}</h2>
        ${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}
        <div class="facts">
          <div>${esc(t("fact_place"))}<b>${esc(s.place)}</b></div>
          <div>${esc(t("fact_size"))}<b>${esc(sizeLabel(s.size))} · ${esc(sizeDetail(s.size))}</b></div>
          <div>${esc(t("fact_coords"))}<b>${coords}</b></div>
        </div>
        <p class="muted-line" style="margin-top:14px">${esc(t("reported_by"))}: <b>${esc(s.authorName || "—")}</b></p>
        <ul class="timeline">
          <li class="done"><b>${esc(t("tl_reported"))}</b> · ${esc(ago(s.createdAt))}</li>
          <li class="${s.claimedAt ? "done" : ""}"><b>${esc(t("tl_claimed"))}</b>${s.claimedAt ? " · " + esc(ago(s.claimedAt)) : ""}</li>
          <li class="${s.cleanedAt ? "done" : ""}"><b>${esc(t("tl_cleaned"))}</b>${s.cleanedAt ? " · " + esc(ago(s.cleanedAt)) : ""}</li>
        </ul>
        ${confirmRow}
        <div class="detail-actions">${actions}${modRow}</div>
      </div>`);

    // Swap thumbnails for full-size photos once they arrive.
    modalContent.querySelectorAll("img[data-photo]").forEach(async (img) => {
      const full = await loadPhoto(img.dataset.photo);
      if (full && img.isConnected) img.src = full;
    });
    // Find out whether I already confirmed this spot.
    if (signedIn && !mine && s.status !== "cleaned" && confirmedByMe[id] === undefined) {
      data.hasConfirmed(me(), id).then((v) => {
        confirmedByMe[id] = v;
        if (v && openSpotId === id && !modal.hidden) openSpot(id);
      }).catch(() => {});
    }

    const afterEl = document.getElementById("after-shot");
    if (afterEl) {
      const btn = modalContent.querySelector('[data-act="complete"]');
      const draw = () => {
        afterEl.innerHTML = shotHTML(afterShots[s.id], "after_cam");
        btn.disabled = !afterShots[s.id] || !!btn.dataset.blocked;
      };
      draw();
      afterEl.addEventListener("click", (e) => {
        if (!e.target.closest('[data-shot="open"]')) return;
        openCamera("cam_title_after", (shot) => {
          afterShots[s.id] = shot;
          document.getElementById("after-error").textContent = "";
          draw();
        });
      });
    }

    modalContent.querySelectorAll("[data-act]").forEach((btn) =>
      btn.addEventListener("click", () => spotAction(s, btn.dataset.act, btn))
    );
  }

  async function spotAction(s, act, btn) {
    const uid = me();
    if (!uid) return doSignIn();
    const p = SIZE_POINTS[s.size];
    try {
      if (act === "claim") {
        await busy(btn, () => data.claimSpot(uid, myName(), s.id));
        toast(t("toast_claimed"));
      } else if (act === "unclaim") {
        await busy(btn, () => data.unclaimSpot(s.id));
        delete afterShots[s.id];
        toast(t("toast_released"));
      } else if (act === "confirm") {
        await busy(btn, () => data.confirmSpot(uid, s.id));
        confirmedByMe[s.id] = true;
        toast(t("toast_confirmed"));
      } else if (act === "approve" || act === "reject") {
        await busy(btn, () => data.moderate(uid, s.id, act === "approve" ? "approved" : "rejected"));
        toast(t("toast_reviewed"));
      } else if (act === "complete") {
        const after = afterShots[s.id];
        if (!after) return;
        // The "after" photo must be taken at the reported spot (the server checks this too).
        const d = distance(s, after);
        const tolerance = Math.min(50, ((s.acc || 0) + after.acc) / 2);
        if (d > MAX_DIST + tolerance) {
          document.getElementById("after-error").textContent = t("err_far", { d: fmt(Math.round(d)), max: MAX_DIST });
          return;
        }
        await busy(btn, () => data.cleanSpot(uid, myName(), s, { lat: after.lat, lng: after.lng, acc: after.acc, thumb: after.thumb, photo: after.data }, state.profile));
        fullPhotos[s.id + "_after"] = after.data;
        delete afterShots[s.id];
        toast(navigator.onLine ? t("toast_cleaned", { n: p }) : t("offline_saved"));
      }
      // Show the new state straight away (live updates may have arrived mid-write).
      if (openSpotId === s.id && !modal.hidden) {
        const fresh = state.spots.find((x) => x.id === s.id);
        if (fresh) openSpot(s.id);
      }
    } catch (e) {
      const errEl = document.getElementById("after-error");
      if (errEl && act === "complete") errEl.textContent = errText(e);
      else toast(errText(e));
    }
  }

  // "Before"/"After" captions are shared with the landing page.
  function I18N_PAGE(key) {
    const fallback = { "c.before": { uz: "Oldin", ru: "До", en: "Before" }, "c.after": { uz: "Keyin", ru: "После", en: "After" } };
    return fallback[key][L.lang];
  }

  /* ---------------- Report form ---------------- */

  let reportShot = null;
  const reportShotEl = document.getElementById("report-shot");
  const renderReportShot = () => (reportShotEl.innerHTML = shotHTML(reportShot, "cam_open"));
  reportShotEl.addEventListener("click", (e) => {
    if (!e.target.closest('[data-shot="open"]')) return;
    openCamera("cam_title_before", (shot) => {
      reportShot = shot;
      document.getElementById("report-error").textContent = "";
      renderReportShot();
    });
  });
  renderReportShot();

  document.getElementById("report-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!me()) return doSignIn();
    const err = document.getElementById("report-error");
    const title = document.getElementById("r-title").value.trim();
    const place = document.getElementById("r-place").value.trim();
    const size = document.querySelector('input[name="size"]:checked').value;
    const note = document.getElementById("r-note").value.trim();
    const hazard = document.getElementById("r-hazard").checked;
    const claim = document.getElementById("r-claim").checked && !hazard;

    if (!reportShot) return (err.textContent = t("err_photo"));
    if (!title) return (err.textContent = t("err_title"));
    if (!place) return (err.textContent = t("err_place"));
    err.textContent = "";

    const btn = e.target.querySelector('button[type="submit"]');
    try {
      const id = await busy(btn, () => data.reportSpot(me(), myName(), {
        title, place, size, note, hazard, claim,
        lat: reportShot.lat, lng: reportShot.lng, acc: reportShot.acc, thumb: reportShot.thumb,
      }, reportShot.data));
      fullPhotos[id] = reportShot.data;
    } catch (ex) {
      err.textContent = errText(ex);
      return;
    }
    e.target.reset();
    reportShot = null;
    renderReportShot();
    toast(navigator.onLine ? t("toast_reported", { n: REPORT_POINTS }) : t("offline_saved"));
    location.hash = "#spots";
  });

  /* ---------------- Rewards ---------------- */

  const rewardIcons = {
    cup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5Z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3v2M11 3v2"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9h14l-1 11H6Z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/></svg>',
    tree: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21v-6"/><path d="M12 3c3.5 0 6 2.7 6 6 0 3.5-2.7 6-6 6s-6-2.5-6-6c0-3.3 2.5-6 6-6Z"/></svg>',
    bottle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2h4v3l2 3v12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8l2-3Z"/><path d="M8 12h8"/></svg>',
    ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4Z"/><path d="M13 6v12" stroke-dasharray="2 2"/></svg>',
  };

  function renderRewards() {
    const b = balance();
    document.getElementById("reward-list").innerHTML = REWARDS.map((r) => {
      const [name, desc] = rewardText(r);
      const can = b >= r.cost;
      return `
        <div class="reward-item">
          <span class="ri-icon">${rewardIcons[r.icon]}</span>
          <div class="ri-text"><b>${esc(name)}</b><span>${esc(desc)}</span><em>${esc(pts(r.cost))}</em></div>
          <button class="btn ${can ? "btn-green" : "btn-ghost"} btn-sm" data-reward="${r.id}" ${can ? "" : "disabled"}
            title="${can ? "" : esc(t("reward_need", { n: r.cost - b }))}">${esc(t("reward_get"))}</button>
        </div>`;
    }).join("");
  }

  document.getElementById("reward-list").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-reward]");
    if (!btn || !me()) return;
    const r = REWARDS.find((x) => x.id === btn.dataset.reward);
    if (!r || balance() < r.cost) return;
    try {
      const c = await busy(btn, () => data.redeemReward(me(), r.id));
      toast(t("toast_reward", { code: c }));
    } catch (ex) { toast(errText(ex)); }
  });

  /* ---------------- Wallet ---------------- */

  function ledgerView(l) {
    const releasedKey = new Set(state.ledger.filter((x) => x.kind === "release").map((x) => x.source + "_" + x.spotId));
    let label = "", sub = ago(l.at), amount = l.balanceDelta + l.heldDelta, icon = amount > 0 ? icons.plus : icons.minus;
    if (l.kind === "report" || l.kind === "cleanup") {
      label = t(l.kind === "report" ? "led_report" : "led_cleanup", { title: l.title || "" });
      const key = (l.kind === "report" ? "report" : "clean") + "_" + l.spotId;
      sub += " · " + (releasedKey.has(key) ? t("st_released") : t("st_pending_until", { date: dateFmt(ms(l.at) + HOLD_DAYS * DAY) }));
      if (!releasedKey.has(key)) icon = icons.clock;
    } else if (l.kind === "reward") {
      const r = REWARDS.find((x) => x.id === l.reward);
      label = t("led_reward", { name: r ? rewardText(r)[0] : l.reward });
      sub = t("reward_sub", { code: l.code, ago: ago(l.at) });
      icon = icons.gift;
    } else if (l.kind === "gift_out") {
      label = t("led_giftout", { code: l.code });
      icon = icons.gift;
    } else if (l.kind === "gift_in") {
      label = t("led_giftin", { name: l.fromName || "—" });
      icon = icons.gift;
    }
    return { label, sub, amount, icon };
  }

  function renderWallet() {
    renderBalance();
    if (!state.user) return;
    const earned = state.ledger.filter((l) => l.kind === "report" || l.kind === "cleanup").reduce((s, l) => s + l.heldDelta, 0);
    document.querySelector('[data-stat="reports"]').textContent = fmt(state.ledger.filter((l) => l.kind === "report").length);
    document.querySelector('[data-stat="cleanups"]').textContent = fmt(cleanupEntries().length);
    document.querySelector('[data-stat="earned"]').textContent = fmt(earned);
    renderRewards();
    renderGift();
    renderCertSummary();

    const ul = document.getElementById("ledger");
    const list = state.ledger.filter((l) => l.kind !== "release");
    if (!list.length) {
      ul.innerHTML = `<li class="ledger-empty" style="display:block;border:0">${t("ledger_empty")}</li>`;
      return;
    }
    ul.innerHTML = list
      .map((l) => {
        const v = ledgerView(l);
        const pos = v.amount > 0;
        return `
          <li>
            <span class="l-icon ${pos ? "" : "out"}">${v.icon}</span>
            <div class="l-text"><b>${esc(v.label)}</b><span>${esc(v.sub)}</span></div>
            <span class="l-amt ${pos ? "pos" : ""}">${pos ? "+" : "−"}${esc(pts(Math.abs(v.amount)))}</span>
          </li>`;
      })
      .join("");
  }

  let redeemTab = "shop";
  document.querySelectorAll("[data-redeem]").forEach((b) =>
    b.addEventListener("click", () => {
      redeemTab = b.dataset.redeem;
      document.querySelectorAll("[data-redeem]").forEach((x) => x.classList.toggle("active", x === b));
      document.getElementById("panel-shop").hidden = redeemTab !== "shop";
      document.getElementById("gift-panel").hidden = redeemTab !== "gift";
      document.getElementById("cert-form").hidden = redeemTab !== "cert";
    })
  );

  /* ---------------- Gifts: one-time codes ---------------- */

  let lastGiftCode = null;
  const giftPanel = document.getElementById("gift-panel");
  function renderGift() {
    const keep = {
      amount: giftPanel.querySelector("#g-amount")?.value || "",
      msg: giftPanel.querySelector("#g-msg")?.value || "",
      code: giftPanel.querySelector("#g-code")?.value || "",
    };
    giftPanel.innerHTML = `
      <form id="gift-send" novalidate>
        <h3 class="gp-title">${esc(t("gift_send_title"))}</h3>
        <div class="field">
          <label for="g-amount">${esc(t("gift_amount"))}</label>
          <input class="input mono" id="g-amount" type="number" min="1" step="1" placeholder="100" value="${esc(keep.amount)}">
          <div class="quick" data-quick="g-amount">
            <button type="button" data-v="50">50</button><button type="button" data-v="100">100</button>
            <button type="button" data-v="250">250</button><button type="button" data-v="max">${esc(t("all"))}</button>
          </div>
        </div>
        <div class="field">
          <label for="g-msg">${esc(t("gift_msg"))}</label>
          <input class="input" id="g-msg" maxlength="200" placeholder="${esc(t("gift_msg_ph"))}" value="${esc(keep.msg)}">
        </div>
        ${lastGiftCode ? `
          <div class="code-box">
            <span class="cb-label">${esc(t("gift_code_ready"))}</span>
            <div class="cb-row"><b class="mono" id="gift-code">${esc(lastGiftCode)}</b>
              <button type="button" class="btn btn-ghost btn-sm" data-copy>${esc(t("copy"))}</button></div>
            <small>${esc(t("gift_code_hint"))}</small>
          </div>` : ""}
        <div class="form-actions">
          <span class="form-error" id="gift-error" role="alert"></span>
          <button type="submit" class="btn btn-green">${esc(t("gift_create"))}</button>
        </div>
      </form>
      <form id="gift-receive" class="gift-receive" novalidate>
        <h3 class="gp-title">${esc(t("gift_receive_title"))}</h3>
        <div class="row">
          <input class="input mono" id="g-code" maxlength="20" autocomplete="off" placeholder="K7M2Q9XA4B" value="${esc(keep.code)}">
          <button type="submit" class="btn btn-primary">${esc(t("gift_redeem_btn"))}</button>
        </div>
        <span class="form-error" id="gift-in-error" role="alert"></span>
      </form>`;
  }

  giftPanel.addEventListener("click", async (e) => {
    const q = e.target.closest("[data-quick] button");
    if (q) giftPanel.querySelector("#g-amount").value = q.dataset.v === "max" ? balance() : q.dataset.v;
    if (e.target.closest("[data-copy]")) {
      try { await navigator.clipboard.writeText(lastGiftCode); toast(t("copied")); } catch (ex) { /* select manually */ }
    }
  });
  giftPanel.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!me()) return doSignIn();
    const btn = e.target.querySelector('button[type="submit"]');
    if (e.target.id === "gift-send") {
      const err = giftPanel.querySelector("#gift-error");
      const amt = parseInt(giftPanel.querySelector("#g-amount").value, 10) || 0;
      const msg = giftPanel.querySelector("#g-msg").value.trim();
      if (amt < 1) return (err.textContent = t("err_amount"));
      if (amt > balance()) return (err.textContent = t("err_balance"));
      try {
        lastGiftCode = await busy(btn, () => data.sendGift(me(), myName(), amt, msg));
        giftPanel.querySelector("#g-amount").value = "";
        giftPanel.querySelector("#g-msg").value = "";
        renderGift();
      } catch (ex) { err.textContent = errText(ex); }
    } else {
      const err = giftPanel.querySelector("#gift-in-error");
      const code = giftPanel.querySelector("#g-code").value.trim();
      if (!code) return (err.textContent = t("err_code"));
      if (!navigator.onLine) return (err.textContent = t("offline_needed"));
      try {
        const g = await busy(btn, () => data.claimGift(me(), code));
        giftPanel.querySelector("#g-code").value = "";
        toast(t("gift_received", { name: g.fromName || "—", n: g.amount }));
      } catch (ex) {
        const map = { "gift-not-found": "err_gift_notfound", "gift-claimed": "err_gift_claimed", "gift-own": "err_gift_own" };
        err.textContent = map[ex.code] ? t(map[ex.code]) : errText(ex);
      }
    }
  });

  /* ---------------- Certificate ---------------- */

  const certName = document.getElementById("cert-name");

  function renderCertSummary() {
    const list = cleanupEntries();
    const box = document.getElementById("cert-summary");
    document.getElementById("cert-open").disabled = !list.length;
    if (state.profile && !certName.value) certName.value = state.profile.certName || state.profile.name || "";
    if (!list.length) {
      box.innerHTML = `<div class="cert-locked">${esc(t("cert_locked"))}</div>`;
      return;
    }
    box.innerHTML = `
      <div class="cert-stats">
        <div><b>${fmt(list.length)}</b>${esc(t("cert_cleanups"))}</div>
        <div><b>${esc(hoursText())}</b>${esc(t("cert_hours"))}</div>
      </div>`;
  }

  function openCertificate(name) {
    const list = cleanupEntries().slice().sort((a, b) => ms(a.at) - ms(b.at));
    if (!list.length) return;
    const certId = (state.profile && state.profile.certId) || "—";
    const first = dateFmt(list[0].at), last = dateFmt(list[list.length - 1].at);
    const period = first === last ? first : `${first} – ${last}`;
    openSpotId = null;
    openModal(`
      <div class="cert-wrap">
        <div class="certificate" id="certificate">
          <span class="cert-sample">${esc(t("cert_sample"))}</span>
          <div class="cert-brand"><img src="assets/logo.svg" alt="">${esc(t("cert_brand"))}</div>
          <h2 class="cert-title serif" id="modal-title">${esc(t("cert_title"))}</h2>
          <p class="cert-lead">${esc(t("cert_lead"))}</p>
          <p class="cert-name serif">${esc(name)}</p>
          <p class="cert-body">${esc(t("cert_body"))}</p>
          <div class="cert-figures">
            <div><b>${fmt(list.length)}</b><span>${esc(t("cert_cleanups"))}</span></div>
            <div><b>${esc(hoursText())}</b><span>${esc(t("cert_hours"))}</span></div>
            <div><b>${esc(period)}</b><span>${esc(t("cert_period"))}</span></div>
          </div>
          <div class="cert-foot">
            <div><span>${esc(t("cert_no"))}</span><b class="mono">${esc(certId)}</b></div>
            <div class="cert-sign"><i></i><span>${esc(t("cert_sign"))}</span></div>
            <div><span>${esc(t("cert_issued"))}</span><b>${esc(dateFmt(Date.now()))}</b></div>
          </div>
        </div>
        <div class="cert-actions">
          <button class="btn btn-primary" data-print>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><path d="M6 14h12v7H6Z"/></svg>
            ${esc(t("cert_print"))}
          </button>
        </div>
      </div>`);
    modal.querySelector(".modal-panel").classList.add("wide");
    modalContent.querySelector("[data-print]").addEventListener("click", () => {
      document.body.classList.add("printing");
      window.print();
    });
  }
  window.addEventListener("afterprint", () => document.body.classList.remove("printing"));

  document.getElementById("cert-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("cert-error");
    const name = certName.value.trim();
    if (!cleanupEntries().length) return (err.textContent = t("cert_locked"));
    if (!name) return (err.textContent = t("err_cert_name"));
    err.textContent = "";
    const fields = { certName: name.slice(0, 80) };
    if (!state.profile.certId) fields.certId = "YQ-" + data.randomCode(6);
    try { await data.updateProfile(me(), fields); } catch (ex) { /* still show it */ }
    certOpen = true;
    openCertificate(name);
  });

  /* ---------------- Live data from Firebase ---------------- */

  function rerender() {
    renderBalance();
    renderAccount();
    const view = currentView();
    if (view === "spots") renderSpots();
    if (view === "wallet") renderWallet();
    if (openSpotId && !modal.hidden && cam.el.hidden) openSpot(openSpotId);
  }

  // All spots, newest first, for everyone (signed in or not).
  fb.onSnapshot(
    fb.query(fb.collection(db, "spots"), fb.orderBy("createdAt", "desc"), fb.limit(300)),
    (snap) => {
      state.spots = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));
      state.spotsLoaded = true;
      rerender();
    },
    () => { state.spotsLoaded = true; renderSpots(); }
  );

  let releasing = false;
  async function releaseMatured() {
    if (releasing || !me() || !navigator.onLine) return;
    releasing = true;
    try {
      const got = await data.releaseDue(me(), state.ledger);
      if (got > 0) toast(t("toast_released_pts", { n: got }));
    } finally { releasing = false; }
  }

  fb.onAuthStateChanged(auth, async (user) => {
    unsubUser.forEach((u) => u());
    unsubUser = [];
    state.user = user;
    state.profile = null;
    state.ledger = [];
    state.admin = false;
    Object.keys(confirmedByMe).forEach((k) => delete confirmedByMe[k]);
    renderAccount();
    renderGates();
    if (!user) { rerender(); return; }

    const name = user.displayName || sessionStorage.getItem("yq:testName") || (user.email || "").split("@")[0] || "Volunteer";
    try { await data.ensureUser(user.uid, name, user.photoURL || null); } catch (e) { toast(errText(e)); }
    state.admin = await data.isAdmin(user.uid);

    let firstLedger = true;
    unsubUser.push(fb.onSnapshot(fb.doc(db, "users", user.uid), (snap) => {
      state.profile = snap.exists() ? snap.data({ serverTimestamps: "estimate" }) : null;
      rerender();
    }));
    unsubUser.push(fb.onSnapshot(
      fb.query(fb.collection(db, "users", user.uid, "ledger"), fb.orderBy("at", "desc")),
      (snap) => {
        state.ledger = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));
        rerender();
        if (firstLedger) { firstLedger = false; releaseMatured(); }
      }
    ));
  });

  /* ---------------- Offline ---------------- */

  const offlineBar = document.getElementById("offline-bar");
  function renderOffline() {
    offlineBar.hidden = navigator.onLine;
    offlineBar.textContent = t("offline_bar");
  }
  window.addEventListener("online", () => { renderOffline(); releaseMatured(); });
  window.addEventListener("offline", renderOffline);
  window.addEventListener("yq:synced", () => toast(t("synced")));
  window.addEventListener("yq:sync-failed", (e) => toast(errText(e.detail)));

  /* ---------------- "Add to home screen" ---------------- */

  const installCard = document.getElementById("install-card");
  let installPrompt = null;
  const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  const installDismissed = () => { try { return localStorage.getItem("yq:install-dismissed") === "1"; } catch (e) { return false; } };
  function renderInstall() {
    const show = !standalone() && !installDismissed() && (installPrompt || isIOS);
    installCard.hidden = !show;
    if (!show) return;
    installCard.innerHTML = `
      <img src="assets/icon-192.png" alt="" width="48" height="48">
      <div class="ic-text"><b>${esc(t("install_title"))}</b><span>${esc(installPrompt ? t("install_text") : t("install_ios"))}</span></div>
      ${installPrompt ? `<button class="btn btn-green btn-sm" data-install>${esc(t("install_btn"))}</button>` : ""}
      <button class="ic-close" data-install-close aria-label="${esc(t("cam_close"))}">×</button>`;
  }
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; renderInstall(); });
  window.addEventListener("appinstalled", () => { installPrompt = null; renderInstall(); });
  installCard.addEventListener("click", async (e) => {
    if (e.target.closest("[data-install]") && installPrompt) {
      installPrompt.prompt();
      try { await installPrompt.userChoice; } catch (ex) { /* ignore */ }
      installPrompt = null;
      renderInstall();
    } else if (e.target.closest("[data-install-close]")) {
      try { localStorage.setItem("yq:install-dismissed", "1"); } catch (ex) { /* ignore */ }
      renderInstall();
    }
  });

  /* ---------------- Language change ---------------- */

  document.addEventListener("langchange", () => {
    renderOffline();
    renderInstall();
    renderBalance();
    renderStatic();
    renderReportShot();
    renderAccount();
    renderGates();
    if (!cam.el.hidden) camRender();
    ["report-error", "cert-error"].forEach((id) => (document.getElementById(id).textContent = ""));
    const view = currentView();
    if (view === "spots") renderSpots();
    if (view === "wallet") renderWallet();
    if (openSpotId && !modal.hidden) openSpot(openSpotId);
    if (certOpen && !modal.hidden) openCertificate(certName.value.trim());
  });

  /* ---------------- Init ---------------- */

  renderAccount();
  renderBalance();
  renderStatic();
  renderOffline();
  renderInstall();
  route();
