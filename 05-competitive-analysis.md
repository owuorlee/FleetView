# 05 — Competitive Analysis & Migration Playbook

**Date:** 2026-07-27 · **Status:** living document · Feeds the parity checklist in [01-technical-spec.md](01-technical-spec.md), the UX conventions in [03-app-design-and-prototype.md](03-app-design-and-prototype.md), and positioning in [04-business-plan-and-financials.md](04-business-plan-and-financials.md).

**Purpose:** make switching to FleetView *easy and obvious* for a competitor's existing customer — by (a) matching the features they rely on, (b) feeling familiar in the flows they already know, and (c) removing the real switching costs. We adopt **conventions and ideas**, never competitors' code, copy, or designs.

**Evidence legend:** ✅ **verified** (seen first-hand in screenshots or fetched from the live page, dated) · ⚠️ **inferred** (reasoned from evidence, needs confirmation) · ❓ **unknown** (open question)

---

## 1. Source log

| Source | What it gave us | Status |
|---|---|---|
| Protrack365 mobile app — 18 screenshots (owner account) | Full app IA, settings, device detail, alert config, geofence | ✅ 2026-07-27 |
| Protrack365 web client — `protrack365.com/V2` screenshots | Monitor/map, full report taxonomy, device context menu | ✅ 2026-07-27 |
| Protrack365 **dealer panel** — `protrack365.com/dealer2` screenshots | Reseller economics: sell/bulk-sale/recharge, card balances | ✅ 2026-07-27 |
| itrack.ke product + motorbike pages | KSh pricing, package structure, feature list | ✅ 2026-07-27 |
| cartrackingsolutionskenya.com | KSh pricing incl. dashcam/governor, feature list | ✅ 2026-07-27 |
| trackntrace.co.ke fleet page | B2B feature list, driver scoring, 100+ reports | ✅ 2026-07-27 |
| cartrack.co.za consumer + Tag blog + product guide | Consumer features, recovery ops, anti-jamming Tag | ✅ 2026-07-27 |
| traccar.org/devices | Protocol/port check for adoption feasibility | ✅ 2026-07-27 |
| Play Store listings + reviews (5 apps, read in-browser) | Feature lists, install base, **real user complaints** (§7) | ✅ 2026-07-27 |
| Device manuals — iTrack TK102, AT1 backup tracker, FS100 | **SMS command sequences** (§6.1), backup-tracker design | ✅ 2026-07-27 |
| Competitor YouTube walkthroughs (19 links supplied) | In-app flows | ❓ **not usable — I cannot watch video** (see §10) |

> ⚠️ **Three unrelated companies use the name "iTrack".** Don't conflate them: **itrack.ke** (Kenyan installer/reseller), **iTrack Live / itrackgpstrackers.com** (iTrack Ltd, UK — source of the downloaded manuals), and **iTrack / itrack.top** (SEEWORLD Technology, China — a white-label platform with 500K+ installs). Also note **`Protrack2_man_en.pdf` in the manuals folder is a skydiving altimeter manual** (LB Altimeters, Denmark) — an unrelated name collision, safe to delete.

> **Privacy note:** the screenshots contain a real customer's name, phone, email, IMEI, ICCID and coordinates. None of that personal data is reproduced here — only structural/UX patterns. Keep the raw screenshots out of the public repo if it is ever made public.

---

## 2. The single most important finding: we are not competing with 100 companies

The Kenyan market is overwhelmingly running **white-labelled Chinese tracking platforms resold by local dealers.** The evidence is direct:

- The app's **"Supplier"** screen names a local accessories shop as the customer's point of contact — not a tracking company. ✅
- The web platform is a generic **"GPS"**-branded product at `protrack365.com`, with a separate **dealer console** at `/dealer2`. ✅
- The dealer console sells *activation credits*: **"Card Balance — Annual card / Lifelong card"**, with actions **Sell · Bulk Sale · Move · Recharge · Modify Expiry Date**. ✅
- Devices seen in accounts are commodity Chinese units (**VT05S**, **TK103**). ✅
- Account usernames are the **vehicle number plate** (e.g. account `KDL904`, device name `KDL904U`). ✅

**What this means strategically:**

