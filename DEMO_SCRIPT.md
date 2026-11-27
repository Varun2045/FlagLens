# FlagLens — 2-Minute Demo Video Script

**Goal:** Show the problem, the self-hosted Flagsmith connection, and every killer feature in under 2 minutes 30 seconds with zero fluff.

## Setup Before Recording (Split Screen)
- **Left half of screen:** VS Code Extension Development Host (opened via `F5`) with `demo-app/app.js` open and the **FlagLens** Activity Bar sidebar visible.
- **Right half of screen:** Browser showing `http://localhost:3000` (**ToggleShop** demo app).
- **Running in background:** Self-hosted Flagsmith (`docker compose up -d` or `npm run mock-flagsmith`) on `http://localhost:8000` and `npm run demo-app` on `http://localhost:3000`.

---

## Shot-by-Shot Script (~2:15)

### 0:00 – 0:20 | The Problem & Intro
> "Hi! I'm building **FlagLens** for Track 03 — a VS Code extension for **self-hosted open-source Flagsmith**. Whenever developers use feature flags, we constantly alt-tab to the browser just to check if a flag is ON in dev or prod, or whether we spelled the flag name right. FlagLens brings your self-hosted Flagsmith right inside VS Code."

### 0:20 – 0:50 | Inline Live Badges & 1-Click Hover Toggle
- Point to `demo-app/app.js` in VS Code:
  - `new_checkout` shows `● ON [dev] | ○ OFF [prod]`
  - `pricing_ab_test` shows `🧪 ON · 50% / 50% Split [dev]`
  - `dark_mode_neon` shows `○ OFF [dev] | ○ OFF [prod]`
- Hover over `'dark_mode_neon'` → show the rich cross-environment table (Dev / Staging / Prod).
- Click **`Toggle in Development`** right inside the hover popup!
- **Watch the right half of the screen:** ToggleShop immediately flips into Neon Dark Mode!
- Flip `new_checkout` OFF from the sidebar → watch ToggleShop switch from *1-Click Express Checkout* to *Classic 4-Step Checkout*.

### 0:50 – 1:25 | Ghost Flag (Typo) & Stale Flag Audit
- Scroll to line 97: `flagsmith.hasFeature('new_chekout')` — yellow squiggly underline + `⚠ Ghost Flag — Did you mean "new_checkout"?`.
- Press **`Ctrl+.`** → click **`FlagLens: Replace with "new_checkout"`**. The warning disappears and turns into a live green `● ON` badge!
- Point to the **Flag Health & Audit** sidebar panel: show `legacy_holiday_sale_2024` flagged as **Stale / Unused (0 references in workspace)** so teams can clean up flag debt.

### 1:25 – 1:55 | 1-Click "Wrap Selection in Flagsmith Flag"
- Highlight 3 lines of code in `app.js` → Right-click → **`FlagLens: Wrap Selection in Flagsmith Feature Flag`**.
- Type a new flag name (e.g., `vip_discount_badge`) and press Enter.
- Show that FlagLens **both** wrapped the code in `if (flagsmith.hasFeature('vip_discount_badge')) { ... }` **and** created `vip_discount_badge` in your self-hosted Flagsmith automatically—immediately showing the live `● ON` badge and appearing in the sidebar!

### 1:55 – 2:15 | Easy Reuse & Closing
- Mention the repo includes:
  - Official self-hosted Flagsmith `docker-compose.yml` + `seed.mjs`
  - Pre-packaged `flaglens-1.0.0.vsix` (1-command install)
  - Full automated test suite (`npm test`)
> "Thanks for watching—and happy toggling!"
