// Yashil Qadam app — client-side prototype.
// Everything is stored in localStorage so the site works without a server.
// All visible text comes from js/i18n.js (window.I18N).
(function () {
  "use strict";

  const L = window.I18N;
  const t = L.t;

  const KEY = "yashilqadam:v1";
  const OLD_KEY = "greenstep:v1";
  const RATE = 5 / 1000; // dollars per point
  const MIN_CASHOUT = 1000;
  const REPORT_POINTS = 10;
  const SIZE_POINTS = { small: 50, medium: 120, large: 250 };
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
  const money = (p) => "$" + (p * RATE).toFixed(2);
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
    return new Date(ts).toLocaleDateString(L.lang === "en" ? "en-GB" : L.lang === "ru" ? "ru-RU" : "uz-UZ");
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
    if (l.kind === "cashout" && l.method) return t("led_cashout", { method: t("method_" + l.method), money: money(-l.amount) });
    if (l.kind === "gift" && l.to) return t("led_gift", { to: l.to });
    return l.label || ""; // entries saved by the first version
  }

  /* ---------------- Images ---------------- */

  // Resize to keep localStorage usage small.
  function readImage(file, max = 1100, quality = 0.78) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith("image/")) return reject(new Error(t("not_image")));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(t("read_fail")));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error(t("bad_format")));
        img.onload = () => {
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement("canvas");
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function bindDrop(drop, onImage) {
    const input = drop.querySelector("input[type=file]");
    const show = (data) => {
      drop.classList.add("has-image");
      drop.querySelectorAll(":scope > div, :scope > img, :scope > .replace").forEach((n) => n.remove());
      drop.insertAdjacentHTML("beforeend", `<img src="${data}" alt="${esc(t("selected_photo"))}"><span class="replace">${esc(t("change_photo"))}</span>`);
    };
    const handle = async (file) => {
      try {
        const data = await readImage(file);
        show(data);
        onImage(data);
      } catch (e) {
        toast(e.message);
      }
    };
    input.addEventListener("change", () => input.files[0] && handle(input.files[0]));
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("drag")));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) handle(f);
    });
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
    document.querySelectorAll("[data-cash]").forEach((el) => (el.textContent = money(b)));
  }

  function renderStatic() {
    document.querySelectorAll("[data-size-pts]").forEach((el) => {
      el.textContent = t("pts_to_clean", { n: SIZE_POINTS[el.dataset.sizePts] });
    });
    updateDestLabel();
    ["c-amount", "g-amount"].forEach(updateConvert);
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
    modalContent.innerHTML = html;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    modal.querySelector(".modal-close").focus();
  }
  function closeModal() {
    modal.hidden = true;
    openSpotId = null;
    document.body.style.overflow = "";
    if (lastFocus) lastFocus.focus();
  }
  modal.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeModal(); });

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
        <div class="drop" id="after-drop" style="min-height:160px;padding:24px">
          <input type="file" accept="image/*" aria-label="${esc(t("after_aria"))}">
          <div><div class="d-icon">${icons.camera}</div><strong>${esc(t("after_drop"))}</strong><br><small>${esc(t("after_hint"))}</small></div>
        </div>
        <div class="row" style="margin-top:16px">
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

    let afterData = null;
    const afterDrop = document.getElementById("after-drop");
    if (afterDrop) {
      bindDrop(afterDrop, (data) => {
        afterData = data;
        modalContent.querySelector('[data-act="complete"]').disabled = false;
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
          save();
          toast(t("toast_released"));
        } else if (act === "complete" && afterData) {
          s.status = "cleaned";
          s.afterPhoto = afterData;
          s.cleanedAt = Date.now();
          s.cleaner = "you";
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

  let reportPhoto = null;
  let reportCoords = null;
  const reportDrop = document.getElementById("report-drop");
  const reportDropEmpty = reportDrop.querySelector(".drop-empty");
  bindDrop(reportDrop, (data) => (reportPhoto = data));

  const geoBtn = document.getElementById("r-geo");
  const geoStatus = document.getElementById("r-geo-status");
  let geoState = null; // remembered so the message can be re-translated
  function renderGeo() {
    if (!geoState) { geoStatus.textContent = ""; geoStatus.className = "loc-status"; return; }
    geoStatus.className = "loc-status" + (geoState.cls ? " " + geoState.cls : "");
    geoStatus.textContent = t(geoState.key, geoState.vars);
  }
  geoBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      geoState = { key: "geo_none", cls: "err" };
      return renderGeo();
    }
    geoState = { key: "geo_finding" };
    renderGeo();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        reportCoords = { lat: +pos.coords.latitude.toFixed(5), lng: +pos.coords.longitude.toFixed(5) };
        geoState = { key: "geo_ok", cls: "ok", vars: { lat: reportCoords.lat, lng: reportCoords.lng, acc: Math.round(pos.coords.accuracy) } };
        renderGeo();
        const place = document.getElementById("r-place");
        if (!place.value.trim()) place.value = t("geo_near", reportCoords);
      },
      () => {
        geoState = { key: "geo_fail", cls: "err" };
        renderGeo();
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  document.getElementById("report-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const err = document.getElementById("report-error");
    const title = document.getElementById("r-title").value.trim();
    const place = document.getElementById("r-place").value.trim();
    const size = document.querySelector('input[name="size"]:checked').value;
    const note = document.getElementById("r-note").value.trim();
    const hazard = document.getElementById("r-hazard").checked;
    const claim = document.getElementById("r-claim").checked && !hazard;

    if (!reportPhoto) return (err.textContent = t("err_photo"));
    if (!title) return (err.textContent = t("err_title"));
    if (!place) return (err.textContent = t("err_place"));
    err.textContent = "";

    const now = Date.now();
    const spot = {
      id: uid(), title, place, size, note, hazard,
      lat: reportCoords?.lat ?? null, lng: reportCoords?.lng ?? null,
      photo: reportPhoto, afterPhoto: null,
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
    reportPhoto = null;
    reportCoords = null;
    geoState = null;
    renderGeo();
    reportDrop.classList.remove("has-image");
    reportDrop.querySelectorAll("img, .replace").forEach((n) => n.remove());
    reportDrop.appendChild(reportDropEmpty);

    renderBalance();
    toast(t("toast_reported", { n: REPORT_POINTS }));
    location.hash = "#spots";
  });

  /* ---------------- Wallet ---------------- */

  function renderWallet() {
    renderBalance();
    const earned = state.ledger.filter((l) => l.kind === "report" || l.kind === "cleanup").reduce((s, l) => s + l.amount, 0);
    document.querySelector('[data-stat="reports"]').textContent = fmt(state.ledger.filter((l) => l.kind === "report").length);
    document.querySelector('[data-stat="cleanups"]').textContent = fmt(state.ledger.filter((l) => l.kind === "cleanup").length);
    document.querySelector('[data-stat="earned"]').textContent = fmt(earned);

    const ul = document.getElementById("ledger");
    if (!state.ledger.length) {
      ul.innerHTML = `<li class="ledger-empty" style="display:block;border:0">${t("ledger_empty")}</li>`;
      return;
    }
    ul.innerHTML = state.ledger
      .map((l) => {
        const pos = l.amount > 0;
        const icon = l.kind === "cashout" ? icons.card : l.kind === "gift" ? icons.gift : pos ? icons.plus : icons.minus;
        const sub = l.kind === "cashout" ? t("payout_requested", { ago: ago(l.at) }) : ago(l.at);
        return `
          <li>
            <span class="l-icon ${pos ? "" : "out"}">${icon}</span>
            <div class="l-text"><b>${esc(ledgerLabel(l))}</b><span>${esc(sub)}</span></div>
            <span class="l-amt ${pos ? "pos" : ""}">${pos ? "+" : "−"}${esc(pts(Math.abs(l.amount)))}</span>
          </li>`;
      })
      .join("");
  }

  document.querySelectorAll("[data-redeem]").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll("[data-redeem]").forEach((x) => x.classList.toggle("active", x === b));
      document.getElementById("cash-form").hidden = b.dataset.redeem !== "cash";
      document.getElementById("gift-form").hidden = b.dataset.redeem !== "gift";
    })
  );

  function updateConvert(id) {
    const v = parseInt(document.getElementById(id).value, 10) || 0;
    document.querySelector(`[data-convert="${id}"]`).textContent = money(Math.max(0, v));
  }
  ["c-amount", "g-amount"].forEach((id) => document.getElementById(id).addEventListener("input", () => updateConvert(id)));

  document.querySelectorAll("[data-quick]").forEach((wrap) =>
    wrap.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const input = document.getElementById(wrap.dataset.quick);
      input.value = b.dataset.v === "max" ? balance() : b.dataset.v;
      updateConvert(input.id);
    })
  );

  const method = document.getElementById("c-method");
  function updateDestLabel() {
    const bank = method.value === "bank";
    document.getElementById("c-dest-label").textContent = t(bank ? "dest_bank" : "dest_paypal");
    document.getElementById("c-dest").placeholder = bank ? "8600 0000 0000 0000" : "you@example.com";
  }
  method.addEventListener("change", updateDestLabel);

  document.getElementById("cash-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const err = document.getElementById("cash-error");
    const amt = parseInt(document.getElementById("c-amount").value, 10) || 0;
    const dest = document.getElementById("c-dest").value.trim();
    if (amt < MIN_CASHOUT) return (err.textContent = t("err_min", { n: MIN_CASHOUT }));
    if (amt > balance()) return (err.textContent = t("err_balance"));
    if (!dest) return (err.textContent = t("err_dest"));
    if (method.value === "paypal" && !/^\S+@\S+\.\S+$/.test(dest)) return (err.textContent = t("err_email"));
    err.textContent = "";
    addLedger(-amt, "cashout", { method: method.value });
    save();
    e.target.reset();
    updateDestLabel();
    updateConvert("c-amount");
    renderWallet();
    toast(t("toast_payout", { money: money(amt) }));
  });

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
    updateConvert("g-amount");
    renderWallet();
    toast(t("toast_gift", { n: amt, to }));
  });

  /* ---------------- Language change ---------------- */

  document.addEventListener("langchange", () => {
    renderBalance();
    renderStatic();
    renderGeo();
    ["report-error", "cash-error", "gift-error"].forEach((id) => (document.getElementById(id).textContent = ""));
    const view = currentView();
    if (view === "spots") renderSpots();
    if (view === "wallet") renderWallet();
    if (openSpotId && !modal.hidden) openSpot(openSpotId);
  });

  /* ---------------- Init ---------------- */

  renderBalance();
  renderStatic();
  route();
})();