1. **The "competitor UX" our market has muscle memory for is one platform template**, not a dozen distinct designs. Matching *that* template's conventions covers most switchers at once. (See §5.)
2. **The 100+ "tracking companies" are mostly resellers with no engineering capability.** They compete on installation, price and relationships — not product. They cannot out-build us, and they are structurally unable to fix the weaknesses in §7 because they don't own the software.
3. **They are therefore a channel, not just an enemy.** Every one of those dealers is currently paying a Chinese vendor for activation credits, in USD, with no M-Pesa integration and no local support. A FleetView **dealer/reseller console** — priced in KSh, topped up by M-Pesa, with local support — could recruit the incumbent sales force instead of fighting it. This is a major GTM option that did not exist in doc 04's plan.
4. **Financiers are the exception** — they are real institutions with real requirements, and the white-label platforms serve them poorly (no loan-linked flagging, no portfolio view, no LMS webhooks). Our financier module (already built) has no equivalent in what we've examined. ⚠️ *needs confirmation against whatever the big financiers actually use.*

---

## 3. Protrack platform teardown (the template to feel familiar with)

### 3.1 Mobile app — information architecture ✅

**Bottom navigation: `Monitor` · `Device` · `Alert` · `Me`** (4 tabs, icon + label, orange active state on dark/white chrome.)

| Area | Contents observed |
|---|---|
| **Monitor** | Full-bleed Google map; vehicle plate as the screen title; top-down car sprite marker; **auto-refresh countdown ring (10 s)**; POI toggle; label ("T") toggle; map-layer toggle (road/satellite); traffic toggle; locate-me; zoom ±; left/right chevrons to page between vehicles; fullscreen |
| **Device** | Device detail: Icon, IMEI, SIM Card, ICCID, **Vehicle Plate Number**, Model, **Activated Date**, **Expiration Date**, Status (e.g. "Static"), GPS Time, Last Update, Speed, Coordinate, **Engine Status (ON/OFF)**; `Edit` action |
| **Alert** | Per-device alert switchboard (see below) |
| **Me** | Profile (Account = plate) · **Schedule for report** · **Generated reports** · **Geo-fence** · **POI** · **Message** · **General** · **Feedback** · Logout · version string |

**Per-device alert toggles** ✅ — Speeding Alert (+ threshold, e.g. 120 kph) · Engine ON alert · Engine OFF alert · Door open / Door close · Oil Leak (12 L) · Refueling (12 L) · Low Oil (10 L) · Engine IDLE (6 min) · **Offline Alert** · Parking Alert (6 min) · **Restricted Driving Alert**.

**Geofence model** ✅ — named zones (list + `New`), assigned per device via a matrix with columns **In · Out · Speeding Alert · Stop Engine**. Note the last one: *a geofence can be configured to cut the engine automatically.* We deliberately do **not** copy that (see §8, safety).

**Settings** ✅ — Notification · Language · Time Zone (UTC+03:00) · Monitor refresh rate (10 s) · Tracking refresh rate (10 s) · **Remove Drift Location (5 km/h)** · Date format · Distance/speed unit · Pressure unit · Temperature unit · Volume unit · Engine IDLE · Use POI Address · **Command Password** · **Enable IMEI login** · Manage Storage · Map Theme.

Two of those are strategically interesting: **"Remove Drift Location"** (GPS-drift suppression while parked — a real quality problem we should solve silently rather than expose as a setting), and **"Enable IMEI login"** (log in with the device IMEI — a migration-relevant convention, see §6).

### 3.2 Web client — `protrack365.com/V2` ✅

- Left icon rail: **Monitor · Report · Device · Driver** (+ POI, geofence, messages, help, logout).
- **"My device"** panel: search by *Name / IMEI / vehicle plate No.*, tabs **All / Online / Offline**, group tree ("Default Group"), each row showing last-update age ("2h+") and a status dot.
- Map: Google basemap, POI clutter, **"Refresh after N seconds"** countdown, address search, measure distance/area, traffic, layers.
- Device context menu: **Full Screen · Tire · Status · Mileage Report · Trip Report · Maintenance · Remind Management**.

**Report taxonomy** ✅ (this is the parity bar for our dashboard):

