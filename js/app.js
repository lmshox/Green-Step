// Yashil Qadam app — client-side prototype.
// Everything is stored in localStorage so the site works without a server.
// All visible text comes from js/i18n.js (window.I18N).
(function () {
  "use strict";

  const L = window.I18N;
  const t = L.t;

  const KEY = "yashilqadam:v1";
  const OLD_KEY = "greenstep:v1";
  const REPORT_POINTS = 10;
  const SIZE_POINTS = { small: 50, medium: 120, large: 250 };
  const SIZE_HOURS = { small: 0.5, medium: 1.5, large: 3 }; // estimated volunteer hours

  // Example rewards until real partners are signed up.
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

  /* ---------------- State ---------------- */

  function load() {
    try {
      const raw = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return { spots: [], ledger: [] };
  }
  let state = load();
  state.profile = state.profile || {};

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      toast(t("storage_full"));
      return false;
    }
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const balance = () => state.ledger.reduce((s, l) => s + l.amount, 0);
  const code = () => "YQ-" + Math.random().toString(36).slice(2, 8).toUpperCase();
  const cleanups = () => state.spots.filter((s) => s.status === "cleaned" && s.cleaner === "you");
  const hoursNum = () => cleanups().reduce((h, s) => h + SIZE_HOURS[s.size], 0);
  const hoursText = () => t("hours", { h: L.fmt(hoursNum()) });
  const fmt = (n) => L.fmt(n);
  const pts = (n) => L.pts(n);

  function ago(ts) {
    const s = Math.round((Date.now() - ts) / 1000);
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
    const d = new Date(ts);
    if (L.lang === "uz") return `${d.getDate()}-${UZ_MONTHS[d.getMonth()]}, ${d.getFullYear()}-yil`;
    return d.toLocaleDateString(L.lang === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  }

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Ledger entries store data, not sentences, so they can be shown in any language.
  function addLedger(amount, kind, data) {
    state.ledger.unshift(Object.assign({ id: uid(), amount, kind, at: Date.now() }, data));
  }

  function ledgerLabel(l) {
    if (l.kind === "report" && l.title) return t("led_report", { title: l.title });
    if (l.kind === "cleanup" && l.title) return t("led_cleanup", { title: l.title });
    if (l.kind === "reward") {
      const r = REWARDS.find((x) => x.id === l.reward);
      return t("led_reward", { name: r ? rewardText(r)[0] : l.reward });
    }
    if (l.kind === "gift" && l.to) return t("led_gift", { to: l.to });
    return l.label || ""; // entries saved by the first version
  }

  /* ---------------- Camera: live photos only, with GPS ---------------- */
  // Photos can only come from the live camera inside the page (no file picker,
  // no gallery). Each photo is stamped with time and GPS location.

  const MAX_DIST = 100; // metres allowed between the "before" and "after" photo
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

    cam.shot = Object.assign({ data: c.toDataURL("image/jpeg", 0.78) }, meta);
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

  function distance(a, b) {
    const R = 6371000, r = (x) => (x * Math.PI) / 180;
    const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

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
    toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  /* ---------------- Router ---------------- */

  const views = ["spots", "report", "wallet"];
  const currentView = () => (views.includes(location.hash.slice(1)) ? location.hash.slice(1) : "spots");

  function route() {
    const name = currentView();
    views.forEach((v) => (document.getElementById("view-" + v).hidden = v !== name));
    document.querySelectorAll("[data-tab]").forEach((a) => a.classList.toggle("active", a.dataset.tab === name));
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
  }

  function renderStatic() {
    document.querySelectorAll("[data-size-pts]").forEach((el) => {
      el.textContent = t("pts_to_clean", { n: SIZE_POINTS[el.dataset.sizePts] });
    });
  }

  /* ---------------- Spots ---------------- */

  let filter = "all";
  let query = "";

  const icons = {
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10l-1 16H8L7 4Z"/><path d="M5 4h14"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><circle cx="12" cy="12.5" r="3.5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/></svg>',
  };

  const badge = (spot) => `<span class="badge ${spot.status}"><span>${esc(t("st_" + spot.status))}</span></span>`;

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
        const media = s.status === "cleaned" && s.afterPhoto
          ? `<div class="split"><img src="${s.photo}" alt=""><img src="${s.afterPhoto}" alt=""></div>`
          : `<img src="${s.photo}" alt="">`;
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
              <div class="spot-foot">${foot}<span style="color:var(--muted)">${esc(ago(s.createdAt))}</span></div>
            </div>
          </button>`;
      })
      .join("");

    if (list.length) {
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

  const afterShots = {}; // "after" photos waiting to be submitted, by spot id

  function openSpot(id) {
    const s = state.spots.find((x) => x.id === id);
    if (!s) return;
    openSpotId = id;
    const p = SIZE_POINTS[s.size];
    const media = s.afterPhoto
      ? `<div class="detail-media two"><figure><img src="${s.photo}" alt="${esc(t("alt_before"))}"><figcaption>${esc(I18N_PAGE("c.before"))}</figcaption></figure><figure><img src="${s.afterPhoto}" alt="${esc(t("alt_after"))}"><figcaption>${esc(I18N_PAGE("c.after"))}</figcaption></figure></div>`
      : `<div class="detail-media"><figure><img src="${s.photo}" alt="${esc(t("alt_spot"))}"></figure></div>`;

    const coords = s.lat != null
      ? `<a href="https://www.google.com/maps?q=${s.lat},${s.lng}" target="_blank" rel="noopener">${esc(t("open_maps"))}</a>`
      : esc(t("not_provided"));

    let actions = "";
    if (s.hazard) {
      actions = `<div class="warn">${t("hazard_warn")}</div>`;
    } else if (s.status === "open") {
      actions = `
        <div class="row">
          <button class="btn btn-green" data-act="claim">${icons.bag} ${esc(t("claim_btn"))}</button>
          <span style="align-self:center;color:var(--muted);font-size:14px">${t("claim_hint", { n: p }).replace("<b>", '<b style="color:var(--green)">')}</span>
        </div>`;
    } else if (s.status === "claimed") {
      actions = `
        <h3 style="font-size:17px">${esc(t("finished"))}</h3>
        <p style="color:var(--muted);font-size:14px;margin:4px 0 14px">${esc(t("finished_sub"))}</p>
        <div class="shot" id="after-shot"></div>
        <p class="form-error" id="after-error" role="alert" style="margin-top:12px"></p>
        <div class="row" style="margin-top:12px">
          <button class="btn btn-green" data-act="complete" disabled>${esc(t("complete_btn", { n: p }))}</button>
          <button class="btn btn-ghost" data-act="unclaim">${esc(t("release_btn"))}</button>
        </div>`;
    } else {
      actions = `<p style="color:var(--green-2);font-weight:500">${esc(t("cleaned_by_you", { ago: ago(s.cleanedAt) }))}</p>`;
    }

    openModal(`
      ${media}
      <div class="detail-body">
        <div style="display:flex;gap:8px;flex-wrap:wrap">${badge(s)}${s.hazard ? `<span class="badge hazard">${esc(t("hazardous"))}</span>` : ""}</div>
        <h2 id="modal-title">${esc(s.title)}</h2>
        ${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}
        <div class="facts">
          <div>${esc(t("fact_place"))}<b>${esc(s.place)}</b></div>
          <div>${esc(t("fact_size"))}<b>${esc(sizeLabel(s.size))} · ${esc(sizeDetail(s.size))}</b></div>
          <div>${esc(t("fact_coords"))}<b>${coords}</b></div>
        </div>
        <ul class="timeline">
          <li class="done"><b>${esc(t("tl_reported"))}</b> · ${esc(ago(s.createdAt))}</li>
          <li class="${s.claimedAt ? "done" : ""}"><b>${esc(t("tl_claimed"))}</b>${s.claimedAt ? " · " + esc(ago(s.claimedAt)) : ""}</li>
          <li class="${s.cleanedAt ? "done" : ""}"><b>${esc(t("tl_cleaned"))}</b>${s.cleanedAt ? " · " + esc(ago(s.cleanedAt)) : ""}</li>
        </ul>
        <div class="detail-actions">${actions}</div>
      </div>`);

    const afterEl = document.getElementById("after-shot");
    if (afterEl) {
      const draw = () => {
        afterEl.innerHTML = shotHTML(afterShots[s.id], "after_cam");
        modalContent.querySelector('[data-act="complete"]').disabled = !afterShots[s.id];
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
      btn.addEventListener("click", () => {
        const act = btn.dataset.act;
        if (act === "claim") {
          s.status = "claimed";
          s.claimedAt = Date.now();
          save();
          toast(t("toast_claimed"));
        } else if (act === "unclaim") {
          s.status = "open";
          s.claimedAt = null;
          delete afterShots[s.id];
          save();
          toast(t("toast_released"));
        } else if (act === "complete" && afterShots[s.id]) {
          const after = afterShots[s.id];
          // The "after" photo must be taken at the reported spot.
          if (s.lat != null) {
            const d = distance(s, after);
            const tolerance = Math.min(50, ((s.acc || 0) + after.acc) / 2);
            if (d > MAX_DIST + tolerance) {
              document.getElementById("after-error").textContent = t("err_far", { d: fmt(Math.round(d)), max: MAX_DIST });
              return;
            }
          }
          s.status = "cleaned";
          s.afterPhoto = after.data;
          s.afterMeta = { lat: after.lat, lng: after.lng, acc: after.acc, at: after.at };
          delete afterShots[s.id];
          s.cleanedAt = Date.now();
          s.cleaner = "you";
          s.hours = SIZE_HOURS[s.size];
          addLedger(p, "cleanup", { title: s.title });
          if (!save()) {
            s.status = "claimed"; s.afterPhoto = null; s.cleanedAt = null; state.ledger.shift();
            return;
          }
          renderBalance();
          toast(t("toast_cleaned", { n: p }));
        }
        renderSpots();
        openSpot(s.id);
      })
    );
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

  document.getElementById("report-form").addEventListener("submit", (e) => {
    e.preventDefault();
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

    const now = Date.now();
    const spot = {
      id: uid(), title, place, size, note, hazard,
      lat: reportShot.lat, lng: reportShot.lng, acc: reportShot.acc, photoAt: reportShot.at,
      photo: reportShot.data, afterPhoto: null,
      status: claim ? "claimed" : "open",
      createdAt: now, claimedAt: claim ? now : null, cleanedAt: null,
      reporter: "you",
    };
    state.spots.unshift(spot);
    addLedger(REPORT_POINTS, "report", { title });
    if (!save()) {
      state.spots.shift();
      state.ledger.shift();
      return;
    }

    // Reset form
    e.target.reset();
    reportShot = null;
    renderReportShot();

    renderBalance();
    toast(t("toast_reported", { n: REPORT_POINTS }));
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

  document.getElementById("reward-list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-reward]");
    if (!btn) return;
    const r = REWARDS.find((x) => x.id === btn.dataset.reward);
    if (!r || balance() < r.cost) return;
    const c = code();
    addLedger(-r.cost, "reward", { reward: r.id, code: c });
    if (!save()) { state.ledger.shift(); return; }
    renderWallet();
    toast(t("toast_reward", { code: c }));
  });

  /* ---------------- Wallet ---------------- */

  function renderWallet() {
    renderBalance();
    const earned = state.ledger.filter((l) => l.kind === "report" || l.kind === "cleanup").reduce((s, l) => s + l.amount, 0);
    document.querySelector('[data-stat="reports"]').textContent = fmt(state.ledger.filter((l) => l.kind === "report").length);
    document.querySelector('[data-stat="cleanups"]').textContent = fmt(cleanups().length);
    document.querySelector('[data-stat="earned"]').textContent = fmt(earned);
    renderRewards();
    renderCertSummary();

    const ul = document.getElementById("ledger");
    if (!state.ledger.length) {
      ul.innerHTML = `<li class="ledger-empty" style="display:block;border:0">${t("ledger_empty")}</li>`;
      return;
    }
    ul.innerHTML = state.ledger
      .map((l) => {
        const pos = l.amount > 0;
        const icon = l.kind === "reward" ? icons.gift : l.kind === "gift" ? icons.gift : pos ? icons.plus : icons.minus;
        const sub = l.kind === "reward" && l.code ? t("reward_sub", { code: l.code, ago: ago(l.at) }) : ago(l.at);
        return `
          <li>
            <span class="l-icon ${pos ? "" : "out"}">${icon}</span>
            <div class="l-text"><b>${esc(ledgerLabel(l))}</b><span>${esc(sub)}</span></div>
            <span class="l-amt ${pos ? "pos" : ""}">${pos ? "+" : "−"}${esc(pts(Math.abs(l.amount)))}</span>
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
      document.getElementById("gift-form").hidden = redeemTab !== "gift";
      document.getElementById("cert-form").hidden = redeemTab !== "cert";
    })
  );

  document.querySelectorAll("[data-quick]").forEach((wrap) =>
    wrap.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      document.getElementById(wrap.dataset.quick).value = b.dataset.v === "max" ? balance() : b.dataset.v;
    })
  );

  document.getElementById("gift-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const err = document.getElementById("gift-error");
    const to = document.getElementById("g-to").value.trim();
    const amt = parseInt(document.getElementById("g-amount").value, 10) || 0;
    if (!to) return (err.textContent = t("err_to"));
    if (amt < 1) return (err.textContent = t("err_amount"));
    if (amt > balance()) return (err.textContent = t("err_balance"));
    err.textContent = "";
    addLedger(-amt, "gift", { to });
    save();
    e.target.reset();
    renderWallet();
    toast(t("toast_gift", { n: amt, to }));
  });

  /* ---------------- Certificate ---------------- */


  const certName = document.getElementById("cert-name");
  certName.value = state.profile.name || "";
  certName.addEventListener("change", () => { state.profile.name = certName.value.trim(); save(); });

  function renderCertSummary() {
    const list = cleanups();
    const box = document.getElementById("cert-summary");
    document.getElementById("cert-open").disabled = !list.length;
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
    const list = cleanups().sort((a, b) => a.cleanedAt - b.cleanedAt);
    if (!state.profile.certId) { state.profile.certId = code(); save(); }
    const first = dateFmt(list[0].cleanedAt), last = dateFmt(list[list.length - 1].cleanedAt);
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
            <div><span>${esc(t("cert_no"))}</span><b class="mono">${esc(state.profile.certId)}</b></div>
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

  let certOpen = false;
  document.getElementById("cert-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const err = document.getElementById("cert-error");
    const name = certName.value.trim();
    if (!cleanups().length) return (err.textContent = t("cert_locked"));
    if (!name) return (err.textContent = t("err_cert_name"));
    err.textContent = "";
    state.profile.name = name;
    save();
    certOpen = true;
    openCertificate(name);
  });

  /* ---------------- Language change ---------------- */

  document.addEventListener("langchange", () => {
    renderBalance();
    renderStatic();
    renderReportShot();
    if (!cam.el.hidden) camRender();
    ["report-error", "gift-error", "cert-error"].forEach((id) => (document.getElementById(id).textContent = ""));
    const view = currentView();
    if (view === "spots") renderSpots();
    if (view === "wallet") renderWallet();
    if (openSpotId && !modal.hidden) openSpot(openSpotId);
    if (certOpen && !modal.hidden) openCertificate(state.profile.name);
  });

  /* ---------------- Init ---------------- */

  renderBalance();
  renderStatic();
  route();
})();
