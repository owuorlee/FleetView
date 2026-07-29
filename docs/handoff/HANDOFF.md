# FleetView — Master Handoff

> **Written:** 2026-07-28 · **Repo HEAD at handoff:** `17945ec` on `main` · **Remote:** https://github.com/owuorlee/FleetView.git
> Everything in this document was verified by reading the code or running the command shown, on 2026-07-28, unless tagged `[UNVERIFIED]`.

---

## 1. What this product is

**FleetView** is a GPS vehicle-tracking platform for the Kenyan market. It tracks cars, motorbikes (*boda bodas*) and tuk-tuks; raises theft alerts; allows a remote engine cut-off; and bills customers over M-Pesa. It serves four distinct user types: individual vehicle owners, boda riders, fleet managers, and — the highest-value segment — **asset financiers and SACCOs** who finance motorbikes and require GPS trackers as collateral protection.

The commercial thesis: the Kenyan market already buys tracking (100+ vendors), so demand does not need creating. FleetView wins by fixing what incumbents do badly — alert latency, M-Pesa-native renewals, bilingual UX, and financier tooling that no competitor offers.

## 2. Problem and core user journeys

**Problem.** Vehicle theft is common; existing trackers alert slowly (the most-upvoted complaint found in competitor app reviews was *"alerts take ten or more minutes"*); renewals lapse silently because paying means digging a PayBill number out of an old SMS; and financiers who mandate trackers on financed bikes get consumer-grade tools with no portfolio view.

**Core journeys:**

1. **Owner/rider** — sign up with phone + OTP → vehicle is installed by a technician → see it live on a map → get a push/SMS alarm within seconds if power is cut or the vehicle is jammed/moved → cut the engine (two-step, safety-gated) if stolen → renew yearly via M-Pesa STK push.
2. **Financier ops agent** — import loan repayment status from their loan system → see a portfolio dashboard (arrears buckets, online %) → review a defaulters queue where every row shows a live **safety verdict** → flag a batch → confirm each unit individually (a human always confirms) → generate an expiring recovery link for police.
3. **Installer** — receive a job → scan the tracker IMEI → wire the relay → run a mandatory cut/restore test → capture photo evidence → close the job for payout.
4. **Fleet manager** — monitor all vehicles on one map, run trip/mileage/behaviour reports, export them.

## 3. Current status — one honest sentence

**The backend is substantially complete for v1 scope and verified end-to-end against real Postgres, real Traccar and the live M-Pesa sandbox (87 tests passing); there is no mobile app, no web dashboard and no deployed website — those exist only as static HTML design mockups — and nothing has ever been tested against a physical GPS tracker.**

## 4. Tech stack (exact installed versions, read from `package-lock.json`)

| Layer | Choice | Version | Why |
|---|---|---|---|
| Runtime | Node.js | **v24.12.0** (local machine) | — |
| Package manager | npm | **11.6.2** | — |
| API framework | NestJS | **11.1.27** | DI + module structure suits a many-module domain; guards/decorators fit the RBAC model |
| Language | TypeScript | **5.9.3** | `strict: true` is on |
| ORM | Prisma | **6.19.3** (client + CLI) | Schema-first; the data model is the spec |
| Database | PostgreSQL | **16** (Docker image `postgres:16`) | Shared instance, two databases: `traccar` and `app` |
| Tracking engine | Traccar | **6.14** (Docker image `traccar/traccar:6.14`) | Open source (Apache 2.0), decodes 200+ GPS protocols. **Deliberate architectural decision: we never wrote a GPS protocol decoder.** |
| Scheduling | `@nestjs/schedule` | **6.1.3** | Daily renewal sweep |
| WebSocket | `ws` | **8.21.0** | Both the upstream Traccar socket and our client-facing stream |
| Validation | `class-validator` | **0.14.4** | DTO validation at the HTTP boundary |
| Tests | Vitest | **3.2.7** | `pool: 'forks'` — see Landmines |
| Frontend | *(none)* | — | **Not started.** Spec calls for Flutter (Android-first) + React dashboard |