```
Reports Overview
├── Operation Statistics → Moving Overview (Device Qty, Total Mileage, Total Speeding, Total Parking)
├── Trip Report
├── Driving Behavior Report → Overview / Report / Details
│     (Fatigue Driving, Harsh Acceleration, Harsh Braking, Sharp Turn, Sharp Change Lane)
├── Engine Report
├── RFID Report                     (driver identification)
├── Vehicle Info Report → Fuel / Tirepressure / Temperature
├── OBD Report
└── Alert Report → Alert Overview / Alert Report / Alert Details / Geo-fence Alert Report
Schedule for report · Report tasks · Generated reports
```

Every report exports to **Excel / PDF / Print**. Date presets: Today, Yesterday, This week, Last week, This month, Last month. Range caps: **30 days** most reports, **3 days** fuel. Reverse-geocoded addresses are a **toggleable, rationed feature** ("Google Address: Unavailable") — i.e. they meter it because it costs them.

### 3.3 Dealer console — `protrack365.com/dealer2` ✅ (the business model)

- Nav: Overview · Business · SIM Card · Add User · Card.
- Dashboard: Users count · **Device Quantity** (Total / Imported / Activated / Unactivated / Recharged / **Expired**) · **Card Balance (Annual card, Lifelong card)**.
- Actions: **Sell · Bulk Sale · Move · Recharge · Modify Expiry Date**. Selling a device = assign IMEI → target user → set *User Due* date.
- Customer list with **Users / Expired / Offline** filters; per-customer device table (Device Name, IMEI, SIM, Model, Sell Date); Sub-user support.

**Read this as the incumbent's operating system:** dealers buy credits, activate devices, and chase expiry dates manually. "Expired" and "Offline" are first-class filters because lapsed renewals and dead devices are their daily reality — which is exactly the pain our M-Pesa renewal engine removes.

---

## 4. Feature matrix

**Status key:** ✅ built · 🟡 partial · 📋 planned · ➖ deliberately skipped
**Class:** **P** = parity (needed so nobody loses a feature by switching) · **D** = differentiator · **X** = not for v1

| Feature | Protrack template | iTrack KE | Track n Trace | Carro KE | Cartrack | FleetView | Class |
|---|---|---|---|---|---|---|---|
| Real-time map + speed/direction | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | P |
| Engine/ignition status | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | P |
| Trip history playback | ✅ | ✅ 90 d | ✅ | ✅ 30 d | ✅ | ✅ ≥90 d | P |
| Remote engine cut / restore | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ (2-step + safety gate) | P/D |
| Geofence + in/out alerts | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | P |
| Overspeed alert + threshold | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | P |
| Engine ON/OFF alerts | ✅ | ✅ | ✅ | — | ✅ | ✅ | P |
| Offline / power-cut / tamper alerts | ✅ | ✅ | — | — | ✅ | ✅ | P |
| Restricted-hours driving alert | ✅ | — | — | — | — | ✅ | P |
| Mileage & parking reports | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 daily only | P |
| **Report export (Excel/PDF/Print)** | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | 📋 **gap** | **P** |
| **Scheduled/emailed reports** | ✅ | — | ✅ | — | ✅ | 📋 **gap** | **P** |
| **Driver behaviour scoring** (harsh accel/brake/turn, fatigue) | ✅ | ✅ fatigue | ✅ scoring | — | ✅ | 📋 **gap** | **P** (insurer channel) |
| **Maintenance reminders / service due** | ✅ | — | ✅ | — | ✅ | 📋 **gap** | **P** |
| **Device groups / folders** | ✅ | ⚠️ | ✅ | — | ✅ | 📋 **gap** | **P** (fleets) |
| **POI management** | ✅ | — | — | ✅ | ✅ | 📋 gap | P |
| SMS command fallback | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | ✅ | P |
| Fuel monitoring (sensor) | ✅ | — | ✅ | — | ✅ | ➖ v2 | X |
| Tyre pressure / temperature | ✅ | — | ✅ | — | ✅ | ➖ | X |
| OBD diagnostics | ✅ | — | — | — | ✅ | ➖ | X |
| RFID / driver ID | ✅ | — | ✅ | — | ✅ | ➖ v2 | X |
| **Listen-in microphone** | ⚠️ | — | — | ✅ | — | ➖ **see §8** | X |
| **SOS / panic button** | ✅ | — | ✅ | ✅ | ✅ | 📋 **gap** | **P** |
| Dashcam / video telematics | — | — | ✅ | ✅ KSh 45k | ✅ AI cameras | ➖ v2+ | X |
| Speed governor (NTSA) | — | — | ✅ | ✅ KSh 30k | — | ➖ gated | X |
| **24/7 control room + recovery team** | — | ⚠️ | — | — | ✅ air+ground | ➖ **decision needed** | — |
| **Anti-jamming backup tag (RF)** | — | — | — | — | ✅ Tag | 🟡 jam *detection* only | D |
| Crash detection | — | — | — | — | ✅ | 📋 candidate | D |
| Movement-without-consent alert | ⚠️ | ✅ towing | — | — | ✅ CarWatch | ✅ (tamper/tow) | P |
| Share live location link | ⚠️ | — | — | — | ✅ | ✅ recovery link | P/D |
| **M-Pesa STK renewal + auto-reconciliation** | — | — | — | — | — | ✅ | **D** |
| **Bilingual EN/SW UI** | ⚠️ language menu | — | — | — | — | ✅ | **D** |
| **Financier/SACCO module** (loan-linked, batch, LMS webhooks) | — | — | — | — | — | ✅ | **D** |
| **Reseller/dealer console** | ✅ (their moat) | — | — | — | — | 📋 **opportunity** | **D** |
| Sub-users / role delegation | ✅ | — | ⚠️ | — | ✅ | ✅ RBAC | P |
| Transparent public pricing | — | ✅ | — | ✅ | ➖ hidden | ✅ | D |

