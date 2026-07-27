# 06 — Design Direction, Interfaces by User Type & Website

**Date:** 2026-07-27 · Supersedes the visual layer of [03-app-design-and-prototype.md](03-app-design-and-prototype.md) (flows and IA there still stand). Informed by the competitor UX conventions in [05-competitive-analysis.md](05-competitive-analysis.md).

Prototypes: [`prototype-v2/`](prototype-v2/index.html) — open `index.html` in a browser, no build step.

---

## 1. Aesthetic direction

> **"Instrument at night."** FleetView is a precision instrument for watching an asset you can't see — built from the materials of the Kenyan road: reflective number plates, hazard-yellow commercial plating, sodium street light, wet tarmac. It reads as *dependable equipment*, not a consumer gadget.

**Why this and not something else.** The product's emotional core is a rider asleep at 2 a.m. while something watches the bike that pays his rent. That is not a job for a friendly pastel app or a glossy SaaS gradient. It's a job for an instrument: legible in dust and glare, honest about what it knows, calm under pressure. Every choice below serves that.

### The signature element: **the plate block**

In Kenya the registration plate *is* the vehicle's identity — verified in competitor teardown, where account usernames, device names and screen titles are all the plate. So the plate becomes our universal vehicle avatar:

```
┌──┬─────────────┐
│▐ │  KDL 904U   │   ← condensed display type on reflective white
└──┴─────────────┘
  ↑ status strip (live / parked / immobilized / offline)
```

A physical-feeling plate object with a coloured **status strip** on its left edge, carrying live state without extra chrome. It appears in list rows, map callouts, alert cards, SMS receipts, the financier's batch table, and the website hero. **Boldness is spent here; everything else stays quiet.**

This is also a migration asset: switchers already think in plates, so our lists look instantly readable to them.

### Palette — dominant dark, sodium accent

Derived from the subject's materials, not from a palette generator.

| Token | Hex | Origin | Role |
|---|---|---|---|
| `--petrol-900` | `#0F1720` | wet tarmac at night, blue-leaning | Control-room surface, deepest |
| `--petrol-800` | `#16212C` | — | Raised dark surface |
| `--petrol-700` | `#22303E` | — | Dark borders, dividers |
| `--plate` | `#F7F5F0` | reflective plate white, warm | Field/consumer surface, plate face |
| `--paper` | `#FFFFFF` | — | Cards on plate |
| `--sodium-500` | `#F2A03D` | sodium street lamp | **Brand accent, primary action** |
| `--sodium-600` | `#D8842A` | — | Pressed/hover |
| `--ink` | `#101418` | plate characters | Primary text on light |
| `--live` | `#1E9E62` | telemetry only | Moving / online status dot |
| `--alarm` | `#D33A3A` | — | Critical alerts, immobilized |
| `--hazard` | `#E8B90B` | commercial plate yellow | Warnings, grace state |
| `--slate-*` | `#6B7A88` … | — | Secondary text, offline |

**Discipline:** amber is the *brand*; green/red/yellow are *telemetry semantics only* and never used decoratively. That distinction is what keeps this from becoming the near-black-plus-acid-green cliché — green appears as an 8px dot, nothing more.

### Typography

```
Display  Big Shoulders Display  — condensed, urban, road-signage energy
Body     IBM Plex Sans          — engineered, honest, superb at 13–14px on cheap screens
Data     IBM Plex Mono          — tabular numerals: speed, coordinates, IMEI, M-Pesa refs
```

Deliberately **not** Inter/Roboto/system (no decision) and **not** Space Grotesk (now an AI tell). Big Shoulders is condensed like real plate and road-sign lettering; Plex Sans has the small-size clarity and Latin coverage Swahili needs; Plex Mono makes telemetry read as instrumentation. Numerals are tabular everywhere a value changes in place, so digits don't jitter.

### Background depth

Never flat white. Light surfaces carry a faint warm tonal wash plus a 45° hairline hatch at ~3% opacity (reflective-plate texture). Dark surfaces carry a sodium glow vignette from the top edge — as if lit by a street lamp just out of frame.

### Motion — one orchestrated moment

A single choreographed entrance: on load, the vehicle plate blocks rise and settle in sequence (60 ms stagger), and the live-status dot pulses **once**. That's it. No scattered hover wiggles. Full `prefers-reduced-motion` fallback that disables transforms and keeps opacity only.

---

## 2. Interfaces by user type

The critical insight: **these are four different products sharing one design language**, separated by *environment* and *stake*, not by screen size.

| | Environment | Stake | Surface | Density | Primary input |
|---|---|---|---|---|---|
| **Rider / Owner** | Outdoors, glare, dust, 1–2 GB phone | My asset, my livelihood | **Light** (plate) | Very low | Thumb, one-handed |
| **Installer** | Under a dashboard, kneeling, gloves | Get the job done, get paid | **Light**, task-first | Low | Thumb, camera |
| **Fleet manager** | Office desk, all day | Cost and discipline | **Dark** (control room) | High, tabular | Mouse + keyboard |
| **Financier ops** | Collections desk, all day | Someone's livelihood + a loan book | **Dark** (control room) | Highest | Mouse + keyboard |

**Light vs dark is not a style choice — it's an environment choice.** Sunlight demands maximum luminance contrast on a light field; a control room stared at for eight hours demands low-glare dark. Same tokens, two surface modes.

### 2.1 Rider / Owner app — *"one thumb, one glance, bad light"*

The whole product must answer one question in under a second: **is my vehicle where it should be?**

