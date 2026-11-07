# Yashil Qadam

Report polluted places, clean them up, and get rewarded.

Yashil Qadam ("Green Step" in Uzbek) is a website where anyone can:

1. **Report** a polluted spot: take a live photo with the in-app camera (GPS and time are recorded), name the place and estimate how much waste is there (+10 pts).
2. **Clean it up** (optional): claim a spot, then take an "after" photo at the same place when it's done (+50 / +120 / +250 pts depending on size).
3. **Get rewarded**: swap points for gifts from partners (a coffee, an eco-bag, a tree planted in your name…), or gift points to someone else.
4. **Get a volunteer certificate**: after the first verified cleanup, download a certificate with your name, number of cleanups, volunteer hours and a certificate number (print or save as PDF).

Points can't be exchanged for money.

## Pages

| File | What it is |
| --- | --- |
| `index.html` | Landing page |
| `app.html` | The app: Spots, Report and Rewards tabs |
| `garden.html` | Nature corner (test, moderators only): a calm 3D meadow with weather, music and nature sounds |
| `css/styles.css` | Shared design system and landing styles |
| `css/app.css` | App styles |
| `js/site.js` | Header, mobile menu, scroll reveal and before/after slider |
| `js/story.js` | Hero scroll story, painted on a canvas: a procedurally grown tree, landscape, grass and realistic rubbish; scroll plays Fix → Clean → Verify → Reward |
| `js/app.js` | App screens: spots, report form, camera, rewards, gift codes, certificate, moderation |
| `js/backend.js` | Firebase connection and Google sign-in |
| `js/yq-data.js` | Every database write (reports, cleanups, points, gifts, rewards), shared with the tests |
| `js/firebase-config.js` | Public Firebase project identifiers |
| `js/vendor/firebase.js` | The Firebase SDK, bundled so the site doesn't depend on another CDN |
| `sw.js`, `manifest.webmanifest` | Offline support and "add to home screen" (installable web app) |
| `firestore.rules` | Security rules: who may write what, and the fair-play checks |
| `tests/` | Automated security-rules tests (run against the Firebase emulator) |
| `js/i18n.js` | Translations (Uzbek, Russian, English) and the language switcher |
| `js/garden.js`, `js/garden-scene.js`, `js/garden-audio.js` | Nature corner: moderator check, the 3D meadow (three.js in `js/vendor/`), and the music and nature sounds, all generated in the browser |

## Backend (Firebase)

The app uses **Firebase** on the free Spark plan: Google sign-in and a Firestore database. Photos are compressed in the browser and stored in Firestore (no paid Cloud Storage needed).

- Anyone can browse spots. Reporting, cleaning, rewards and gifts need a Google sign-in.
- Every change to points is one atomic write that records the event, a ledger entry and the user's totals; `firestore.rules` checks that all three agree, so points can't be invented from the browser.

### Fair play, enforced by the server

| Rule | Where |
| --- | --- |
| Photos only from the live in-page camera, with GPS and time stamped in | browser |
| "After" photo must be within ~100 m of the spot | browser + rules |
| Report (+10) and cleanup (+50/120/250) points are **held for 7 days** before they can be spent | rules |
| A moderator can reject a cleanup; rejected points are never released | rules |
| Cleaning **your own** report only counts after 2 confirmations from others or 3 days | rules |
| At most **3 cleanups per day** per person | rules |
| Balances can never go below zero; reward prices are fixed | rules |
| Gifts are one-time codes; a code can't be reused or redeemed by its sender | rules |

### Offline and installable

- The site can be added to a phone's home screen and opens like an app (`manifest.webmanifest`, icons in `assets/`).
- `sw.js` keeps a copy of the site's files, so it opens without internet (network first, saved copy as fallback, so updates show up immediately).
- Firestore keeps a local copy of the data. Reports, claims and cleanups made offline are saved on the device and sent automatically when the connection returns; the server's rules still check them then. Signing in for the first time and redeeming a gift code need internet.

### Publishing the security rules

Firebase console → **Firestore** → **Rules** → paste the contents of `firestore.rules` → **Publish**. Do this again whenever `firestore.rules` changes.

### Adding a moderator

1. The person signs in on the site once.
2. Firebase console → **Authentication** → **Users** → copy their **User UID**.
3. Firebase console → **Firestore** → **Start collection** `admins` → **Document ID** = that UID → add any field (e.g. `note` = `owner`) → **Save**.
4. They reload the site and see **Approve / Reject** on cleaned spots.

### Nature corner (test)

`garden.html` is a calm 3D meadow: look around 360°, change the weather (clear, cloudy, rain, storm), the time (day, sunset, night) and the wind, with soft music and nature sounds (wind, grasshoppers, crickets, birds, an owl, rain, thunder). Flowers grow with the number of verified cleanups, and a user's own tree appears after their first cleanup.

While it's being tested, the scene loads only for moderators: they find it in the account menu in the app. Everyone else sees a "moderators only" message, and the 3D files aren't downloaded. The page isn't linked publicly and asks search engines not to index it.

### Running the tests

Needs Node.js and Java 11+.

```bash
cd tests
npm install
npm test
```

This starts the Firestore emulator and runs 38 checks: honest actions must succeed and cheating attempts (inventing points, inflated rewards, cleaning from far away, early releases, reused gift codes and more) must be refused. You can also open `app.html?emulator` while running `firebase emulators:start` to try the whole app locally with test accounts.

## Languages

The site is available in **Uzbek (default)**, **Russian** and **English**. Visitors switch language with the globe menu in the header, and the choice is remembered. You can also link straight to a language with `?lang=ru` or `?lang=en`.

- The HTML files are written in Uzbek. Every translatable element has a `data-i18n="key"` attribute.
- `js/i18n.js` holds the Russian and English text for those keys (`PAGE`), and the messages created by the app in all three languages (`MSG`).
- To change wording, edit the Uzbek text in the HTML and the matching key in `js/i18n.js`.

## Run it locally

It's a plain static site with no build step. Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8000
```

Then go to http://localhost:8000.

## Current limitations

- The rewards in `js/app.js` (`REWARDS`) are examples until real partners are signed up. Redeeming gives a code, but no partner checks it yet.
- Certificates are marked "Sample · preview version" until verification by partners is in place.
- Volunteer hours are estimated from the cleanup size (small 0.5 h, medium 1.5 h, large 3 h).
- Sign-in is Google only for now. Phone-number (SMS) sign-in can be added later.
- Firestore's free tier covers a pilot comfortably (1 GiB storage, 50,000 reads and 20,000 writes per day); each photo takes about 100–300 KB.