### Verified Kenyan pricing (2026-07-27)

| Provider | Offer | Renewal |
|---|---|---|
| **iTrack** pkg 1 | KSh **8,500** install, client loads own airtime | KSh **2,500**/yr |
| **iTrack** pkg 2 | KSh **10,000** install, airtime included | KSh **3,500**/yr |
| **Carro** car tracker | KSh **15,000** (incl. listen-in mic, SOS button, 1-yr warranty) | none published |
| **Carro** dashcam / governor / CCTV | KSh 45,000 / 30,000 / 18,500 | — |
| **Cartrack** | tiers *Quick / Quick Silver / Quick Gold*, bike *Silver/Gold/Platinum* | **pricing hidden** |

This **confirms doc 04's pricing model** — our Boda 7,500 / Car Std 9,500 / Car Premium 14,500 sits correctly in-market, and our published renewals (2,500–3,500) match the going rate. No repricing needed. ✅

---

## 5. UX convention map — what to adopt so switching feels familiar

Adopt the **structure and vocabulary**; keep our own visual identity, copy and safety model.

| Convention | Evidence | Our decision |
|---|---|---|
| **4-tab bottom nav** | `Monitor · Device · Alert · Me` | **Adopt the shape**, our labels: `Home · Map · Alerts · More`. Consider renaming Home→**Monitor**? ❓ decide in design |
| **Plate number as the vehicle's identity everywhere** | Screen titles, device name, even the *account username* | **Adopt fully.** Plate is the primary label in lists, map callouts, alerts, SMS, PayBill account ref (already done in billing) |
| **Auto-refresh countdown visible on the map** | 10 s ring; web "Refresh after N seconds" | **Adopt** — a visible freshness indicator builds trust. Ours doubles as data-saver feedback (WS live vs 30 s poll) |
| **"Last update" age on every row** | "2h+" next to device name | **Adopt** — we already surface fix age; make it a first-class list element |
| **All / Online / Offline filter tabs** | Web device panel | **Adopt** for multi-vehicle and fleet views |
| **Device detail = the spec sheet** (IMEI, SIM, ICCID, model, activation & expiry dates, engine status) | Device tab | **Adopt.** Crucially, **expiry date visible on the device page** — pairs perfectly with our renewal engine |
| **Per-device alert switchboard with thresholds inline** | Alert toggles + values (120 kph, 6 min) | **Adopt** — matches our notification-prefs matrix; show the threshold on the row, editable in place |
| **Named geofences, assigned to vehicles via a matrix** | Geofence list + In/Out/Speed/Stop-Engine columns | **Adopt the model** (named zones, per-vehicle assignment, per-trigger toggles). **Reject** the Stop-Engine column (§8) |
| **Reports as a taxonomy with date presets + export** | Full report tree, Today/Week/Month presets, Excel/PDF/Print | **Adopt** — this is our biggest parity gap (§9) |
| **"Supplier"/dealer contact card in-app** | Supplier screen with name, phone, email | **Adopt as "Your installer"** — the customer's real relationship is with a local technician. Also the hook for our dealer network |
| **IMEI-based login option** | "Enable IMEI login" toggle | **Adopt for migration only** — see §6. Not our default (we're phone+OTP) |
| Terminology customers already say | "Geo-fence", "Engine ON/OFF", "Playback", "Immobilize", "Offline", "Expired" | **Use these exact words** in EN; keep the Swahili set from doc 03 |

---

## 6. Migration playbook — the real switching cost

Feature parity gets us considered. **Removing switching cost gets us the customer.**

### 6.1 The hardware wedge (highest value, needs one experiment)

A customer who paid KSh 8,500–15,000 for an installed tracker will not pay again. If we can **re-point their existing device to our server**, switching becomes free and remote.

What we know:
- Traccar decodes **200+ protocols**, so many commodity units are supported out of the box. ✅
- **Concox family → `gt06` protocol, port 5023** (GT03/GT06/GT07/GK301/GT02D/OB22/CRX3 …). ✅ verified
- **TK103 → `xexun` protocol, port 5006**, flagged by Traccar as having **clones** (clones often speak a different dialect). ✅ verified
- **VT05S (the model in the examined account) is NOT listed by name in Traccar's supported devices.** ⚠️ Many VT05-class units are GT06-family clones, but **this must be proven, not assumed.**

**The experiment (highest-value next action):** obtain one VT05S and one TK103, point each at our running Traccar (`gt06:5023`, then `xexun:5006`) with the SMS server-change command, and see what decodes. We already have the stack live locally, so this costs one device purchase and an afternoon. The answer determines whether "**switch free, keep your tracker**" is our headline offer or not.

#### ✅ Proof that re-pointing works — TK102-class devices (verified from the manual, 2026-07-27)

The iTrack TK102 manual documents the complete server-change sequence over SMS. Default device password `123456`:

| Step | SMS command | Device replies |
|---|---|---|
| Initialise | `begin123456` | `begin ok!` |
| Set APN | `apn123456 safaricom` | `apn ok` |
| **Point at our server** | `adminip123456 <OUR-IP> <PORT>` | `adminip ok` |
| Switch to live mode | `gprs123456` | — |

**Three SMS messages move a competitor's installed tracker onto our platform.** No hardware, no garage visit, no downtime. Additionally, `adminpassword13142324` **resets a changed device password back to the default** — so a dealer having changed the password is not necessarily a blocker (⚠️ use only on a device the customer owns and consents to; this is the customer's own hardware).

