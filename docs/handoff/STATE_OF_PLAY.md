# FleetView — State of Play

> **Verified 2026-07-28 by reading source and running the build + test suite.**
> **This is the most important document in the handoff.** Several things in this repo *look*
> finished but are not. Read the "Traps" section (§3) before you trust anything.

**Confidence key:** 🟢 verified by running it · 🟡 verified by reading code, not executed · 🔴 inferred/unverified

---

## 1. Feature status

### Backend — implemented

| Feature | Status | Lives in | What's missing | Conf. |
|---|---|---|---|---|
| Phone + OTP login | **Done** | `src/auth/` | OTP store is in-memory (dies on restart, breaks multi-instance) | 🟢 |
| JWT access + rotating refresh | **Done** | `src/auth/auth.service.ts` | HS256 shared secret; spec wants RS256 | 🟢 |
| Kenyan phone normalisation | **Done** | `src/common/phone.ts` | — (15 tests) | 🟢 |
| Vehicle + device registry | **Partial** | `src/vehicles/` | **No update, no delete/decommission endpoint.** Only list/create/get/position | 🟢 |
| Traccar device mirroring | **Done** | `vehicles.service.ts` | Failure leaves `traccarDeviceId` null with **no retry/reconciliation job** | 🟢 |
| Traccar REST client | **Done** | `src/traccar/traccar.client.ts` | `disableDevice()` is **dead code** — nothing calls it | 🟢 |
| Traccar WebSocket subscriber | **Done** | `traccar-socket.service.ts` | Events lost on restart (in-memory RxJS, no durable queue) | 🟢 |
| Alert rules + dedup | **Done** | `src/alerts/alert-rules.ts` | — (8 tests) | 🟢 |
| Alert fan-out | **Partial** | `alerts.service.ts` | **Org-owned vehicles get NO notifications** (see Trap T2). No push. Daily SMS cap unenforced | 🟢 |
| Two-step immobilization + safety gate | **Done** | `src/commands/` | — (16 tests). Best-tested area of the codebase | 🟢 |
| GPRS / SMS command dispatch | **Done** | `commands/command-dispatch.ts` | **Never executed against a real device or a real SMS gateway** | 🟡 |
| Command delivery confirmation | **Done** | `commands/command-delivery.*` | — (10 tests) | 🟢 |
| Subscriptions + invoices | **Done** | `src/billing/billing.service.ts` | No proration, no plan change, no cancellation endpoint | 🟡 |
| M-Pesa STK Push | **Done** | `billing/daraja.client.ts` | **Sandbox only.** No production credentials | 🟢 |
| M-Pesa C2B reconciliation | **Done** | `billing.service.ts` | Unmatched payments have **no admin UI or endpoint** to resolve them | 🟢 |
| Renewals scheduler | **Done** | `billing/renewals.scheduler.ts` | Never observed running a real daily cycle | 🟡 |
| Organizations + RBAC | **Partial** | `src/orgs/` | No remove-member, no role-change audit, no ownership transfer | 🟢 |
| Financier module | **Done** | `src/financier/` | LMS **outbound** webhooks not built (only inbound import) | 🟢 |
| Recovery links | **Done** | `financier.service.ts` | No revoke endpoint despite `status: revoked` existing in schema | 🟡 |
| Client WebSocket stream | **Partial** | `src/stream/` | **Only direct owners get data** (Trap T3) | 🟢 |
| Health endpoint | **Broken** | `src/health/health.controller.ts` | **Hangs when Postgres is down** instead of failing fast | 🟢 |

### Backend — schema exists, ZERO code

These have Prisma models and appear in the data model, but **nothing reads or writes them**. Verified by grepping for every `prisma.<model>.` accessor.

| Model | Intended purpose | Status |
|---|---|---|
| `SimCard` | SIM fleet management (bundle expiry, ICCID↔MSISDN register) | **Not started.** No module, no endpoints. `Device.simCardId` can never be populated through the API |
| `Geofence` | Named zones + entry/exit alerts | **Not started.** No module. Geofence *alerts* are handled if Traccar emits them, but **no way to create a geofence** |
| `VehicleGeofence` | Zone↔vehicle assignment | **Not started** |
| `InstallerJob` | Installer work orders | **Not started.** No module, no endpoints |

