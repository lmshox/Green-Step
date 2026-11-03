// Yashil Qadam — database operations.
//
// Every action that changes points is a single atomic batch that writes the
// event (spot / gift), a ledger entry describing the points, and the user's
// running totals. firestore.rules checks that these three always agree.
//
// The Firestore functions are passed in (`api`), so the same code runs in the
// browser (bundled SDK) and in the automated rules tests (npm SDK).

export const REPORT_POINTS = 10;
export const SIZE_POINTS = { small: 50, medium: 120, large: 250 };
export const SIZE_HOURS = { small: 0.5, medium: 1.5, large: 3 };
export const REWARD_COSTS = { coffee: 200, bag: 300, tree: 500, bottle: 600, cinema: 800 };
export const HOLD_DAYS = 7;
export const OWN_REPORT_WAIT_DAYS = 3;
export const CONFIRMS_NEEDED = 2;
export const DAILY_CLEANUPS = 3;
export const MAX_DISTANCE = 100;

const DAY = 86400000;

export function makeData(api, db, opts = {}) {
  const { doc, collection, getDoc, writeBatch, serverTimestamp, increment, Timestamp } = api;
  // How a batch is sent; the browser swaps this for an offline-friendly version.
  const send = opts.commit || ((b) => b.commit());

  const userRef = (uid) => doc(db, "users", uid);
  const entryRef = (uid, eid) => doc(db, "users", uid, "ledger", eid);
  const spotRef = (id) => doc(db, "spots", id);

  // Total change + "this is the entry that explains it".
  const totals = (eid, balanceDelta, heldDelta, extra = {}) => ({
    balance: increment(balanceDelta),
    held: increment(heldDelta),
    lastEntry: eid,
    ...extra,
  });

  function randomCode(n = 10) {
    const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const buf = new Uint32Array(n);
    globalThis.crypto.getRandomValues(buf);
    return Array.from(buf, (v) => abc[v % abc.length]).join("");
  }

  return {
    randomCode,

    /** Create the user's profile on first sign-in. */
    async ensureUser(uid, name, photo) {
      const ref = userRef(uid);
      const snap = await getDoc(ref);
      if (snap.exists()) return snap.data();
      const data = {
        name: (name || "Volunteer").slice(0, 80), photo: photo || null, createdAt: serverTimestamp(),
        balance: 0, held: 0, lastEntry: null, dayStart: null, cleanupsToday: 0, certName: null, certId: null,
      };
      const b = writeBatch(db);
      b.set(ref, data);
      await send(b);
      return data;
    },

    async updateProfile(uid, fields) {
      const b = writeBatch(db);
      b.update(userRef(uid), fields);
      await send(b);
    },

    /** Report a spot: spot + full photo + held points, in one write. */
    async reportSpot(uid, name, s, photo) {
      const ref = doc(collection(db, "spots"));
      const id = ref.id;
      const eid = "report_" + id;
      const claim = !!s.claim && !s.hazard;
      const b = writeBatch(db);
      b.set(ref, {
        uid, authorName: name.slice(0, 80), title: s.title, place: s.place, size: s.size, note: s.note || "",
        hazard: !!s.hazard, lat: s.lat, lng: s.lng, acc: s.acc, thumb: s.thumb,
        status: claim ? "claimed" : "open",
        claimedBy: claim ? uid : null, claimedName: claim ? name.slice(0, 80) : null, claimedAt: claim ? serverTimestamp() : null,
        confirms: 0, review: "pending", createdAt: serverTimestamp(),
      });
      b.set(doc(db, "spotPhotos", id), { uid, data: photo });
      b.set(entryRef(uid, eid), { kind: "report", spotId: id, title: s.title, balanceDelta: 0, heldDelta: REPORT_POINTS, at: serverTimestamp() });
      b.update(userRef(uid), totals(eid, 0, REPORT_POINTS));
      await send(b);
      return id;
    },

    async claimSpot(uid, name, id) {
      const b = writeBatch(db);
      b.update(spotRef(id), { status: "claimed", claimedBy: uid, claimedName: name.slice(0, 80), claimedAt: serverTimestamp() });
      await send(b);
    },

    async unclaimSpot(id) {
      const b = writeBatch(db);
      b.update(spotRef(id), { status: "open", claimedBy: null, claimedName: null, claimedAt: null });
      await send(b);
    },

    /** "I saw it too": a second person confirms the spot is real. */
    async confirmSpot(uid, id) {
      const b = writeBatch(db);
      b.set(doc(db, "spots", id, "confirms", uid), { at: serverTimestamp() });
      b.update(spotRef(id), { confirms: increment(1) });
      await send(b);
    },

    async hasConfirmed(uid, id) {
      return (await getDoc(doc(db, "spots", id, "confirms", uid))).exists();
    },

    /** Mark a claimed spot as cleaned, with the "after" photo. Points are held for 7 days. */
    async cleanSpot(uid, name, spot, after, user) {
      const id = spot.id;
      const eid = "clean_" + id;
      const pts = SIZE_POINTS[spot.size];
      const now = new Date();
      const today = Timestamp.fromMillis(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const sameDay = user && user.dayStart && user.dayStart.toMillis() === today.toMillis();
      const b = writeBatch(db);
      b.update(spotRef(id), {
        status: "cleaned", cleanedBy: uid, cleanedName: name.slice(0, 80), cleanedAt: serverTimestamp(),
        afterLat: after.lat, afterLng: after.lng, afterAcc: after.acc, afterThumb: after.thumb,
      });
      b.set(doc(db, "spotPhotos", id + "_after"), { uid, data: after.photo });
      b.set(entryRef(uid, eid), { kind: "cleanup", spotId: id, title: spot.title, balanceDelta: 0, heldDelta: pts, at: serverTimestamp() });
      b.update(userRef(uid), totals(eid, 0, pts, { dayStart: today, cleanupsToday: sameDay ? (user.cleanupsToday || 0) + 1 : 1 }));
      await send(b);
    },

    /** Move matured held points (7+ days old, not rejected) to the usable balance. */
    async releaseDue(uid, entries) {
      const done = new Set(entries.filter((e) => e.kind === "release").map((e) => e.source + "_" + e.spotId));
      const due = entries.filter((e) =>
        (e.kind === "report" || e.kind === "cleanup") && e.at &&
        e.at.toMillis() + HOLD_DAYS * DAY <= Date.now() &&
        !done.has((e.kind === "report" ? "report" : "clean") + "_" + e.spotId));
      let released = 0;
      for (const e of due) {
        const source = e.kind === "report" ? "report" : "clean";
        const s = await getDoc(spotRef(e.spotId));
        if (!s.exists() || s.data().review === "rejected") continue;
        const eid = `release_${source}_${e.spotId}`;
        const b = writeBatch(db);
        b.set(entryRef(uid, eid), { kind: "release", source, spotId: e.spotId, title: e.title || "", balanceDelta: e.heldDelta, heldDelta: -e.heldDelta, at: serverTimestamp() });
        b.update(userRef(uid), totals(eid, e.heldDelta, -e.heldDelta));
        try { await send(b); released += e.heldDelta; } catch (err) { /* not due yet by server clock; try later */ }
      }
      return released;
    },

    async redeemReward(uid, reward) {
      const cost = REWARD_COSTS[reward];
      const code = "YQ-" + randomCode(6);
      const ref = doc(collection(db, "users", uid, "ledger"));
      const b = writeBatch(db);
      b.set(ref, { kind: "reward", reward, code, balanceDelta: -cost, heldDelta: 0, at: serverTimestamp() });
      b.update(userRef(uid), totals(ref.id, -cost, 0));
      await send(b);
      return code;
    },

    /** Create a one-time gift code worth `amount` points. */
    async sendGift(uid, name, amount, message) {
      const code = randomCode(10);
      const eid = "giftout_" + code;
      const b = writeBatch(db);
      b.set(doc(db, "gifts", code), { from: uid, fromName: name.slice(0, 80), amount, message: (message || "").slice(0, 200), claimed: false, at: serverTimestamp() });
      b.set(entryRef(uid, eid), { kind: "gift_out", code, balanceDelta: -amount, heldDelta: 0, at: serverTimestamp() });
      b.update(userRef(uid), totals(eid, -amount, 0));
      await send(b);
      return code;
    },

    /** Redeem someone else's gift code. Returns the gift. */
    async claimGift(uid, code) {
      code = code.trim().toUpperCase();
      const gref = doc(db, "gifts", code);
      const g = await getDoc(gref);
      if (!g.exists()) throw Object.assign(new Error("gift-not-found"), { code: "gift-not-found" });
      const gift = g.data();
      if (gift.claimed) throw Object.assign(new Error("gift-claimed"), { code: "gift-claimed" });
      if (gift.from === uid) throw Object.assign(new Error("gift-own"), { code: "gift-own" });
      const eid = "giftin_" + code;
      const b = writeBatch(db);
      b.update(gref, { claimed: true, claimedBy: uid, claimedAt: serverTimestamp() });
      b.set(entryRef(uid, eid), { kind: "gift_in", code, fromName: gift.fromName || "", balanceDelta: gift.amount, heldDelta: 0, at: serverTimestamp() });
      b.update(userRef(uid), totals(eid, gift.amount, 0));
      await send(b);
      return gift;
    },

    async moderate(adminUid, id, review) {
      const b = writeBatch(db);
      b.update(spotRef(id), { review, reviewedBy: adminUid, reviewedAt: serverTimestamp() });
      await send(b);
    },

    async isAdmin(uid) {
      try { return (await getDoc(doc(db, "admins", uid))).exists(); } catch (e) { return false; }
    },
  };
}

/** Distance in metres between two {lat, lng} points. */
export function distance(a, b) {
  const R = 6371000, r = (x) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