Two consequences worth acting on:

1. **`adminip` takes a raw IP address, not a hostname.** For this device family we cannot rely on DNS. **Our production VPS must have a stable public IP that we commit to long-term** — changing it would orphan every migrated device. This upgrades an infrastructure detail into a strategic constraint (doc 02 recommends hostnames for GT06; xexun-family needs the IP pinned too).
2. The same manual documents **`monitor123456` — a covert listening mode** using the tracker's built-in microphone, which answers calls silently. This capability is baked into cheap commodity trackers already in the Kenyan market. It reinforces §8: we will not expose it, and it is a live consent/DPA issue for the whole category.

#### The AT1 pattern — a cheap answer to GPS jamming (✅ from manual)

Cartrack's anti-jamming moat is an RF Tag needing their own receiver network. The iTrack **AT1** achieves something similar far more cheaply: a battery backup tracker **paired to the main unit over Bluetooth LE**. Every 2 hours it wakes, looks for the primary tracker, and if it finds it, goes back to sleep (preserving battery for years). **If a thief removes or kills the main tracker, the BLE handshake fails and the AT1 wakes up and starts reporting its own GPS every 30 minutes.**

That design is buildable by us with commodity hardware and no proprietary network — a genuine premium-tier differentiator for high-value cars and financier fleets, and a much better answer to jamming/tamper than detection alone. 📋 **Candidate for the Car Premium tier.** ⚠️ Needs a hardware sourcing study.

Blockers to check per competitor: ❓ firmware/config lock, ❓ SMS command password changed from default, ❓ **dealer-owned SIM** (if the SIM is theirs, we swap in our own — cheap, but needs physical access), ❓ contractual lock-in on financed bikes (the financier, not the rider, decides).