### Backend — not started at all

| Feature | Notes |
|---|---|
| **Trip history / playback** | `TraccarClient.route()` exists but **no endpoint exposes it**. A core parity feature is unreachable |
| **Reports** (trip, mileage, parking, engine, alert summary) | No reports module. Competitors ship ~10 report types |
| **Report export** (Excel/PDF/CSV) | Nothing |
| **Scheduled/emailed reports** | Nothing |
| **Push notifications (FCM)** | Nothing. No firebase dependency installed |
| **Driver behaviour** (harsh accel/brake/turn) | Nothing |
| **Maintenance / service reminders** | Nothing |
| **Device groups / folders** | Nothing |
| **POI management** | Nothing |
| **SOS handling** | `sos` is mapped as an alert type; no dedicated flow |
| **Admin console endpoints** | No admin module (SIM ops, unmatched payments, device stock) |
| **Dealer/reseller console** | Strategic decision pending (see doc 05) |
| **Outbound LMS webhooks** | Financier integration is inbound-only |

### Frontend — nothing exists

| Deliverable | Status |
|---|---|
| **Flutter mobile app** | **0%.** No project, no `pubspec.yaml`. Verified |
| **React web dashboard** | **0%.** No project, no `vite.config`/`next.config`. Verified |
| **Marketing website** | **Design only.** `prototype-v2/website.html` is a real single page but is not deployed and has no backend |
| `prototype-v2/*` | **Static HTML/CSS mockups.** No JS logic, no data, no interactivity beyond `<a href>` links |
| `prototype/*` | Superseded first-pass wireframes |

### Infrastructure, ops, business

| Item | Status |
|---|---|
| Local Docker stack (Postgres + Traccar) | **Working** 🟢 |
| Production server / VPS | **Not provisioned** |
| CI/CD | **None.** No workflow files |
| Linter / formatter | **None** |
| DB migrations | **None** — `db push` only (destructive risk) |
| Seed data | **None** |
| Backups | **Not configured** (procedure documented in `02-traccar-server-setup-guide.md`) |
| Monitoring / logging / error tracking | **None** |
| Rate limiting | **None** except the 60s OTP cooldown |
| Security headers, CORS policy | **`app.enableCors()` with no options = allow all origins** |
| Secrets management | `.env` file only |
| Real GPS device testing | **NEVER DONE.** No physical tracker has ever connected |
| Real SMS | **NEVER SENT.** No Africa's Talking account |
| Real money | **NEVER MOVED.** Daraja sandbox only |
| ODPC registration, company registration, KIPI trademark | **Not started** |

---

## 2. Test coverage — read this before trusting "87 tests passing"

**Verified:** `npm test` → `Test Files 11 passed (11) · Tests 87 passed (87)`, exit 0.

**But every one of those 87 tests is a pure unit test with a hand-mocked Prisma object.** There is **no integration test, no end-to-end test, and no test that touches a real database, a real HTTP request, or a real Traccar.**

**What IS tested** (pure logic — genuinely well covered):
`phone.ts` (15) · `billing-logic.ts` (14) · `commands.service.ts` (10) · `command-delivery.ts` (10) · `alert-rules.ts` (8) · `safety-gate.ts` (6) · `financier.service.ts` (6) · `auth.service.ts` (5) · `otp.store.ts` (5) · `roles.ts` (4) · `stream-filter.ts` (4)

**What is NOT tested at all** (29 source files) — notably **every controller, every guard, and every DB-touching service**:
`alerts.service.ts` · `alerts.worker.ts` · `billing.service.ts` · `daraja.client.ts` · `renewals.scheduler.ts` · `orgs.service.ts` · `org-role.guard.ts` · `jwt-auth.guard.ts` · `vehicles.service.ts` · `traccar.client.ts` · `traccar-socket.service.ts` · `stream.gateway.ts` · `command-dispatch.ts` · all 8 controllers · both SMS providers · `prisma.service.ts` · `main.ts`

