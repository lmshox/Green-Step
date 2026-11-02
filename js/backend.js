// Yashil Qadam — connection to Firebase (sign-in + database).
//
// Add "?emulator" to the app URL to use the local Firebase emulators instead of
// the real project (used for automated testing; see tests/).

import * as fb from "./vendor/firebase.js";
import { makeData } from "./yq-data.js";

const app = fb.initializeApp(window.FIREBASE_CONFIG);
const auth = fb.getAuth(app);
const db = fb.getFirestore(app);

export const EMULATOR = new URLSearchParams(location.search).has("emulator");
if (EMULATOR) {
  fb.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  fb.connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

export const data = makeData(fb, db);
export { fb, db, auth };

/** Sign in with Google: a popup, or a full-page redirect if popups are blocked. */
export async function signIn() {
  const provider = new fb.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await fb.signInWithPopup(auth, provider);
  } catch (e) {
    if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) {
      await fb.signInWithRedirect(auth, provider);
      return;
    }
    if (e && (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request")) return;
    throw e;
  }
}

export const signOut = () => fb.signOut(auth);

// Finish a redirect sign-in if one is in progress.
fb.getRedirectResult(auth).catch(() => {});

// Test-only sign-in, available only against the local emulator.
export async function testSignIn(name) {
  if (!EMULATOR) throw new Error("test sign-in is only available with the emulator");
  sessionStorage.setItem("yq:testName", name);
  await fb.signInAnonymously(auth);
}