### 6.2 The commercial wedge
- **Don't let them double-pay.** Offer: we start billing when your current term expires; switch now, pay nothing today. Their expiry date is *visible in their own app*, so the customer can verify it — and our onboarding can simply ask for it.
- **Publish our renewal price** next to theirs (they mostly hide it). Transparency is both differentiation and SEO.

### 6.3 The familiarity wedge
- A dedicated **"Switch to FleetView"** onboarding path: enter plate → enter IMEI (or scan the sticker) → we detect the device model → we send the re-point SMS commands → live in minutes.
- **IMEI login for migrants:** many incumbent users know their IMEI/plate, not an email. Accept IMEI or plate as an identifier during switch onboarding, then bind to phone+OTP.

### 6.4 The dealer wedge (channel, not competitor)
Recruit the same local installers/resellers by offering what their Chinese platform doesn't: KSh pricing, **M-Pesa top-ups instead of USD credit cards**, local support, and a dealer console (§3.3) that's actually pleasant. Their customers migrate with them. ⚠️ *Requires the dealer console — currently unbuilt.*

---

## 6bis. The app market (Play Store, ✅ 2026-07-27)

| App | Publisher | Installs | Rating | Read |
|---|---|---|---|---|
| **Tracker Connect** | Tracker Connect Pty (South Africa) | **1M+** | 4.2 ★ (5.74K) | Mature consumer operator — richest consumer feature set found |
| **iTrack – GPS Tracking System** (`itrack.top`) | **SEEWORLD Technology** (China) | **500K+** | 4.4 ★ (3.67K) | White-label platform, #8 top-free Auto. Publishes a **public demo login** in the listing |
| **WhatsGPS** | SEEWORLD Technology | — | 4.5 ★ | Same vendor's second white-label brand |
| **Fleetr – Vehicle Tracking** | **Loopy Labs (Kenya)** | 10K+ | 4.2 ★ (12) | **Real modern Kenyan competitor** — see below |
| **iTrack Live** | iTrack Ltd (UK) | 5K+ | — | Adds *Route Repeat*, *Expenses Tracker* |

**Fleetr deserves separate attention.** Unlike the resellers, it is a genuine local software product, shipping fast — its changelog dated **three days before this research** lists: fleet-wide live map with status filters, a fresh home dashboard, journey playback re-centre, a unified notifications hub, grouped profile settings, and a **device connection diagnostic wizard**. That last one is a smart idea we should copy in spirit: a self-service "why is my tracker offline?" flow (our doc 02 §11 checklist, turned into an in-app wizard) deflects the single most common support call. Fleetr is the competitor most likely to move at our speed — the white-label resellers are not.

**Tracker Connect's consumer feature set** (the parity bar for a mature B2C operator): status vocabulary (parked / stationary / driving / over-speeding) · car finder · all-vehicles live map · **share journey in real time with family** · **accident-responder ETA** · tax-compliant trip reports with business/private categorisation and expense logging · odometer + distance this month · **"Car Guard"** (remotely lock the vehicle's position and get a movement alert — i.e. a parked-guard mode) · emergency contacts and medical details · one-tap emergency centre (stolen vehicle, roadside, medical, accident) · licence and service reminders.

Two of those are cheap for us and worth taking: **"Car Guard" / parked-guard mode** (we already have movement + geofence primitives) and **licence/service reminders** (pure scheduling — and in Kenya, NTSA inspection and insurance renewal reminders would land well). The tax-report angle has a Kenyan analogue (KRA business-mileage records) worth testing with fleet buyers. ❓

---

## 7. Weakness log → our differentiation

Now **evidence-based** — the complaints below are verbatim themes from real reviews of a 1M-install operator (Tracker Connect), ✅ read 2026-07-27.

### Verified user complaints (what customers actually hate)

