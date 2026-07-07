# 04 — Business Plan & Financials
## Kenya Vehicle & Motorbike Tracking Platform ("FleetView" — working name)

All amounts in **KSh**. Every projection states its assumptions inline. Date: July 2026.

---

## 1. Executive summary

FleetView is a GPS tracking platform for cars and motorbikes in Kenya, built on a self-hosted open-source tracking engine (Traccar) with a custom Kenya-first commercial layer: M-Pesa-native billing, jamming/power-cut alerts, a bilingual Android-light app, and a purpose-built module for asset financiers and SACCOs.

The Kenyan market already buys tracking — 100+ companies sell installs at KSh 4,500–15,000 — so we do not need to create demand. We need to (a) match the feature set customers already expect, then (b) win on the three things incumbents do badly: **billing experience** (they lose renewals to manual paybill chaos), **reliability alerts** (slow or missing power-cut/jamming notification), and **B2B financier tooling** (the volume segment: Kenya's largest motorbike financier alone has financed 500,000+ bikes, and loan contracts make trackers mandatory).

Strategy: launch retail (bodas + cars) to prove the product, then land financier/SACCO contracts where one deal is 100–5,000 units. Target: 50 units by end of year 1, 500 by year 2, 2,500 by year 3, reaching EBITDA break-even around month 22 on a startup budget under KSh 400,000.

---

## 2. Problem & opportunity

**For owners:** vehicle theft is a constant fear; incumbents' apps are heavy, English-only, and alerts arrive late or not at all. Renewals lapse silently because paying requires finding a paybill number in an old SMS.

**For financiers/SACCOs:** trackers are contractually mandatory collateral protection on every financed bike, but incumbents give financiers consumer-grade tools — no portfolio view, no batch operations, no LMS integration, immobilization by phone call to the vendor.

**Opportunity:** the boda sector supports 1.2M+ riders; financed bikes need trackers by contract with repayments running up to 24 months; the replacement/renewal market among dissatisfied incumbent customers is additional low-CAC volume ("car tracking Kenya" is a heavily searched term).

---

## 3. Market analysis & segment sizing

Market facts used below (July 2026 research): installed prices KSh 4,500–15,000; annual renewals KSh 1,500–7,500; informed buyers distrust all-in prices under ~KSh 8,000; installer labor KSh 1,000–2,500; GT06-class devices KSh 2,300–8,000, Teltonika-class KSh 8,000–18,000, anti-jamming KSh 12,000–20,000.

| Segment | Sizing logic | Serviceable annual opportunity (conservative) |
|---|---|---|
| **Financed bodas (B2B)** | 1.2M+ riders; largest financier alone 500k+ financed units; assume 150k–250k *new* financed bikes/yr, each contractually requiring a tracker | Winning 1–2 mid-size financiers/SACCOs = 2,000–10,000 units/yr. **Primary target** |
| **Individual cars (B2C)** | ~1.5M private cars; tracking attach driven by theft fear + insurance; assume 3–5 % buy/renew tracking yearly ≈ 45k–75k units/yr nationally | Capturing 0.5–1 % ≈ 300–700 units/yr |
| **Independent bodas (B2C)** | Riders who own bikes outright; price-sensitive; buy after theft events in their SACCO | 200–500 units/yr via SACCO group deals |
| **Corporate fleets / matatu SACCOs** | Delivery, logistics, PSV; longer sales cycles, higher ARPU, want reports | 5–10 fleets of 20–100 units by year 3 |
| **Insurers** | Partnership channel, not direct sales: recovery-stats reports + premium-discount schemes feed B2C volume | Channel multiplier from year 2 |

---

## 4. Competitive landscape & positioning

| Dimension | Typical incumbent (composite of the ~100 players) | FleetView |
|---|---|---|
| Install price (car) | KSh 8,500–13,500; renewal often discovered later | KSh 9,500–14,500 **with renewal price printed on the receipt** |
| Renewal | KSh 2,500–3,500/yr; manual paybill, no reminders → silent lapse | Same price band; STK Push at T-7/T-1/expiry, C2B auto-reconciliation, instant SMS receipt |
| App | Rebranded Chinese white-label, heavy, English-only | Flutter, ≤25 MB, EN/SW, data-saver, runs on 1–2 GB RAM |
| Power-cut/jamming alert | Often only visible on next app open | Push + SMS within 30 s with last-known position (critical-alert pipeline) |
| Immobilization | Phone the vendor's office / unaudited app button | Two-step in-app with speed-safety gate + full audit trail |
| Financier tooling | Consumer accounts shared across staff | Portfolio dashboard, arrears-linked flagging, batch ops with human confirmation, recovery links, LMS webhooks, per-unit volume pricing |
| Transparency | Pricing on request, haggled | Public price list (differentiator #4) |
| Feature parity items (live map, 90-day history, geofences, engine on/off & overspeed alerts, mileage/fuel reports, SMS fallback) | Yes — table stakes | Yes — full parity checklist committed in spec |

**Positioning statement:** *"The tracker that renews itself and answers to your loan book"* — consumer-trustworthy, financier-grade.

---

## 5. Product & pricing

Anchored to market tiers; all prices deliberately at or slightly above the credibility floor (~KSh 8,000 all-in) except the boda plan, which is volume-justified. Renewals published openly.

| Plan | Hardware | Install price (incl. year-1 service, airtime included) | Annual renewal | Notes |
|---|---|---|---|---|
| **Boda** | GT06-class + relay | **KSh 7,500** | **KSh 2,500** | SACCO group deals: 7,000 at 20+ |
| **Car Standard** | GT06-class (4G variant) + relay | **KSh 9,500** | **KSh 3,000** | |
| **Car Premium** | Teltonika FMB920/FMC130, jamming detection, backup battery | **KSh 14,500** | **KSh 3,500** | Anti-jamming pitch; insurer-partner tier |
| **Fleet (10+ units)** | Mixed per need | **KSh 9,000/unit** | **KSh 2,750/unit** | Dashboard seats included; reports |
| **Financier volume** | GT06-class + relay, bulk-provisioned | 100–499 units: **KSh 6,800/unit** · 500–1,999: **KSh 6,300** · 2,000+: **KSh 5,900** | **KSh 180/unit/month** platform fee (KSh 2,160/yr), min 12 months | Includes portfolio console, batch ops, webhooks, recovery links, SMS quota |

---

## 6. Unit economics

Assumptions: GT06-class landed cost KSh 3,300 (unit 2,800 + freight/duty 500); Teltonika FMB920 landed KSh 8,500; relay + wiring materials KSh 400–500; installer fee KSh 1,500 (boda) / 2,000 (car, market range 1,000–2,500); SIM data 50–80 MB/mo ≈ KSh 50–75/mo (KSh 600–900/yr incl. SMS headroom); infra (VPS, backups, SMS gateway fixed fees) allocated KSh 120/unit/yr at ≥500 units; support allocation KSh 300–400/unit/yr; warranty reserve 5 % of device cost/yr from year 2.

### 6.1 Budget tier (Boda plan: 7,500 install / 2,500 renewal)

| Line | Year 1 (KSh) | Renewal year (KSh) |
|---|---|---|
| Revenue | 7,500 | 2,500 |
| Device (landed) | −3,300 | — |
| Relay + materials | −400 | — |
| Installer fee | −1,500 | — |
| SIM data + SMS | −700 | −700 |
| Infra allocation | −120 | −120 |
| Support allocation | −300 | −300 |
| Warranty reserve | — | −165 |
| **Gross profit** | **1,180** | **1,215** |
| **Gross margin** | **16 %** | **49 %** |

### 6.2 Premium tier (Car Premium: 14,500 install / 3,500 renewal)

| Line | Year 1 (KSh) | Renewal year (KSh) |
|---|---|---|
| Revenue | 14,500 | 3,500 |
| Device (landed) | −8,500 | — |
| Relay + materials | −500 | — |
| Installer fee | −2,000 | — |
| SIM data + SMS | −900 | −900 |
| Infra allocation | −120 | −120 |
| Support allocation | −400 | −400 |
| Warranty reserve | — | −425 |
| **Gross profit** | **2,080** | **1,655** |
| **Gross margin** | **14 %** | **47 %** |

### 6.3 Financier unit (6,300 install / 180 per month)

Year 1: revenue 6,300 + 2,160 fees = 8,460; costs 5,200 install COGS + 1,020 servicing = 6,220 → **GP 2,240 (26 %)**. Steady state: 2,160 vs 1,185 → **GP 975 (45 %)** — plus zero marketing CAC after the contract is signed.

**Takeaway:** installs roughly cover their costs and buy an annuity; **renewals and financier monthly fees are the profit engine.** This is exactly why the M-Pesa renewal machine (STK + auto-reconciliation) is the core differentiator — every percentage point of renewal-collection rate flows straight to margin.

---

## 7. Startup budget → paying pilot

Target: everything to reach ~15 paying pilot units, well under KSh 500,000, excluding founder labor.

| Item | KSh |
|---|---|
| 10 × GT06-class pilot devices (landed) | 33,000 |
| 5 × Teltonika FMB920 (landed) | 42,500 |
| Relays, wiring, fuses, connectors | 6,000 |
| 15 SIMs + 6 months data bundles | 9,000 |
| Installer fees (15 pilot installs) | 22,500 |
| VPS 12 months + domain + off-site backup storage | 30,000 |
| Company registration (BRS, limited company) | 15,000 |
| ODPC data-controller registration + basic legal (privacy notice, consent forms, financier contract template) | 40,000 |
| M-Pesa PayBill setup (bank/aggregator route) | 5,000 |
| Marketing float (SACCO demo days, flyers, Google Ads test, signage) | 100,000 |
| Contingency (~18 %) | 60,000 |
| **Total** | **363,000** |

---

## 8. Three-year projection

**Volume assumptions:** cumulative installed base 50 → 500 → 2,500 (installs/yr: 50, 450, 2,000). Mix: Y1 all retail (30 boda / 15 car std / 5 premium); Y2 adds first financier deal (150 retail + 300 financier units); Y3 financier-led (400 retail + 1,600 financier). Retail renewal rate 90 % (our billing machine vs. industry's silent lapse); financier fees billed monthly per active unit (new units average 6 months of fees in their first year). Prices per §5, costs per §6.

### 8.1 Revenue (KSh)

| Stream | Y1 | Y2 | Y3 |
|---|---|---|---|
| Retail installs | 440,000 | 1,320,000 | 3,520,000 |
| Financier installs | — | 2,040,000 | 10,080,000 |
| Retail renewals | — | 124,000 | 479,000 |
| Financier platform fees | — | 324,000 | 2,376,000 |
| **Total revenue** | **440,000** | **3,808,000** | **16,455,000** |

### 8.2 Costs & EBITDA (KSh)

| Line | Y1 | Y2 | Y3 |
|---|---|---|---|
| COGS — retail installs | 335,000 | 1,005,000 | 2,680,000 |
| COGS — financier installs | — | 1,560,000 | 8,320,000 |
| Servicing (renewing + financier base) | — | 212,000 | 1,369,000 |
| **Gross profit** | **105,000 (24 %)** | **1,031,000 (27 %)** | **4,086,000 (25 %)** |
| Staff (Y2: 1 ops/support; Y3: 3 incl. part-time dev) | — | 480,000 | 1,800,000 |
| Infra (VPS scaling, monitoring, tools) | 36,000 | 60,000 | 180,000 |
| Marketing & sales | 120,000 | 240,000 | 480,000 |
| Transport, office, misc | 60,000 | 220,000 | 440,000 |
| Registration & compliance | 40,000 | — | — |
| **EBITDA** | **−151,000** | **+31,000** | **+1,186,000** |

**Break-even:** monthly EBITDA turns positive around **month 20–22** (first financier contract billing steadily + Y1 retail renewals landing); cumulative cash break-even around month 26. Founder salary excluded throughout — Y1 is a side-build or savings-funded year.

### 8.3 Sensitivity (Y3 EBITDA, KSh)

| Scenario | Assumption change | Y3 EBITDA | Δ |
|---|---|---|---|
| Base | as above | +1,186,000 | — |
| Renewal churn doubles | Retail renewal 90 % → 75 % | +1,105,000 | −81,000 — painful but survivable; renewals are small in Y3 mix |
| Device failure spike | Warranty replacements 5 % → 10 % of fleet/yr | +836,000 | −350,000 — enforce supplier warranty terms, batch-test on receipt |
| Price war on financier tier | Financier install −15 % (5,900 → 5,000 at volume) | +296,000 | −890,000 — **biggest exposure**; defend with switching costs (LMS integration, audit trails) not price |
| Financier deal slips 6 months | Y3 financier units 1,600 → 1,000 | +413,000 | −773,000 — pipeline must hold ≥ 2 concurrent financier negotiations |
| SIM cost creep | Data cost +50 % | +1,010,000 | −176,000 — renegotiate M2M pooled bundles at 1,000+ SIMs |

---

## 9. Go-to-market

1. **Boda SACCO partnerships (launch wedge):** demo days at SACCO meetings; group pricing (KSh 7,000 at 20+); SACCO official as referral agent (KSh 300/install). SACCOs also aggregate trust — one recovered bike story converts a whole stage.
2. **Independent installer network:** recruit car-electronics technicians countrywide (they already exist at KSh 1,000–2,500/job); certify them (half-day training + test install), pay per job, rate them in-app. They become a distributed sales force earning install fees.
3. **Car dealers & garages:** fit-at-point-of-sale deals; garage gets KSh 500–1,000 referral per install.
4. **Financier/SACCO B2B sales (the volume engine):** direct founder-led sales from month 6; entry offer = 100-unit paid pilot with LMS webhook integration thrown in; case study + recovery stats → expand. Sales cycle assumption: 3–6 months; keep ≥ 2 deals in negotiation at all times (per sensitivity table).
5. **Insurer partnerships (year 2+):** recovery-stats and driver-behavior reports packaged for underwriters; aim for premium-discount endorsements that make Car Premium self-selling.
6. **Digital:** Google Ads on "car tracking Kenya" and variants (high, proven search volume); WhatsApp Business catalog; public price list page (transparency is both ethics and SEO bait since incumbents hide pricing).

---

## 10. Operations

- **Installation workflow:** order → device + SIM provisioned centrally (IMEI pre-registered, bundle loaded) → installer job dispatched via app → fit + relay wire + cut/restore test with engine off → photo/geotag evidence → auto-golive when device reports → customer walkthrough (5-min script, EN/SW).
- **Support SLAs:** WhatsApp/phone lines 07:00–19:00 EAT; critical (theft-in-progress, immobilize help) response < 15 min, 24/7 via on-call rota from Y2; billing/app issues same business day; device fault → installer dispatched ≤ 48 h (72 h upcountry).
- **SIM operations:** monthly bundle-expiry sweep (nightly job flags T-7); pooled M2M contract negotiation at 1,000+ SIMs; SIM-vs-device fault triage per the runbook in doc 02 §11.
- **Theft-recovery procedure:** customer reports (app SOS or hotline) → verify identity → mark vehicle *in recovery* (red pulsing marker, 10 s updates) → generate shareable live link for police/recovery agents → coordinate; engine cut only when stationary per safety policy → outcome logged → recovery stats feed insurer reports. Target: < 30 min from report to live link in agents' hands.

---

## 11. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Jamming/tampering defeats budget devices | High (it's why premium tier exists) | Customer trust | Jamming detection + instant last-known-position alert (differentiator #2); concealed installation points rotated per installer; premium tier with backup battery + anti-jam for high-value assets |
| SIM cost creep / M2M repricing | Medium | Margin (−176k Y3 per §8.3) | Pooled bundles, dual-provider capability (devices accept any APN), renewal prices reviewed annually with 90-day notice |
| Price war (esp. financier tier) | High | Biggest EBITDA exposure (§8.3) | Compete on integration lock-in (LMS webhooks, audit trails financiers need for disputes), not price; contracts with 12-month minimums |
| ODPC non-compliance | Low if handled early | Fines, B2B deal-breaker | Register before commercial launch; consent at signup + borrower consent in loan onboarding; retention policy documented; financiers will *require* this — make it a selling point |
| Device supplier risk (clone GT06s, duplicate IMEIs, bad batches) | Medium | Support cost, reputation | Sample-test every carton; supplier must provide IMEI manifest; keep 2 qualified suppliers per tier; 5–10 % warranty reserve modeled |
| Immobilization misuse/accident | Low | Liability, licence to operate | Two-step confirm + speed gate + human-only confirmation + full audit (spec §5); insurance rider on the company policy; borrower consent documented in loan contract |
| Single-VPS outage | Medium | SLA breach | Device-side buffering covers ingest gaps; 99.5 % target with documented rebuild runbook (RTO 4 h); split infra at scale |
| NTSA/KEBS scope creep (PSV/speed-governor rules) | Low for v1 | Blocks matatu segment only | Out of scope v1; monitor; treat certification as the gate to the PSV expansion, not a launch dependency |

---

## 12. KPIs

| KPI | Target Y1 | Target Y3 |
|---|---|---|
| Installed base (cumulative) | 50 | 2,500 |
| Renewal collection rate (retail) | ≥ 85 % | ≥ 90 % |
| Financier units under contract | 0 (pipeline ≥ 2) | ≥ 1,900 |
| Device online rate (daily) | ≥ 97 % | ≥ 98.5 % |
| Critical alert delivery p95 | ≤ 30 s | ≤ 30 s |
| Recovery success rate | ≥ 80 % | ≥ 90 % |
| Support: critical response | < 15 min | < 15 min |
| Gross margin (blended) | ≥ 20 % | ≥ 25 % |
| CAC (retail, blended) | ≤ KSh 1,200 | ≤ KSh 800 |

## 13. 90-day action plan

| Days | Actions |
|---|---|
| **1–15** | Register company; open bank account; start PayBill application; order 15 pilot devices + SIMs; provision VPS + Traccar per doc 02; buy domain |
| **16–30** | ODPC registration filed; recruit + certify 2 installers (Nairobi/Kisumu); install first 5 devices on friendly vehicles; validate GT06 + Teltonika end-to-end incl. supervised engine-cut test |
| **31–60** | 15 paying pilot customers (target 1 boda SACCO demo day + personal network cars); manual billing via PayBill + spreadsheet; collect testimonials + first recovery drill; begin backend build (M2 scope, doc 01 §12); price list page + WhatsApp Business live |
| **61–90** | App alpha on pilot phones; STK Push sandbox → production application; first financier/SACCO meetings booked with pilot data in hand; decide go/no-go on M2 full build against pilot retention data; publish month-3 KPI review against §12 |

## 14. Assumptions register

1. FX ≈ KSh 129/USD for imported hardware; duty/freight ≈ 15–18 % included in landed costs.
2. Landed device costs: GT06-class 3,300; FMB920 8,500 — mid-range of researched bands (GT06 2,300–8,000; Teltonika 8,000–18,000).
3. Retail renewal rate 90 % is *aspirational vs. industry* and is the product thesis (M-Pesa renewal machine); sensitivity at 75 % shown in §8.3.
4. Financier mix reaches 80 % of installs by Y3; one anchor financier deal ≥ 1,000 units assumed signed in Y2H2 — the single most important commercial assumption (slippage case in §8.3).
5. Founder labor unpaid through Y1; first hire month ~14.
6. No NTSA/KEBS certification costs in v1 (non-PSV scope).
7. Installs are billed upfront and include year-1 service; revenue recognized on install for simplicity (cash view, not IFRS deferral) — restate for investor diligence if raising.
8. Y2/Y3 marketing spend held modest because financier channel is founder-led B2B sales, not ad-driven.
