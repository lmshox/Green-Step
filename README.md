# Green Step

Report polluted places, clean them up, and get rewarded.

Green Step is a website where anyone can:

1. **Report** a polluted spot: upload a photo, add the location and estimate how much waste is there (+10 pts).
2. **Clean it up** (optional): claim a spot, then upload an "after" photo when it's done (+50 / +120 / +250 pts depending on size).
3. **Redeem** points: cash out (1,000 pts = $5.00, minimum 1,000) or gift points to someone else.

## Pages

| File | What it is |
| --- | --- |
| `index.html` | Landing page |
| `app.html` | The app: Spots, Report and Wallet tabs |
| `css/styles.css` | Shared design system and landing styles |
| `css/app.css` | App styles |
| `js/site.js` | Header, mobile menu, scroll reveal and before/after slider |
| `js/app.js` | App logic: reports, cleanups, points, cash out and gifts |

## Run it locally

It's a plain static site with no build step. Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8000
```

Then go to http://localhost:8000.

## Current limitations (prototype)

- Data (spots, photos, points) is stored in the browser's `localStorage`, so each visitor only sees their own spots.
- Cash-outs and gifts are recorded in the wallet, but **no real money is sent**.
- Cleanups are not reviewed yet; points are added straight away.

Making it a real product needs a backend with user accounts, a shared database and photo storage, a moderation/verification step, and a payout provider (e.g. PayPal Payouts or Stripe Connect).