| Complaint (real reviews) | Signal | Our answer |
|---|---|---|
| *"Time-lag for alerts… takes **ten or more minutes** to come through, even when manually refreshing"* — **141 users marked helpful** | **Alert latency is the #1 rated complaint in the market** | ✅ Our NFR is **≤30 s** critical alert delivery (spec §11), push+SMS in parallel, and we measure it |
| *"my login Password doesn't get recognised and if I try to change it, **I don't get the OTP**, not even after 30 minutes"* | Auth/OTP delivery failure locks people out of their own anti-theft product | ✅ Phone+OTP is our primary path with retry/cooldown; SMS provider is swappable. **Add: OTP delivery monitoring + a fallback channel** 📋 |
| *"I had tracker installed my wife's car and **that's when everything fell apart**. Now notifications do not work on either vehicle… only via email"* | Multi-vehicle notification regressions | Test matrix must cover multi-vehicle fan-out (our WS stream is already per-vehicle scoped) |
| *"**Reports** generated from the App **doesn't allow for direct download, only email**, which also doesn't email an actual report, **just a blank page** with logo"* | Report export is broken even where it exists | 📋 Our export gap (§9 #1) — build it properly: direct download, real content |
| *"real time tracking is very delayed… time to update the trip after ignition off is very very long"* | Trip/report freshness | Our ingest is live; surface "as at" timestamps everywhere |
| *"I've had to reinstall it frequently, then it still doesn't work"* | App stability | Android-light build, crash reporting from day one |
| Review sections of the white-label apps are **polluted with stalkerware spam** promoting phone-spying "services" | These platforms sit adjacent to a covert-surveillance ecosystem | Reinforces our §8 stance: **no listen-in mic**, consent-first framing, vehicle-asset protection — not people-tracking |

> The top complaint by a wide margin is **alert latency**, and the second is **being locked out by a failed OTP**. Both are squarely in our control and are already core to our design. This is the sharpest marketing message we have: *alerts in seconds, and a login that works.*

### Structural weaknesses (from platform design)

| Weakness | Evidence | Our answer |
|---|---|---|
| **Renewals are manual and lapse silently** | Dealer console has "Expired" as a headline metric and a "Modify Expiry Date" tool; customer-side expiry is a passive date field | ✅ Built: STK Push at T-7/T-1/expiry, C2B auto-reconciliation, instant receipts |
| **No local payment rail** | Dealer buys "cards"; no M-Pesa anywhere | ✅ M-Pesa native, KSh pricing |
| **Support is a phone number on a "Supplier" screen** | Supplier card is a local shop's mobile number | 📋 In-app support + WhatsApp, SLA (doc 04 §10) |
| **English-only, foreign-feeling UI** | Generic translated strings, US flag in the language picker | ✅ EN/SW, Kenyan-built |
| **Addresses are metered** | "Google Address: Unavailable" toggle | ⚠️ Budget reverse-geocoding properly (cache + self-host) so it's always on |
| **GPS drift is exposed as a user setting** | "Remove Drift Location — 5 km/h" | Solve server-side, silently |
| **Alert fatigue / no dedup** | Flat per-device toggle list, no throttling concept visible | ✅ Built: dedup buckets, throttling, quiet hours, critical bypass |
| **No loan/collateral concept** | Nothing in the template addresses financiers | ✅ Built: financier module |
| **Geofence can auto-cut the engine** | Stop Engine column | Deliberate divergence — safety (§8) |

> ⚠️ **Cartrack is the exception and the real threat.** Their moat is not software — it's a **24/7 control room plus air-and-ground recovery teams**, crash detection, and the RF **Tag** that survives GPS jamming (3–5 yr battery, no cellular, control-room-only visibility so thieves can't see it). We cannot match that with software. Decide consciously (§9) whether to partner with a private security/recovery firm rather than pretend to compete.

---

## 8. Where we deliberately diverge (and why)

1. **No geofence-triggered automatic engine cut.** The template allows it; we don't. Our safety model requires a human confirmation and a stationary/speed check before any cut (spec §5). Automatic cut-off keyed to a map boundary can stop a vehicle in traffic. This is a *feature we are choosing not to have* — and it should be stated openly as a safety stance, not hidden as a gap.
2. **No listen-in microphone.** Carro sells covert cabin audio at KSh 15,000. Covert recording of vehicle occupants raises serious consent problems under the Data Protection Act 2019 and would poison our ODPC posture and financier/insurer partnerships. Skip; if a customer demands it, that's a customer we lose on principle. ⚠️ *Confirm legal position with counsel if ever revisited.*
3. **Financier immobilization stays two-step and human-confirmed** even though batch pressure will push toward automation.
4. **We do not copy their code, copy text, or screen designs** — only conventions and terminology customers already know.

