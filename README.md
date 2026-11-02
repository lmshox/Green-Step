# Yashil Qadam

Report polluted places, clean them up, and get rewarded.

Yashil Qadam ("Green Step" in Uzbek) is a website where anyone can:

1. **Report** a polluted spot: upload a photo, add the location and estimate how much waste is there (+10 pts).
2. **Clean it up** (optional): claim a spot, then upload an "after" photo when it's done (+50 / +120 / +250 pts depending on size).
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
