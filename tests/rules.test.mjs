// Security rules tests for Yashil Qadam.
// Run (needs Java and the Firebase emulator):  cd tests && npm install && npm test
//
// Honest users go through the app's real code (js/yq-data.js); cheaters try
// to write points or skip the fair-play rules directly.

import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import * as api from "firebase/firestore";
import { makeData, SIZE_POINTS } from "../js/yq-data.js";

const { doc, getDoc, setDoc, updateDoc, writeBatch, serverTimestamp, increment, Timestamp } = api;

const env = await initializeTestEnvironment({
  projectId: "demo-yq",
  firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 },
});

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ✓", name); }
  catch (e) { failed++; console.log("  ✗", name, "\n     ", e.message.split("\n")[0]); }
}

const PHOTO = "data:image/jpeg;base64," + "A".repeat(2000);
const THUMB = "data:image/jpeg;base64," + "B".repeat(500);
const HERE = { lat: 41.3111, lng: 69.2797, acc: 10 };
const spotInput = (over = {}) => ({ title: "Bottles by the canal", place: "Anhor", size: "medium", note: "", hazard: false, ...HERE, thumb: THUMB, ...over });
const after = (dLat = 0.0002) => ({ lat: HERE.lat + dLat, lng: HERE.lng, acc: 8, thumb: THUMB, photo: PHOTO });

const ctx = (uid) => env.authenticatedContext(uid).firestore();
const data = (uid) => makeData(api, ctx(uid));
const user = async (uid) => (await getDoc(doc(ctx(uid), "users", uid))).data();
const spot = async (uid, id) => ({ id, ...(await getDoc(doc(ctx(uid), "spots", id))).data() });

// Write directly with rules off (for setting up time-dependent situations).
const seed = (fn) => env.withSecurityRulesDisabled((c) => fn(c.firestore()));
const daysAgo = (d) => Timestamp.fromMillis(Date.now() - d * 86400000);

console.log("\nYashil Qadam — security rules\n");
await env.clearFirestore();

for (const u of ["alice", "bob", "carol", "dan", "erin", "mod"]) await data(u).ensureUser(u, u.toUpperCase(), null);
await seed((db) => setDoc(doc(db, "admins", "mod"), { note: "test moderator" }));

let s1;

console.log("Profiles");
await test("a new user starts at 0 points", async () => {
  const u = await user("alice");
  if (u.balance !== 0 || u.held !== 0) throw new Error("not zero");
});
await test("can't create a profile with points", () =>
  assertFails(setDoc(doc(ctx("zed"), "users", "zed"), { name: "Z", photo: null, createdAt: serverTimestamp(), balance: 5000, held: 0, lastEntry: null, dayStart: null, cleanupsToday: 0, certName: null, certId: null })));
await test("can't give yourself points directly", () => assertFails(updateDoc(doc(ctx("alice"), "users", "alice"), { balance: 9999 })));
await test("can't read someone else's profile", () => assertFails(getDoc(doc(ctx("bob"), "users", "alice"))));
await test("can change your own name", () => assertSucceeds(data("alice").updateProfile("alice", { name: "Alice K." })));

console.log("Reporting");
await test("report a spot → +10 held", async () => {
  s1 = await data("alice").reportSpot("alice", "Alice", spotInput(), PHOTO);
  const u = await user("alice");
  if (u.held !== 10 || u.balance !== 0) throw new Error(`held=${u.held} balance=${u.balance}`);
});
await test("anyone (even signed out) can see spots", () => assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), "spots", s1))));
await test("can't report a spot without the matching ledger entry", () =>
  assertFails(setDoc(doc(ctx("alice"), "spots", "fake1"), { uid: "alice", authorName: "A", title: "x", place: "y", size: "small", note: "", hazard: false, ...HERE, thumb: THUMB, status: "open", claimedBy: null, claimedName: null, claimedAt: null, confirms: 0, review: "pending", createdAt: serverTimestamp() })));