**No linter, formatter, or CI exists.** Verified: no eslint/prettier/biome config, no `lint`/`format`/`typecheck` script in `package.json`.

## 5. Get running in 10 minutes

**Prerequisites:** Node 24+, Docker Desktop (running), git. On Windows, Docker Desktop requires the WSL2 backend.

```bash
git clone https://github.com/owuorlee/FleetView.git
cd FleetView
```

**Step 1 — start Postgres + Traccar:**
```bash
docker compose -f infra/docker-compose.yml up -d
```
Expected: two containers. Verify with `docker ps` — you want `infra-postgres-1` **(healthy)** and `infra-traccar-1` **Up**.
⚠️ On a cold first start Traccar may exit once (it doesn't retry its first DB connection). `restart: on-failure` handles it; if it stays down, run `docker start infra-traccar-1`.

**Step 2 — install and configure the backend:**
```bash
cd backend
npm install
cp .env.example .env
```
Now edit `.env` — see the table in §6. For a purely local run you can leave `TRACCAR_TOKEN`, `AT_*` and `DARAJA_*` empty; the app boots and degrades gracefully.

**Step 3 — create the database schema:**
```bash
npm run prisma:generate
npm run prisma:push
```
Expected output: `Your database is now in sync with your Prisma schema.`
⚠️ There is **no migration history** — see Landmines.

**Step 4 — create a Traccar admin and API token** (Traccar 6.x does **not** create a default admin; there is no admin/admin):
```bash
# 1. Create the first user — allowed unauthenticated only while the user table is empty
curl -X POST http://localhost:8082/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"FleetView Admin","email":"admin@fleetview.local","password":"<choose-one>"}'

# 2. Log in and mint a 1-year API token
curl -c /tmp/tc.txt -X POST http://localhost:8082/api/session \
  -d "email=admin@fleetview.local&password=<the-one-you-chose>"
curl -b /tmp/tc.txt -X POST "http://localhost:8082/api/session/token" \
  -d "expiration=2027-12-31T00:00:00Z"
```
Put the returned token into `.env` as `TRACCAR_TOKEN`, and set `TRACCAR_URL=http://localhost:8082`.

**Step 5 — build and run:**
```bash
npm run build && npm start     # or: npm run dev  (tsx watch)
```
Expected log line: `FleetView backend listening on :3000 (+ WS /v1/stream)`

**Step 6 — verify:**
```bash
curl http://localhost:3000/v1/health
```
Expected (all three green): `{"status":"ok","db":true,"traccar":"connected","time":"..."}`
If `db:false` → Postgres or `DATABASE_URL` is wrong. If `traccar:"disabled"` → `TRACCAR_URL`/`TRACCAR_TOKEN` are empty. If the request **hangs** → the database is unreachable (known bug, §9).

**Step 7 — smoke-test the auth flow** (`SMS_PROVIDER=dev` prints the OTP to the server console):
```bash
curl -X POST http://localhost:3000/v1/auth/otp/request \
  -H "Content-Type: application/json" -d '{"phone":"0722123456"}'
# read the 6-digit code from the server log, then:
curl -X POST http://localhost:3000/v1/auth/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"phone":"0722123456","code":"<code>","fullName":"Test User"}'
```
Expected: JSON with `accessToken` and `refreshToken`.

**Run the tests:**
```bash
npm test
```
Verified output on 2026-07-28: `Test Files 11 passed (11) · Tests 87 passed (87)`, exit code 0.

## 6. Environment variables

All are read via `@nestjs/config` from `backend/.env`. **Never commit `.env`** (it is gitignored).

| Name | Purpose | Example | Where to get it | Required for local dev? |
|---|---|---|---|---|
| `PORT` | HTTP port | `3000` | — | No (defaults to 3000) |
| `DATABASE_URL` | Postgres `app` DB | `postgresql://app:devpassword@localhost:5432/app` | Created by `infra/initdb/01-create-databases.sql` | **Yes** |
| `JWT_SECRET` | HS256 signing secret | *(random string)* | Generate: `openssl rand -hex 32` | **Yes** |
| `JWT_ACCESS_TTL` | Access token lifetime | `15m` | — | No |
| `JWT_REFRESH_TTL_DAYS` | Refresh token lifetime | `30` | — | No |
| `TRACCAR_URL` | Traccar base URL | `http://localhost:8082` | Local container | No — empty disables tracking |
| `TRACCAR_TOKEN` | Traccar API token | *(long opaque string)* | §5 Step 4 | No — but nothing tracks without it |
| `SMS_PROVIDER` | `dev` or `africastalking` | `dev` | — | No (defaults to `dev`) |
| `AT_USERNAME` | Africa's Talking username | `sandbox` | africastalking.com account | Only if `SMS_PROVIDER=africastalking` |
| `AT_API_KEY` | Africa's Talking API key | *(secret)* | AT dashboard | Same |
| `AT_SENDER_ID` | SMS sender ID | `FLEETVIEW` | Registered with AT + Kenyan networks | Same |
| `DARAJA_BASE_URL` | M-Pesa API base | `https://sandbox.safaricom.co.ke` | Sandbox or `https://api.safaricom.co.ke` for prod | No |
| `DARAJA_CONSUMER_KEY` | Daraja app key | *(secret)* | developer.safaricom.co.ke → your app | Only for billing |
| `DARAJA_CONSUMER_SECRET` | Daraja app secret | *(secret)* | Same | Only for billing |
| `DARAJA_SHORTCODE` | PayBill / till | `174379` (sandbox) | Daraja "Test Credentials" page; production comes with the real PayBill | Only for billing |
| `DARAJA_PASSKEY` | Lipa na M-Pesa passkey | *(secret)* | Same | Only for billing |
| `DARAJA_CALLBACK_BASE_URL` | Public HTTPS base for callbacks | `https://xxx.ngrok-free.dev` | ngrok/cloudflared in dev; the API domain in prod | Only to receive callbacks |
| `DARAJA_WEBHOOK_SECRET` | Unguessable URL path segment | *(random hex)* | `openssl rand -hex 16` | Only for billing |

Verified: `.env.example` and the local `.env` have **identical key sets** — no drift.

## 7. External services

| Service | Role | Status |
|---|---|---|
| **Traccar** (self-hosted) | Decodes GPS protocols, stores positions, computes events. Backend is its only API client; end users never touch it. | Working locally |
| **Safaricom Daraja (M-Pesa)** | STK Push renewals + C2B PayBill reconciliation | **Sandbox only** — verified working; no production credentials, no real money has moved |
| **Africa's Talking** | SMS: OTPs, alerts, receipts, and the SMS fallback path for engine commands | **Code written, never executed.** No account exists; `SMS_PROVIDER=dev` logs to console |
| **Firebase Cloud Messaging** | Push notifications | **Not implemented at all** |
| **ngrok** | Dev tunnel so Daraja callbacks reach localhost | Used during development; a stable domain was in use |

## 8. Map of the codebase

```
FleetView/
├── 01-technical-spec.md … 06-design-system-and-interfaces.md   Planning docs (read 01 + 05 + 06 first)
├── backend/                    The only real software in this repo
│   ├── prisma/schema.prisma    18 models, 24 enums. THE data model. Start here.
│   ├── scripts/
│   │   ├── register-c2b.ts     One-time Daraja C2B URL registration
│   │   └── stk-smoke.ts        Fires a real sandbox STK push (verification tool)
│   ├── src/
│   │   ├── main.ts             Bootstrap: /v1 prefix, ValidationPipe, WS upgrade wiring, BigInt JSON patch
│   │   ├── app.module.ts       Root module — register new modules here
│   │   ├── auth/               Phone+OTP login, JWT issue/refresh, JwtAuthGuard, in-memory OtpStore
│   │   ├── orgs/               Organizations, membership, ranked RBAC (roles.ts + OrgRoleGuard)
│   │   ├── vehicles/           Vehicle + device registry; mirrors devices into Traccar
│   │   ├── traccar/            REST client + resilient WebSocket subscriber (positions$/events$)
│   │   ├── alerts/             Traccar events → rules → dedup → in-app + SMS fan-out
│   │   ├── commands/           Two-step immobilization, safety gate, GPRS/SMS dispatch, delivery confirmation
│   │   ├── billing/            Plans, invoices, Daraja STK + C2B webhooks, renewals scheduler
│   │   ├── financier/          Loans, portfolio, defaulters queue, batch flag/confirm, recovery links
│   │   ├── stream/             Client-facing WS /v1/stream with per-user scoping
│   │   ├── sms/                Provider interface: dev (console) | africastalking (live)
│   │   ├── health/             GET /v1/health
│   │   ├── prisma/             PrismaService (lazy connect)
│   │   └── common/             phone.ts (KE normalisation), invalid-phone.filter.ts
│   └── test/                   11 vitest spec files, 87 tests — all pure unit tests with mocked Prisma
├── infra/
│   ├── docker-compose.yml      Postgres 16 + Traccar 6.14
│   ├── initdb/                 Creates `traccar` and `app` databases + users
│   └── traccar/traccar.xml     Traccar config (Postgres, registerUnknown=false)
├── prototype-v2/               CURRENT design mockups — static HTML/CSS, NOT an app
├── prototype/                  Superseded first-pass mockups
├── research/                   Competitor material (screenshots/PDFs are gitignored — contain third-party PII)
└── docs/handoff/               These documents
```

**When you'd touch what:** new business rule → the relevant `*.service.ts`; new endpoint → `*.controller.ts` + `dto.ts`; new field → `schema.prisma` then `npm run prisma:push`; new alert type → `alerts/alert-rules.ts`; new device protocol behaviour → `commands/command-dispatch.ts`.

## 9. Known bugs and broken things

| # | Issue | Evidence | Impact |
|---|---|---|---|
| B1 | **`/v1/health` hangs when Postgres is unreachable** instead of returning `db:false` fast. `HealthController` awaits `prisma.$queryRaw` with no timeout. | Observed 2026-07-28: request timed out after 5s while the app itself had started normally | A load balancer or uptime monitor will read "hard down" instead of "degraded". Fix before deploying. |
| B2 | **No database migration history.** `prisma/migrations/` does not exist; schema is applied with `prisma db push`. | Verified: directory absent | `db push` can silently drop columns/data. **Unsafe for production.** Must switch to `prisma migrate` before any real data exists. |
| B3 | **In-memory OTP store.** `auth/otp.store.ts` holds OTPs in a `Map`. | Read the file | Restarting the server invalidates all in-flight OTPs; breaks entirely with more than one instance. |
| B4 | **No seed script.** | Verified: no `prisma/seed.ts` | A fresh developer has an empty DB and must create data by hand via the API. |
| B5 | **No linter, formatter, or CI.** | Verified: no configs, no scripts, no workflow files | Style drift is unpoliced; nothing stops a broken commit. |
| B6 | **Push notifications do not exist.** The alert pipeline's "fan-out" writes an in-app row and optionally sends SMS. There is no FCM integration. | Read `alerts/alerts.service.ts` | The product's headline promise (fast alerts) currently depends on SMS only. |
| B7 | **Stream fan-out only covers directly-owned vehicles.** `stream.gateway.ts` `buildScope()` queries `vehicle.ownerUserId` only. | Read the file | Fleet managers and financier staff connecting to `/v1/stream` will see **nothing**. |
| B8 | **`alerts.service.ts` `fanOut()` returns early when `vehicle.owner` is null** (org-owned vehicles), so org-owned vehicles generate alert rows but **no notifications at all**. | Read the file | Silent failure for the entire B2B segment. |
| B9 | **`SMS_DAILY_CAP_PER_VEHICLE` is declared but never enforced.** | `alerts/alerts.service.ts` exports the constant; no code reads it | Unbounded SMS spend is possible. |

## 10. Landmines — non-obvious things that will bite you

1. **Traccar has no default admin.** Traccar 6.x does *not* ship `admin/admin`. The first user must be created via `POST /api/users` while the user table is empty (see §5 Step 4). Getting a 401 here is expected if a user already exists.
2. **`prisma db push`, not migrate.** See B2. Changing `schema.prisma` and pushing can drop data without warning.
3. **Vitest uses `pool: 'forks'` deliberately.** The default `threads` pool intermittently throws `Timeout calling "fetch"` on slower Windows machines. Do not "clean this up".
4. **`BigInt.prototype.toJSON` is monkey-patched in `main.ts`.** Traccar event IDs are `BigInt` and Express cannot serialise them. Looks wrong; is deliberate and required.
5. **Traccar speeds are in KNOTS.** `TraccarClient.speedKmh()` converts (× 1.852). Any new code reading `position.speed` directly will be wrong by ~1.85×.
6. **The safety gate runs twice** — at immobilize *request* and again at *confirm*. This is intentional; a vehicle can start moving between the two steps. Do not "optimise" one away.
7. **Some trackers accept only a raw IP address, not a hostname**, for their server setting (verified in the TK102 manual: `adminip<pw> <IP> <PORT>`). **The production server's IP therefore becomes a long-term commitment** — changing it would orphan every migrated device.
8. **Daraja callbacks are unauthenticated.** Security rests on an unguessable secret path segment (`/v1/webhooks/daraja/:secret/...`) — a wrong secret returns 404. There is no signature to verify; Daraja does not sign.
9. **The financier batch confirm dispatches to offline devices via SMS.** In `financier.service.ts` `batchConfirm()`, only `reason === 'moving'` blocks. Offline/stale-fix units still get the cut command over SMS. Deliberate (offline ≠ safe to ignore for collateral) but worth understanding before changing.
10. **`prototype-v2/` is not the app.** It is static HTML with no JavaScript logic. Do not mistake it for a frontend to extend — the real app must be built from scratch.
11. **The repo contains a real third party's personal data** under `research/` (a competitor's customer name, phone, email, IMEI, coordinates from screenshots). These paths are gitignored. **Do not commit them, and do not paste their contents into issues or docs.**
12. **Two Postgres databases, one instance.** `traccar` is owned by Traccar (never write to it directly); `app` is ours. Cross-database joins are impossible by design — go through the Traccar REST API.