So: the **decision logic** is well tested; the **wiring, persistence and I/O** are not tested at all.

---

## 3. Traps — things that look done but will break in production

> If you read nothing else, read this.

**T1 — `prisma db push` will eat production data.**
There is no `prisma/migrations/` directory. `db push` reconciles the schema by dropping and recreating whatever it must. It is fine on an empty dev DB and **catastrophic on a live one**. Convert to `prisma migrate` **before** any real customer data exists.

**T2 — Org-owned vehicles produce alerts but notify nobody.**
`alerts.service.ts` → `fanOut()` starts with `if (!vehicle.owner) return;`. `vehicle.owner` is only set for personally-owned vehicles. Every fleet and financier vehicle therefore writes an `Alert` row and then **silently sends nothing** — no in-app row, no SMS. The entire B2B segment gets zero notifications. The code comment admits this was deferred.

**T3 — `/v1/stream` shows fleet and financier users nothing.**
`stream.gateway.ts` → `buildScope()` queries `where: { ownerUserId: userId }` only. Org members connect successfully, receive a `ready` message listing **zero vehicles**, and then see no positions ever. It looks like it works.

**T4 — The daily SMS cap is decorative.**
`SMS_DAILY_CAP_PER_VEHICLE = 10` is exported from `alerts.service.ts` and **referenced nowhere else**. There is no spend ceiling on SMS.

**T5 — `SMS_PROVIDER=dev` silently succeeds.**
`DevSmsProvider.send()` writes to the server log and resolves. In dev, OTPs and alerts "work" while no message is ever sent. If this reaches production, every login breaks silently. **The Africa's Talking provider has never been executed even once.**

**T6 — Nothing has ever talked to a real tracker.**
Every device interaction to date was simulated by POSTing to Traccar's OsmAnd endpoint. The GT06/Teltonika SMS command strings in `command-dispatch.ts` come from manuals, not from a device that obeyed them. Treat the whole device layer as unproven.

**T7 — CORS is wide open.** `main.ts` calls `app.enableCors()` with no arguments — all origins allowed.

**T8 — Health check lies to your load balancer.** It hangs (rather than reporting `db:false`) when Postgres is unreachable.

**T9 — Traccar mirroring can silently half-fail.** If `traccar.createDevice()` throws, `vehicles.service.ts` logs and continues, leaving a `Device` row with `traccarDeviceId = null`. That vehicle will never track and nothing retries or reports it.

**T10 — The financier batch cuts engines on offline vehicles.** In `batchConfirm()`, only `verdict.reason === 'moving'` blocks dispatch. A vehicle with no position for 3 days still gets a cut command over SMS. This is deliberate (offline collateral still needs action) but is a real-world consequence worth a conscious decision.

**T11 — No idempotency on mutating endpoints.** The spec calls for an `Idempotency-Key` header on billing and command endpoints; it is not implemented. A retried STK request creates a second `Payment` row.

**T12 — `prototype-v2/` is not a frontend.** It cannot be "connected to the API". The app must be built from scratch.

---

## 4. What is genuinely production-quality today

To be fair to the codebase, these parts are solid and should be imitated:

- **The immobilization safety model** — two-step confirm, gate evaluated twice, blocked attempts still audited, delivery confirmed from device feedback. 16 tests. This is the best code here.
- **Money handling** — unique constraints for STK (`checkoutRequestId`) and C2B (`TransID`) dedup, immutable `rawCallback`, three-tier matching with an explicit unmatched queue.
- **Phone normalisation** — handles `07…`, `+2547…`, `2541…`, spaces, dashes; rejects non-Kenyan. 15 tests.
- **Alert dedup via DB unique constraint** — race-safe by construction.
- **The SMS provider interface** — clean seam for swapping providers.
- **RBAC rank model** — the lateral installer/recovery_agent handling is subtle and correct.