await test("can't report on someone else's behalf", async () => {
  const db = ctx("bob"), b = writeBatch(db);
  b.set(doc(db, "spots", "fake2"), { uid: "alice", authorName: "A", title: "x", place: "y", size: "small", note: "", hazard: false, ...HERE, thumb: THUMB, status: "open", claimedBy: null, claimedName: null, claimedAt: null, confirms: 0, review: "pending", createdAt: serverTimestamp() });
  await assertFails(b.commit());
});
await test("can't claim more report points than 10", async () => {
  const db = ctx("alice"), id = "fake3", eid = "report_" + id;
  const b = writeBatch(db);
  b.set(doc(db, "spots", id), { uid: "alice", authorName: "A", title: "x", place: "y", size: "small", note: "", hazard: false, ...HERE, thumb: THUMB, status: "open", claimedBy: null, claimedName: null, claimedAt: null, confirms: 0, review: "pending", createdAt: serverTimestamp() });
  b.set(doc(db, "users", "alice", "ledger", eid), { kind: "report", spotId: id, title: "x", balanceDelta: 0, heldDelta: 500, at: serverTimestamp() });
  b.update(doc(db, "users", "alice"), { held: increment(500), balance: increment(0), lastEntry: eid });
  await assertFails(b.commit());
});
await test("totals must match the entry (can't add extra)", async () => {
  const db = ctx("alice"), id = "fake4", eid = "report_" + id;
  const b = writeBatch(db);
  b.set(doc(db, "spots", id), { uid: "alice", authorName: "A", title: "x", place: "y", size: "small", note: "", hazard: false, ...HERE, thumb: THUMB, status: "open", claimedBy: null, claimedName: null, claimedAt: null, confirms: 0, review: "pending", createdAt: serverTimestamp() });
  b.set(doc(db, "users", "alice", "ledger", eid), { kind: "report", spotId: id, title: "x", balanceDelta: 0, heldDelta: 10, at: serverTimestamp() });
  b.update(doc(db, "users", "alice"), { held: increment(10), balance: increment(1000), lastEntry: eid });
  await assertFails(b.commit());
});

console.log("Cleaning");
await test("someone else can claim the spot", () => assertSucceeds(data("bob").claimSpot("bob", "Bob", s1)));
await test("a third person can't steal the claim", async () => assertFails(data("carol").cleanSpot("carol", "Carol", await spot("carol", s1), after(), await user("carol"))));
await test("after photo 1 km away is rejected", async () => assertFails(data("bob").cleanSpot("bob", "Bob", await spot("bob", s1), after(0.009), await user("bob"))));
await test("after photo at the spot → +120 held", async () => {
  await data("bob").cleanSpot("bob", "Bob", await spot("bob", s1), after(), await user("bob"));
  const u = await user("bob");
  if (u.held !== SIZE_POINTS.medium || u.balance !== 0) throw new Error(`held=${u.held}`);
});
await test("can't be paid twice for the same cleanup", async () => {
  const db = ctx("bob"), eid = "clean_" + s1;
  const b = writeBatch(db);
  b.set(doc(db, "users", "bob", "ledger", eid + "x"), { kind: "cleanup", spotId: s1, title: "x", balanceDelta: 0, heldDelta: 120, at: serverTimestamp() });
  b.update(doc(db, "users", "bob"), { held: increment(120), balance: increment(0), lastEntry: eid + "x" });
  await assertFails(b.commit());
});

console.log("Own reports");
let own;
await test("can claim your own report", async () => {
  own = await data("carol").reportSpot("carol", "Carol", spotInput({ size: "small", claim: true }), PHOTO);
});
await test("can't clean your own report straight away", async () => assertFails(data("carol").cleanSpot("carol", "Carol", await spot("carol", own), after(), await user("carol"))));
await test("you can't confirm your own spot", () => assertFails(data("carol").confirmSpot("carol", own)));
await test("two other people confirm it", async () => { await data("alice").confirmSpot("alice", own); await data("dan").confirmSpot("dan", own); });
await test("the same person can't confirm twice", () => assertFails(data("dan").confirmSpot("dan", own)));
await test("after 2 confirmations, cleaning your own report works", async () => assertSucceeds(data("carol").cleanSpot("carol", "Carol", await spot("carol", own), after(), await user("carol"))));
await test("own report older than 3 days can be cleaned", async () => {
  const id = await data("dan").reportSpot("dan", "Dan", spotInput({ claim: true }), PHOTO);
  await seed((db) => updateDoc(doc(db, "spots", id), { createdAt: daysAgo(4) }));
  await assertSucceeds(data("dan").cleanSpot("dan", "Dan", await spot("dan", id), after(), await user("dan")));
});

console.log("Daily limit");
await test("3 cleanups a day are fine, the 4th is refused", async () => {
  const ids = [];
  for (let i = 0; i < 4; i++) ids.push(await data("alice").reportSpot("alice", "Alice", spotInput({ size: "small" }), PHOTO));
  for (const id of ids) await data("erin").claimSpot("erin", "Erin", id);
  for (let i = 0; i < 3; i++) await data("erin").cleanSpot("erin", "Erin", await spot("erin", ids[i]), after(), await user("erin"));
  await assertFails(data("erin").cleanSpot("erin", "Erin", await spot("erin", ids[3]), after(), await user("erin")));
  const u = await user("erin");
  if (u.cleanupsToday !== 3) throw new Error("count " + u.cleanupsToday);
});