## 11. Glossary

| Term | Meaning |
|---|---|
| **Boda / boda boda** | Motorcycle taxi. The highest-volume vehicle segment in Kenya. |
| **SACCO** | Savings and Credit Cooperative — member-owned financial co-op; a key B2B customer type. |
| **M-Pesa** | Safaricom's mobile money service; the dominant payment rail in Kenya. |
| **Daraja** | Safaricom's developer API for M-Pesa. |
| **STK Push** | "SIM Toolkit" push — server-initiated payment prompt on the customer's handset. |
| **C2B** | Customer-to-Business — customer pays a PayBill manually; we reconcile via callback. |
| **PayBill / shortcode** | The business number a customer pays into. |
| **Account reference** | The text a customer types when paying a PayBill; we use it to match a payment to an invoice (≤12 chars, Daraja limit). |
| **Immobilization** | Remotely cutting the engine via a relay wired to the fuel pump or starter. |
| **Safety gate** | Our rule blocking an engine cut unless the vehicle is stationary with a fresh GPS fix. |
| **Geofence** | A map boundary that raises an alert on entry/exit. |
| **GT06 / Teltonika** | The two GPS protocol families we launch on. Ports **5023** and **5027** respectively. |
| **IMEI** | 15-digit unique identifier of a tracker; how Traccar identifies a device. |
| **ICCID** | Unique identifier of a SIM card. |
| **ODPC** | Office of the Data Protection Commissioner (Kenya). We must register as a data controller. |
| **NTSA** | National Transport and Safety Authority (Kenya) — regulates speed governors / PSV telematics (out of scope for v1). |
| **KRA PIN** | Kenya Revenue Authority tax number, stored on organizations. |
| **Traccar** | The open-source tracking engine we self-host. |
| **Plate block** | Our UI signature: the registration plate rendered as the vehicle's avatar. |