---

## 9. What this changes in our build

**New parity gaps to close before the app ships** (all currently missing on our side):

| # | Gap | Why it matters | Effort |
|---|---|---|---|
| 1 | **Report exports (Excel/PDF/Print)** | Every competitor has it; fleet buyers expect it at month-end | S–M |
| 2 | **Scheduled/emailed reports** | Standard on the template and Track n Trace | M |
| 3 | **Report taxonomy** — trip, mileage, parking, engine, alert-overview, geofence-alert reports with date presets | Our reports are thin vs the market | M |
| 4 | **Driver behaviour** (harsh accel/brake/turn, fatigue) | Parity for fleets *and* the enabler for insurer partnerships (doc 04 GTM #5) | M (device-dependent) |
| 5 | **Maintenance reminders** (service due by date/odometer) | Present on template, Track n Trace, Cartrack | S |
| 6 | **Device groups/folders** | Fleets with 20+ units need it | S |
| 7 | **SOS / panic button** handling | Carro, Track n Trace, Cartrack all sell it; GT06 SOS already arrives as an alarm | S (we already map `sos`) |
| 8 | **POI management** | Template + Carro; also improves our address quality | S |
| 9 | **"Switch to FleetView" onboarding** + IMEI/plate identifier | The migration wedge in product form | M |
| 10 | **Dealer/reseller console** | Turns 100+ competitors into our channel | L — strategic decision first |
| 11 | **Device diagnostic wizard** ("why is my tracker offline?") | Fleetr just shipped one; deflects the #1 support call; we already have the logic in doc 02 §11 | S |
| 12 | **Parked-guard mode** ("Car Guard") — arm the vehicle, alert on any movement | Tracker Connect consumer staple; we have the primitives | S |
| 13 | **Licence / service / insurance reminders** | Consumer stickiness; NTSA + insurance renewals are Kenya-relevant | S |
| 14 | **OTP delivery monitoring + fallback** | Failed OTP is the #2 complaint in verified reviews — it locks people out of their own anti-theft product | S |

**Decisions needed from you:**
- **Recovery operations** — partner with a security/recovery firm, or stay software-only and let the customer call police? Cartrack's moat is here.
- **Dealer console** — do we pursue the reseller channel (§6.4)? It's a large build and a different business model, but it's the fastest path to volume.
- **Crash detection** — worth adding as a consumer differentiator (Cartrack has it, nobody local does)?

---

## 10. Still to gather

- [x] ~~Play Store listings + reviews~~ ✅ done — see §6bis and §7
- [x] ~~Device manuals / SMS command sheets~~ ✅ TK102 family done — see §6.1
- [ ] **One VT05S + one TK103 for the protocol experiment** (§6.1) — **highest-value single action in this document.** TK102-class is proven on paper; VT05S is the model actually in Kenyan accounts and is unlisted by Traccar
- [ ] What platform the **big motorbike financiers** actually mandate (our volume segment; entirely unverified)
- [ ] Cartrack Kenya's **actual local pricing** (hidden behind a quote form)
- [ ] Whether incumbents **lock device firmware/config** — determines migration coverage
- [ ] **Fleetr** (Loopy Labs) deep-dive — the one local competitor shipping at our pace
- [ ] Review mining for **Kenyan** apps specifically (Fleetr has only 12 reviews; the verified complaints in §7 are from the South African market and may not transfer exactly)

### On the YouTube links

I **cannot watch video**, so the 19 walkthrough links supplied can't be analysed directly — I'd be inventing detail if I claimed otherwise. Three ways to make them useful, cheapest first:

1. **Screenshot the key moments** (the 3–5 screens per video that show a flow) and drop them in `research/<competitor>/screenshots/` — same as the Protrack captures, which were the single most valuable source so far.
2. **Paste the transcript** — YouTube's "Show transcript" panel copies as text and I can read that.
3. **Tell me in a sentence** what each video shows; I'll chase only the ones that cover flows we haven't already mapped.

Honestly, after the Protrack teardown the marginal value is low **except** for anything showing: financier/SACCO portals, installer/dealer workflows, or an actual theft-recovery in progress. Those three we have no coverage of.
