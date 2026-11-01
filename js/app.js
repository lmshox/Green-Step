// Green Step app — client-side prototype.
// Everything is stored in localStorage so the site works without a server.
(function () {
  "use strict";

  const KEY = "greenstep:v1";
  const RATE = 5 / 1000; // dollars per point
  const MIN_CASHOUT = 1000;
  const REPORT_POINTS = 10;
  const SIZES = {
    small: { label: "Small", detail: "Up to 2 bags", points: 50 },
    medium: { label: "Medium", detail: "3–5 bags or bulky items", points: 120 },
    large: { label: "Large", detail: "6+ bags or a dump site", points: 250 },
  };

  /* ---------------- State ---------------- */

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
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
      toast("Storage is full. Remove some spots or use smaller photos.");
      return false;
    }
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const balance = () => state.ledger.reduce((s, l) => s + l.amount, 0);
  const money = (pts) => "$" + (pts * RATE).toFixed(2);
  const fmt = (n) => Number(n).toLocaleString("en-US");

  function ago(ts) {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    const m = Math.round(s / 60);
    if (m < 60) return m + " min ago";
    const h = Math.round(m / 60);
    if (h < 24) return h + " h ago";
    const d = Math.round(h / 24);
    if (d < 30) return d + (d === 1 ? " day ago" : " days ago");
    return new Date(ts).toLocaleDateString();
  }

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function addLedger(amount, label, kind) {
    state.ledger.unshift({ id: uid(), amount, label, kind, at: Date.now() });
  }

  /* ---------------- Images ---------------- */

  // Resize to keep localStorage usage small.
  function readImage(file, max = 1100, quality = 0.78) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith("image/")) return reject(new Error("Please choose an image file."));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Couldn't read that file."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("This image format isn't supported by your browser. Try a JPG or PNG."));
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
      drop.insertAdjacentHTML("beforeend", `<img src="${data}" alt="Selected photo"><span class="replace">Change photo</span>`);
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
  function route() {
    const name = views.includes(location.hash.slice(1)) ? location.hash.slice(1) : "spots";
    views.forEach((v) => (document.getElementById("view-" + v).hidden = v !== name));
    document.querySelectorAll("[data-tab]").forEach((a) => a.classList.toggle("active", a.dataset.tab === name));
    if (name === "spots") renderSpots();
    if (name === "wallet") renderWallet();
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  /* ---------------- Header balance ---------------- */

  function renderBalance() {
    const b = balance();
    document.querySelectorAll("[data-balance]").forEach((el) => (el.textContent = fmt(b)));
    document.querySelectorAll("[data-cash]").forEach((el) => (el.textContent = money(b)));
  }

  /* ---------------- Spots ---------------- */

  let filter = "all";
  let query = "";

  const icons = {
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10l-1 16H8L7 4Z"/><path d="M5 4h14"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><circle cx="12" cy="12.5" r="3.5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/></svg>',
  };

  const statusLabel = { open: "Needs cleanup", claimed: "Claimed", cleaned: "Cleaned" };

  function badge(spot) {
    return `<span class="badge ${spot.status}"><span>${statusLabel[spot.status]}</span></span>`;
  }

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
        const size = SIZES[s.size];
        const foot = s.hazard
          ? `<span class="badge hazard">Hazardous</span>`
          : s.status === "cleaned"
            ? `<span class="reward">+${size.points} pts earned</span>`
            : `<span class="reward">+${size.points} pts to clean</span>`;
        return `
          <button class="spot" data-id="${s.id}">
            <div class="spot-media">${media}<span class="status">${badge(s)}</span></div>
            <div class="spot-body">
              <h3>${esc(s.title)}</h3>
              <div class="spot-meta">
                <span>${icons.pin}${esc(s.place)}</span>
                <span>${icons.bag}${size.label}</span>
              </div>
              <div class="spot-foot">${foot}<span style="color:var(--muted)">${ago(s.createdAt)}</span></div>
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
          <h3>No spots reported yet</h3>
          <p>Seen litter, a dumped mattress or a bank full of plastic? Report it, and it becomes the first spot on the map.</p>
          <a href="#report" class="btn btn-primary">Report the first spot</a>
        </div>`;
    } else {
      empty.innerHTML = `
        <div class="empty">
          <div class="e-icon">${icons.search}</div>
          <h3>Nothing matches</h3>
          <p>Try a different filter or search term.</p>
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

  function openModal(html) {
    lastFocus = document.activeElement;
    modalContent.innerHTML = html;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    modal.querySelector(".modal-close").focus();
  }
  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
    if (lastFocus) lastFocus.focus();
  }
  modal.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeModal(); });

  function openSpot(id) {
    const s = state.spots.find((x) => x.id === id);
    if (!s) return;
    const size = SIZES[s.size];
    const two = s.afterPhoto;
    const media = two
      ? `<div class="detail-media two"><figure><img src="${s.photo}" alt="Before cleanup"><figcaption>Before</figcaption></figure><figure><img src="${s.afterPhoto}" alt="After cleanup"><figcaption>After</figcaption></figure></div>`
      : `<div class="detail-media"><figure><img src="${s.photo}" alt="Reported spot"></figure></div>`;

    const coords = s.lat != null
      ? `<a href="https://www.google.com/maps?q=${s.lat},${s.lng}" target="_blank" rel="noopener">Open in maps ↗</a>`
      : "Not provided";

    let actions = "";
    if (s.hazard) {
      actions = `<div class="warn"><b>Marked as hazardous.</b> This spot isn't open to volunteers. It has been flagged for local services to handle safely.</div>`;
    } else if (s.status === "open") {
      actions = `
        <div class="row">
          <button class="btn btn-green" data-act="claim">${icons.bag} I'll clean this</button>
          <span style="align-self:center;color:var(--muted);font-size:14px">Earn <b style="color:var(--green)">+${size.points} pts</b> when you finish</span>
        </div>`;
    } else if (s.status === "claimed") {
      actions = `
        <h3 style="font-size:17px">Finished cleaning?</h3>
        <p class="sub" style="color:var(--muted);font-size:14px;margin:4px 0 14px">Add a photo from the same place so the difference is clear.</p>
        <div class="drop" id="after-drop" style="min-height:160px;padding:24px">
          <input type="file" accept="image/*" aria-label="Upload after photo">
          <div><div class="d-icon">${icons.camera}</div><strong>Upload the “after” photo</strong><br><small>Same angle as the original if you can</small></div>
        </div>
        <div class="row" style="margin-top:16px">
          <button class="btn btn-green" data-act="complete" disabled>Mark as cleaned · +${size.points} pts</button>
          <button class="btn btn-ghost" data-act="unclaim">Release claim</button>
        </div>`;
    } else {
      actions = `<p style="color:var(--green-2);font-weight:500">Cleaned ${ago(s.cleanedAt)} by ${s.cleaner === "You" ? "you" : esc(s.cleaner || "a volunteer")}. Thank you.</p>`;
    }

    openModal(`
      ${media}
      <div class="detail-body">
        <div style="display:flex;gap:8px;flex-wrap:wrap">${badge(s)}${s.hazard ? '<span class="badge hazard">Hazardous</span>' : ""}</div>
        <h2 id="modal-title">${esc(s.title)}</h2>
        ${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}
        <div class="facts">
          <div>Location<b>${esc(s.place)}</b></div>
          <div>Size<b>${size.label} · ${size.detail}</b></div>
          <div>Coordinates<b>${coords}</b></div>
        </div>
        <ul class="timeline">
          <li class="done"><b>Reported</b> · ${ago(s.createdAt)}</li>
          <li class="${s.claimedAt ? "done" : ""}"><b>Claimed</b>${s.claimedAt ? " · " + ago(s.claimedAt) : ""}</li>
          <li class="${s.cleanedAt ? "done" : ""}"><b>Cleaned</b>${s.cleanedAt ? " · " + ago(s.cleanedAt) : ""}</li>
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
          toast("Spot claimed. Good luck, and stay safe.");
        } else if (act === "unclaim") {
          s.status = "open";
          s.claimedAt = null;
          save();
          toast("Claim released. The spot is open again.");
        } else if (act === "complete" && afterData) {
          s.status = "cleaned";
          s.afterPhoto = afterData;
          s.cleanedAt = Date.now();
          s.cleaner = "You";
          addLedger(size.points, "Cleanup · " + s.title, "cleanup");
          if (!save()) {
            s.status = "claimed"; s.afterPhoto = null; s.cleanedAt = null; state.ledger.shift();
            return;
          }
          renderBalance();
          toast(`+${size.points} pts. Great work cleaning this spot.`);
        }
        renderSpots();
        openSpot(s.id);
      })
    );
  }

  /* ---------------- Report form ---------------- */

  let reportPhoto = null;
  let reportCoords = null;
  bindDrop(document.getElementById("report-drop"), (data) => (reportPhoto = data));

  const geoBtn = document.getElementById("r-geo");
  const geoStatus = document.getElementById("r-geo-status");
  geoBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      geoStatus.className = "loc-status err";
      geoStatus.textContent = "Location isn't available in this browser.";
      return;
    }
    geoStatus.className = "loc-status";
    geoStatus.textContent = "Finding your location…";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        reportCoords = { lat: +pos.coords.latitude.toFixed(5), lng: +pos.coords.longitude.toFixed(5) };
        geoStatus.className = "loc-status ok";
        geoStatus.textContent = `Pinned at ${reportCoords.lat}, ${reportCoords.lng} (±${Math.round(pos.coords.accuracy)} m)`;
        const place = document.getElementById("r-place");
        if (!place.value.trim()) place.value = `Near ${reportCoords.lat}, ${reportCoords.lng}`;
      },
      () => {
        geoStatus.className = "loc-status err";
        geoStatus.textContent = "Couldn't get your location. Type the place instead.";
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

    if (!reportPhoto) return (err.textContent = "Add a photo of the spot.");
    if (!title) return (err.textContent = "Describe what's there in a few words.");
    if (!place) return (err.textContent = "Add a location so people can find it.");
    err.textContent = "";

    const now = Date.now();
    const spot = {
      id: uid(), title, place, size, note, hazard,
      lat: reportCoords?.lat ?? null, lng: reportCoords?.lng ?? null,
      photo: reportPhoto, afterPhoto: null,
      status: claim ? "claimed" : "open",
      createdAt: now, claimedAt: claim ? now : null, cleanedAt: null,
      reporter: "You",
    };
    state.spots.unshift(spot);
    addLedger(REPORT_POINTS, "Report · " + title, "report");
    if (!save()) {
      state.spots.shift();
      state.ledger.shift();
      return;
    }

    // Reset form
    e.target.reset();
    reportPhoto = null;
    reportCoords = null;
    geoStatus.textContent = "";
    const drop = document.getElementById("report-drop");
    drop.classList.remove("has-image");
    drop.querySelectorAll("img, .replace").forEach((n) => n.remove());
    drop.insertAdjacentHTML("beforeend", `<div><div class="d-icon">${icons.camera}</div><strong>Take or upload a photo</strong><br><small>Drag a file here or click to browse. JPG, PNG or HEIC.</small></div>`);

    renderBalance();
    toast(`Spot reported. +${REPORT_POINTS} pts`);
    location.hash = "#spots";
  });

  /* ---------------- Wallet ---------------- */

  function renderWallet() {
    renderBalance();
    const earned = state.ledger.filter((l) => l.amount > 0 && l.kind !== "gift-in").reduce((s, l) => s + l.amount, 0);
    document.querySelector('[data-stat="reports"]').textContent = fmt(state.ledger.filter((l) => l.kind === "report").length);
    document.querySelector('[data-stat="cleanups"]').textContent = fmt(state.ledger.filter((l) => l.kind === "cleanup").length);
    document.querySelector('[data-stat="earned"]').textContent = fmt(earned);

    const ul = document.getElementById("ledger");
    if (!state.ledger.length) {
      ul.innerHTML = `<li class="ledger-empty" style="display:block;border:0">No activity yet. <a href="#report">Report a spot</a> to earn your first points.</li>`;
      return;
    }
    ul.innerHTML = state.ledger
      .map((l) => {
        const pos = l.amount > 0;
        const icon = l.kind === "cashout" ? icons.card : l.kind === "gift" ? icons.gift : pos ? icons.plus : icons.minus;
        const sub = l.kind === "cashout" ? "Payout requested · " + ago(l.at) : ago(l.at);
        return `
          <li>
            <span class="l-icon ${pos ? "" : "out"}">${icon}</span>
            <div class="l-text"><b>${esc(l.label)}</b><span>${sub}</span></div>
            <span class="l-amt ${pos ? "pos" : ""}">${pos ? "+" : "−"}${fmt(Math.abs(l.amount))} pts</span>
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
  method.addEventListener("change", () => {
    const bank = method.value === "bank";
    document.getElementById("c-dest-label").textContent = bank ? "IBAN or account number" : "PayPal email";
    document.getElementById("c-dest").placeholder = bank ? "GB29 NWBK 6016 1331 9268 19" : "you@example.com";
  });

  document.getElementById("cash-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const err = document.getElementById("cash-error");
    const amt = parseInt(document.getElementById("c-amount").value, 10) || 0;
    const dest = document.getElementById("c-dest").value.trim();
    if (amt < MIN_CASHOUT) return (err.textContent = `The minimum cash-out is ${fmt(MIN_CASHOUT)} pts.`);
    if (amt > balance()) return (err.textContent = "You don't have enough points for that.");
    if (!dest) return (err.textContent = "Add where the money should go.");
    if (method.value === "paypal" && !/^\S+@\S+\.\S+$/.test(dest)) return (err.textContent = "Enter a valid PayPal email.");
    err.textContent = "";
    const label = `Cash out to ${method.value === "paypal" ? "PayPal" : "bank"} · ${money(amt)}`;
    addLedger(-amt, label, "cashout");
    save();
    e.target.reset();
    updateConvert("c-amount");
    renderWallet();
    toast(`Payout of ${money(amt)} requested.`);
  });

  document.getElementById("gift-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const err = document.getElementById("gift-error");
    const to = document.getElementById("g-to").value.trim();
    const amt = parseInt(document.getElementById("g-amount").value, 10) || 0;
    if (!to) return (err.textContent = "Who should receive the gift?");
    if (amt < 1) return (err.textContent = "Enter how many points to send.");
    if (amt > balance()) return (err.textContent = "You don't have enough points for that.");
    err.textContent = "";
    addLedger(-amt, "Gift to " + to, "gift");
    save();
    e.target.reset();
    updateConvert("g-amount");
    renderWallet();
    toast(`Sent ${fmt(amt)} pts to ${to}.`);
  });

  /* ---------------- Init ---------------- */

  renderBalance();
  route();
})();
