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
| `css/styles.css` | Shared design system and landing styles |
| `css/app.css` | App styles |
| `js/site.js` | Header, mobile menu, scroll reveal and before/after slider |
| `js/app.js` | App logic: reports, cleanups, points, rewards, gifts and the certificate |
| `js/i18n.js` | Translations (Uzbek, Russian, English) and the language switcher |

## Fair play (anti-cheating)

The landing page has a **Fair play** section explaining the rules. What the prototype already enforces:

- **Live camera only.** There is no file picker: photos come from the camera inside the page (`getUserMedia`), so gallery uploads aren't possible.
- **GPS and time on every photo.** Taking a photo needs location permission; coordinates, accuracy and time are saved and burned into the image.
- **100 m rule.** An "after" photo taken more than 100 m from the original spot is rejected (with a small allowance for GPS accuracy).

Described on the site but needing a backend first: no instant points for cleaning your own report (2 confirmations or 3 days), a 7-day hold on new points, one account per phone number with SMS verification, a daily limit of 3 cleanups, and partner checks for large cleanups.

The camera and location only work on HTTPS (e.g. GitHub Pages) or when opened locally.

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

## Current limitations (prototype)

- Data (spots, photos, points) is stored in the browser's `localStorage`, so each visitor only sees their own spots.
- The rewards in `js/app.js` (`REWARDS`) are examples until real partners are signed up. Redeeming gives a code, but no partner checks it yet.
- Cleanups are not reviewed yet; points and certificate entries are added straight away. Certificates are marked "Sample · preview version" for this reason.
- Volunteer hours are estimated from the cleanup size (small 0.5 h, medium 1.5 h, large 3 h).

Making it a real product needs a backend with user accounts, a shared database and photo storage, a verification step (see the anti-cheating ideas: no cleanup points on your own report until others confirm it, holds before rewards, phone verification, limits), and a way for partners to check reward codes and certificate numbers.