console.log("7-day hold");
await test("held points can't be released early", async () => {
  const entries = [{ kind: "cleanup", spotId: s1, title: "x", heldDelta: 120, at: Timestamp.fromMillis(Date.now() - 8 * 86400000) }];
  // The client thinks it's due, but the server clock says no.
  await data("bob").releaseDue("bob", entries);
  const u = await user("bob");
  if (u.balance !== 0) throw new Error("released early: " + u.balance);
});
await test("after 7 days, held points become usable", async () => {
  await seed((db) => updateDoc(doc(db, "users", "bob", "ledger", "clean_" + s1), { at: daysAgo(8) }));
  const entries = [{ kind: "cleanup", spotId: s1, title: "x", heldDelta: 120, at: daysAgo(8) }];
  const got = await data("bob").releaseDue("bob", entries);
  const u = await user("bob");
  if (got !== 120 || u.balance !== 120 || u.held !== 0) throw new Error(`balance=${u.balance} held=${u.held}`);
});
await test("rejected cleanups never pay out", async () => {
  const id = await data("alice").reportSpot("alice", "Alice", spotInput({ size: "large" }), PHOTO);
  await data("dan").claimSpot("dan", "Dan", id);
  await data("dan").cleanSpot("dan", "Dan", await spot("dan", id), after(), await user("dan"));
  await data("mod").moderate("mod", id, "rejected");
  await seed((db) => updateDoc(doc(db, "users", "dan", "ledger", "clean_" + id), { at: daysAgo(8) }));
  const before = (await user("dan")).balance;
  await data("dan").releaseDue("dan", [{ kind: "cleanup", spotId: id, title: "x", heldDelta: 250, at: daysAgo(8) }]);
  // force the attempt too (client skips rejected spots)
  const db = ctx("dan"), eid = "release_clean_" + id, b = writeBatch(db);
  b.set(doc(db, "users", "dan", "ledger", eid), { kind: "release", source: "clean", spotId: id, title: "x", balanceDelta: 250, heldDelta: -250, at: serverTimestamp() });
  b.update(doc(db, "users", "dan"), { balance: increment(250), held: increment(-250), lastEntry: eid });
  await assertFails(b.commit());
  if ((await user("dan")).balance !== before) throw new Error("paid out");
});
await test("only moderators can approve or reject", () => assertFails(data("alice").moderate("alice", s1, "approved")));

console.log("Rewards and gifts");
await test("can't redeem a reward without enough points", () => assertFails(data("alice").redeemReward("alice", "coffee")));
await test("can't redeem at a lower price", async () => {
  const db = ctx("bob"), ref = doc(db, "users", "bob", "ledger", "cheap"), b = writeBatch(db);
  b.set(ref, { kind: "reward", reward: "cinema", code: "YQ-X", balanceDelta: -1, heldDelta: 0, at: serverTimestamp() });
  b.update(doc(db, "users", "bob"), { balance: increment(-1), held: increment(0), lastEntry: "cheap" });
  await assertFails(b.commit());
});
let code;
await test("send a gift code", async () => {
  code = await data("bob").sendGift("bob", "Bob", 20, "thanks!");
  if ((await user("bob")).balance !== 100) throw new Error("balance not reduced");
});
await test("can't gift more than you have", () => assertFails(data("bob").sendGift("bob", "Bob", 5000, "")));
await test("can't redeem your own gift", async () => {
  try { await data("bob").claimGift("bob", code); throw new Error("allowed"); } catch (e) { if (e.message === "allowed") throw e; }
});
await test("a friend redeems the code → +20", async () => {
  await data("alice").claimGift("alice", code);
  if ((await user("alice")).balance !== 20) throw new Error("not credited");
});
await test("a code works only once", async () => {
  try { await data("dan").claimGift("dan", code); throw new Error("allowed"); } catch (e) { if (e.message === "allowed") throw e; }
});
await test("redeem a reward with enough points → code, -200", async () => {
  await seed((db) => updateDoc(doc(db, "users", "erin"), { balance: 300 }));
  const c = await data("erin").redeemReward("erin", "coffee");
  if (!/^YQ-/.test(c) || (await user("erin")).balance !== 100) throw new Error("not redeemed");
});
await test("can't list all gift codes", () => assertFails(api.getDocs(api.collection(ctx("alice"), "gifts"))));

console.log("Photos");
await test("can't upload a photo for a spot you didn't report", () => assertFails(setDoc(doc(ctx("dan"), "spotPhotos", s1 + "x"), { uid: "dan", data: PHOTO })));

console.log(`\n${passed} passed, ${failed} failed\n`);
await env.cleanup();
process.exit(failed ? 1 : 0);