- **Plate blocks as the entire home screen.** No dashboard cards, no charts, no KPI tiles. Each vehicle is a plate block with status strip, place name, and time since last fix.
- **Type is large and few.** Status line at 17–20px; nothing meaningful below 14px.
- **Touch targets ≥ 52px** — real thumbs, cracked screens, sometimes gloves.
- **One primary action per screen.** The red engine-cut action is deliberately *not* on the home screen; it sits inside the vehicle, behind the two-step confirm.
- **Swahili-first for the boda variant.** Not a translation toggle buried in settings — a language chosen at onboarding that changes the default (spec doc 03 §5 strings).
- **Data-saver honesty:** a small live/paused indicator with the refresh interval, borrowed from the competitor convention of a visible countdown (it builds trust that the app is actually working).
- **Offline is a first-class state,** not an error: cached last position with an explicit "as at" age.

### 2.2 Installer app — *"hands busy, checklist-driven"*

A different product entirely: a **job**, not a vehicle.

- Single-column task list with big checkable steps; progress is the whole UI.
- **Camera-first** evidence capture (device photo, install location, relay wiring) and IMEI barcode scan rather than typing 15 digits under a dashboard.
- **The cut/restore test is a mandatory, blocking step** — the job cannot be marked complete without it, because a mis-wired relay is our biggest liability (doc 02 §8.3).
- Shows payout per job; the installer's motivation is visible.
- Must work with no signal in a basement garage and sync later.

### 2.3 Fleet manager console — *"the room, then the exception"*

- **Split view:** vehicle list (left, tabular, sortable) + live map (right). All/Online/Offline filter tabs — the convention every incumbent uses, so it needs no learning.
- Dense tabular rows with mono numerals, plate block as row identity.
- **Reports are the daily job**, not an afterthought: trip, mileage, parking, driver behaviour, with date presets and real Excel/PDF export (our verified competitor gap — theirs email a blank page).
- Groups/folders for 20+ vehicles.

### 2.4 Financier ops console — *"consequence-aware"*

The highest-stake interface we build. An agent here can stop a stranger's motorbike.

- **Portfolio first:** units, online %, arrears buckets, immobilized count.
- **The defaulters queue is the core screen** — and every row carries a **safety verdict** (Stationary ✓ / Moving ✗ / Offline —) *before* any action is possible.
- **Batch flow is deliberately two-screen:** flag → *review* → confirm. The review screen re-runs safety per unit and shows exactly what will happen to whom. Moving units are visibly blocked, not silently skipped.
- **Consequence is never hidden behind a green button.** Destructive actions use `--alarm`, require a typed reason, and show the borrower's name and the vehicle's last known place — a person, not a row ID.
- Full audit trail visible inline: who flagged, who confirmed, when, why.

> **Design ethic:** we deliberately do *not* offer geofence-triggered automatic engine cut (competitors do — see doc 05 §8). The UI must make the human decision feel weighty, because it is.

### 2.5 Recovery link — *"a stranger, in a hurry, on any phone"*

Opened by police or a recovery agent with no login, possibly on a very old browser.

- One screen: big map, plate block, last-fix age, a phone-sized directions button.
- No navigation, no branding clutter, no login prompt.
- Expiry visible ("this link expires in 71 hours") so nobody relies on a stale link.

---

## 3. Website

Competitors either hide pricing behind a quote form (Cartrack) or run a generic product page. Our site does the opposite — **transparency is the strategy**, and it's also SEO bait against a market that searches "car tracking Kenya" heavily.

**Structure:**

1. **Hero** — asymmetric, dark, the plate block breaking the grid, with the promise stated plainly and the price visible immediately.
2. **The night section** — full-bleed dark: what happens at 2 a.m. when power is cut. This is the emotional core and where the sodium palette earns itself.
3. **Published price list** — three plans, no "contact us." Renewal fee printed next to install price, because incumbents hide it.
4. **Switch offer** — "keep your tracker, change your platform" with the three-SMS migration story (doc 05 §6.1). This page is aimed squarely at competitors' unhappy customers.
5. **For financiers** — the B2B segment gets its own section with portfolio language, not consumer language.
6. **Proof** — alert latency and recovery stats, stated as measurable claims rather than adjectives.

**Anti-slop guards for the site:** no centered-card stack, no stock hero photo of a generic car, no purple gradient, real copy with real KSh numbers, one orchestrated hero reveal only.

---

## 4. Accessibility & performance floor

- **Contrast:** every text/background pair ≥ 4.5:1 (AA); status colours ≥ 3:1 against their surface, and status is *never* colour-alone — always paired with a label or icon shape (colour-blind safety on a red/green immobilized/live distinction).
- **Touch:** ≥ 48px minimum, 52px on the consumer app.
- **Motion:** `prefers-reduced-motion: reduce` disables all transforms.
- **Focus:** visible 2px sodium focus ring on every interactive element (the consoles are keyboard-driven all day).
- **Weight budget:** consumer app screens ≤ 150 KB of CSS/JS; fonts subset to Latin; no icon font — inline SVG only.
- **Both themes:** every component specified in light and dark; the theme follows user type, not user preference.

---

## 5. Assumptions

1. Fonts load from Google Fonts CDN in prototypes; production Flutter bundles them locally (subset) for the APK-size budget.
2. Map styling in the prototypes is a hand-built abstraction, not a live map SDK — real implementation uses the map provider chosen in doc 03 §8.
3. The plate block assumes the Kenyan format (3 letters, 3 digits, 1 letter); it degrades gracefully for other formats and for vehicles registered without a plate.
4. Dark theme for consoles is fixed, not user-switchable, in v1 — one less thing to test and support.
