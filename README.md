# Deal Analyzer

Underwriting app for rental property investments: search an address, run the
numbers, and simulate cash flow under a **HELOC-funded down payment + DSCR loan**
structure.

## What it does

- **Map** (on the analyzer) — the subject property plus surrounding **active
  listings**, toggleable between **For sale** (flip/resale comps: price,
  $/sqft, days on market) and **For rent** (long-term rental comps: rent,
  rent/sqft). Radius 0.5–3 mi, median summary bar, and one-click
  "use as rent" from any rental comp or the median. Geocoding falls back to
  OpenStreetMap Nominatim, so the map works even without a RentCast key
  (surrounding listings do need the key).
- **Analyzer** (`/`) — look up an address (RentCast) or enter listing numbers
  manually. Computes the full underwriting live:
  - P&I on the DSCR leg (default 75% LTV, 6.50%, 30yr)
  - Property taxes at the **SC 6% investment assessment ratio** — with a warning
    when the listing shows the 4% owner-occupied figure
  - PITIA and **DSCR** with PASS / MARGINAL / FAIL verdict against the lender floor
  - HELOC draw (down payment + closing + rehab) and its interest-only payment
  - Monthly carry before and after vacancy/maintenance reserves
  - GRM, cap rate, all-in basis, NOI, break-even rents and max price
  - Sensitivity: what-if sliders (rent / rate / price) and sweep tables showing
    where DSCR crosses the floor
- **Deals** (`/deals`) — saved deals ranked by DSCR, carry, cap rate, or basis,
  with pipeline status (analyzing → offer → under contract → owned / passed)
- **Compare** (`/compare`) — 2–4 deals side-by-side, best value per metric starred
- **Settings** (`/settings`) — your financing profile (rates, LTV, DSCR floor,
  tax ratio/millage, reserves). Saved deals snapshot the profile they were
  underwritten with.

## Model notes (intentional behavior)

- DSCR is computed on the **PITIA of the DSCR loan only**. The HELOC payment
  never enters the lender's ratio, but it does count in your real monthly carry.
- Rehab budget rides the HELOC and the all-in basis — never DSCR.
- Rent inputs should come from market evidence (a pulled rental listing is a
  ceiling, not a floor); AVM estimates are prefills, not truth.

## Setup

```bash
npm install
cp .env.example .env.local   # optional: add your RentCast API key
npm run dev                  # http://localhost:3000
```

Without a RentCast key the app runs fully in manual-entry mode. With a key,
address lookups prefill price/rent/HOA/taxes; responses are cached in SQLite for
30 days to protect the free tier (50 requests/month; one lookup = up to 3
requests).

Data lives in `data/app.db` (SQLite, auto-created, gitignored).

## Use it from your phone

The app is mobile-optimized (sticky DSCR/carry bar on the analyzer, card view
for deals, swipeable comparison table, touch-friendly map). To open it on your
phone while it runs on your computer:

```bash
npm run dev:lan        # or: npm run build && npm run start:lan
```

Then find your computer's local IP (macOS: `ipconfig getifaddr en0`,
Windows: `ipconfig`) and open `http://<that-ip>:3000` on your phone —
same Wi-Fi network required. Your deals live in the SQLite file on the
computer, so phone and desktop see the same data.

For access from anywhere (not just home Wi-Fi), the SQLite database needs to
move to a hosted DB (e.g. Turso — same Drizzle schema) before deploying to
Vercel; the code is structured so that's a contained swap.

## Tests

```bash
npm test
```

The underwriting engine is validated against hand-checked reference deals
(a $420K Mt Pleasant condo that fails DSCR at 0.84, and a $340K + $20K rehab
deal that clears at 1.02).
