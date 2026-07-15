# Deal Analyzer

Underwriting app for rental property investments: search an address, run the
numbers, and simulate cash flow under a **HELOC-funded down payment + DSCR loan**
structure.

## What it does

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

## Tests

```bash
npm test
```

The underwriting engine is validated against hand-checked reference deals
(a $420K Mt Pleasant condo that fails DSCR at 0.84, and a $340K + $20K rehab
deal that clears at 1.02).
