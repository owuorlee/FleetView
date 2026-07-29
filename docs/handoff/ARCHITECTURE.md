# FleetView — Architecture

> Verified against source on 2026-07-28. Anything not directly read from code is tagged `[UNVERIFIED]`.

---

## 1. The one architectural decision that explains everything else

**We do not decode GPS protocols. Traccar does.**

Writing decoders for 200+ tracker protocols is years of work. Traccar (Apache 2.0) already does it. So the system splits in two:

- **Traccar** owns: TCP listeners per protocol, frame decoding, IMEI identification, position storage, low-level event computation (geofence, overspeed, ignition, alarms), and pushing commands down a live device socket.
- **Our backend** owns: everything commercial and Kenya-specific — identity, RBAC, billing, M-Pesa, SMS, alert semantics, immobilization policy, the financier module.

**The backend is Traccar's only API client. End users never talk to Traccar.** Traccar's own web UI is for internal admin only.

Consequence: never add a GPS protocol decoder to this codebase. If a device isn't supported, the answer is a Traccar upgrade or config, not our code.

## 2. Runtime topology

```
   FIELD DEVICES                    ONE VPS / ONE DOCKER HOST
 ┌───────────────┐        ┌──────────────────────────────────────────┐
 │ GT06 family   │──TCP──▶│ Traccar :5023 (gt06)                     │
 │ Teltonika     │──TCP──▶│ Traccar :5027 (teltonika)                │
 │ (+relay wired │        │   │                                      │
 │  to fuel pump)│        │   ├── decodes → writes → Postgres/traccar │
 └───────────────┘        │   └── REST + WS on :8082                 │
                          │            ▲                             │
                          │            │ localhost only              │
                          │      ┌─────┴───────────────────┐         │
                          │      │ NestJS backend :3000    │         │
                          │      │  /v1/*  REST            │         │
                          │      │  /v1/stream  WS         │         │
                          │      └─────┬───────────────────┘         │
                          │            │                             │
                          │       Postgres/app                       │
                          └────────────┼─────────────────────────────┘
                                       │ HTTPS
        ┌──────────────────────────────┼───────────────────────────┐
        │                              │                           │
   Flutter app                  React dashboard              Daraja / Africa's Talking
   (NOT BUILT)                  (NOT BUILT)                  (outbound + webhooks in)
```

**Two databases, one Postgres instance:** `traccar` (owned by Traccar — treat as read-only, never write) and `app` (ours, Prisma-managed). Cross-database joins are impossible by design; the backend stores `traccarDeviceId` / `traccarGeofenceId` as loose references and goes through Traccar's REST API for anything else.

## 3. Request and data flows

### 3.1 Standard authenticated REST request
```
Client ──HTTPS──▶ main.ts
                   ├─ global prefix  /v1
                   ├─ ValidationPipe (whitelist + forbidNonWhitelisted + transform)
                   └─ InvalidPhoneFilter (maps InvalidPhoneError → 400)
                        │
                   Controller  (@UseGuards(JwtAuthGuard[, OrgRoleGuard]))
                        │  DTO validated by class-validator
                   Service     (business rules; the only place logic lives)
                        │
                   PrismaService ──▶ Postgres `app`
                        │
                   TraccarClient ──▶ Traccar REST (when tracking data is needed)
```

**Auth:** `JwtAuthGuard` verifies a `Bearer` token and attaches `req.user = { id, phone }`. `CurrentUser` decorator reads it.
**Org scoping:** `OrgRoleGuard` reads the `@RequireOrgRole(role)` metadata plus the `:orgId` route param, looks up `OrgMember`, and applies the rank check in `orgs/roles.ts`.

### 3.2 Live position flow (device → screen)
```
Device ──▶ Traccar (decode, store)
             │ WebSocket /api/socket   ← ONE upstream connection, held by the backend
             ▼
   TraccarSocketService
     ├─ positions$ : Subject<TraccarPosition>
     └─ events$    : Subject<TraccarEvent>
             │
      ┌──────┼───────────────┬─────────────────────┐
      ▼      ▼               ▼                     ▼
  StreamGateway      AlertsWorker        CommandDeliveryWorker
  (fan-out to        (events → alerts)   (positions → confirm
   many clients,                          relay commands)
   scoped per user)
```

`TraccarSocketService` exchanges the API token for a session cookie, then opens the WebSocket, with exponential backoff to 60s on failure. Everything downstream is a plain RxJS `Subject` subscription — **not** a durable queue. If the process restarts, in-flight events are lost.

### 3.3 Alert pipeline
```
Traccar event
  → mapTraccarEvent()          alert-rules.ts: is this customer-meaningful? severity? dedup bucket?
  → look up Device by traccarDeviceId → Vehicle
  → if critical: fetch latest position (best-effort enrichment)
  → INSERT Alert with dedupKey = "type:vehicleId:timeBucket"
       └─ unique constraint violation (P2002) ⇒ suppressed; increment repeatCount instead
  → created$.next(...)         feeds the client WebSocket
  → fanOut(): in-app row always; SMS only for critical
```
Dedup is enforced by a **unique index on `Alert.dedupKey`**, not application locking — a race just becomes a P2002 and increments the counter.

### 3.4 Immobilization (the highest-stakes flow)
```
POST /v1/vehicles/:id/commands/immobilize   { reason }
   ├─ ownership check
   ├─ device must exist AND relayFitted
   ├─ fetch latest position → evaluateSafety()
   │     blocked if: no position | fix older than 10 min | speed > 10 km/h
   ├─ Command row written EVEN WHEN BLOCKED (status=blocked_safety) ← audit
   └─ if safe: status=pending_confirmation, OTP sent to the requesting user's phone

POST /v1/commands/:id/confirm   { code }
   ├─ same user only; status must be pending_confirmation
   ├─ within CONFIRM_WINDOW_MIN (10) or → expired
   ├─ OTP verified
   ├─ SAFETY GATE RE-RUN  ← deliberate: the vehicle may have started moving
   ├─ dispatchCommand():
   │     fix ≤ 5 min old  → Traccar GPRS  ("engineStop")
   │     otherwise        → SMS to the tracker SIM
   │                         gt06:      "RELAY,1#"
   │                         teltonika: "  setdigout 1"   (two-space prefix is required)
   └─ Command.status = sent ; Vehicle.status = immobilized

Later: device reports its relay state in a position
   → CommandDeliveryWorker → relayStateFromAttributes()
        reads Traccar `blocked` | Teltonika `out1` | `output` bitmask
   → matching Command (sent, ≤30 min old) → status = delivered
```

### 3.5 Billing
```
STK:  POST /v1/billing/invoices/:id/stk
        → DarajaClient: cached OAuth token → /mpesa/stkpush/v1/processrequest
        → Payment row (status=pending, checkoutRequestId)
      Daraja ──▶ POST /v1/webhooks/daraja/:secret/stk
        → ResultCode 0 ⇒ confirmed + applyPayment()
        → else         ⇒ failed, invoice stays open

C2B:  Daraja ──▶ POST /v1/webhooks/daraja/:secret/c2b
        → Payment row created with unique mpesaReceipt (TransID) ⇒ replay = P2002 = "Duplicate"
        → matchC2bPayment(): account ref → plate alias → payer phone + exact amount → unmatched
        → on match: applyPayment()

applyPayment(): invoice=paid, subscription period +365d, status=active, bilingual SMS receipt
```
Webhook auth is **the secret path segment only** — Daraja does not sign callbacks. Wrong secret ⇒ 404.

**Renewals scheduler** (`@Cron('0 6 * * *')` = 06:00 UTC = 09:00 EAT): for each active/grace subscription — apply state transitions (`active → grace` after expiry, `grace → suspended` after 14 days), then send T-7 / T-1 / expiry reminders and fire auto-STK on T-1 and expiry.

### 3.6 Financier batch immobilization
```
POST .../batch/flag     → creates Command(pending_confirmation) per unit, sets Loan.immobilizationFlag='flagged'
                          NEVER dispatches. Skips units with no device or no relay.
POST .../batch/confirm  → per unit: fetch position, evaluateSafety()
                            reason === 'moving' ⇒ blocked, stays queued
                            otherwise           ⇒ dispatch (GPRS or SMS), vehicle=immobilized
```

## 4. Data model

18 models, 24 enums, in `backend/prisma/schema.prisma`. Prisma uses **camelCase column names** (no `@map`), so raw SQL must quote them: `SELECT "regPlate" FROM "Vehicle"`.

### Entities and relationships
```
User ──< OrgMember >── Organization
 │                       │
 │                       ├──< Vehicle (org-owned)
 │                       ├──< Geofence
 │                       └──< Loan            (financier orgs)
 ├──< Vehicle (personally owned, ownerUserId)
 ├──< RefreshToken
 ├──< Command (as initiator / as confirmer)
 ├──< NotificationDelivery
 ├──< InstallerJob (as installer)
 └──< RecoveryLink (as creator)

Vehicle ──1:1── Device ──1:1── SimCard
   ├──< Subscription ──< Invoice ──< Payment
   ├──< Command
   ├──< Alert ──< NotificationDelivery
   ├──1:1── Loan
   ├──< InstallerJob
   ├──< RecoveryLink
   └──< VehicleGeofence >── Geofence
```

### Key models

| Model | Purpose | Notable fields / constraints |
|---|---|---|
| `User` | Person. Identity is the phone number. | `phone` **unique**, normalised `2547…`/`2541…`; `locale` (`en`/`sw`); `consentAcceptedAt` (ODPC) |
| `RefreshToken` | Rotating refresh tokens | `tokenHash` **unique** — the raw token is never stored |
| `Organization` | Fleet / SACCO / financier / insurer | `type` enum; `immobilizationPolicy` JSON |
| `OrgMember` | Membership + role | Composite PK `(orgId, userId)`; `role` enum |
| `Vehicle` | The tracked asset | `regPlate` **unique**; either `orgId` or `ownerUserId`; `status` (active/immobilized/suspended/in_recovery) |
| `Device` | Physical tracker | `imei` **unique**; `traccarDeviceId` **unique** (link to Traccar); `protocol`; `relayFitted` gates immobilization |
| `SimCard` | The SIM inside a device | `iccid`, `msisdn` unique; `bundleExpiry` |
| `Subscription` | Billing relationship | `status` (active/grace/suspended/cancelled); `currentPeriodEnd`; `autoStkEnabled` |
| `Invoice` | One renewal charge | `accountRef` **unique** — what the customer types at the PayBill (≤12 chars) |
| `Payment` | Money received | `mpesaReceipt` **unique** (C2B dedup); `checkoutRequestId` **unique** (STK dedup); `rawCallback` JSON kept immutable |
| `Command` | Immobilization audit trail | Append-only in practice. Records `initiatedById`, `confirmedById`, `positionSnapshot`, `reason`, `channel`, `safetyOverride` |
| `Alert` | Customer-meaningful event | `dedupKey` **unique** — the dedup mechanism; `repeatCount` |
| `NotificationDelivery` | One alert → one user → one channel | `costCents` for SMS accounting |
| `Geofence` | Named zone | `areaWkt`; mirrored to Traccar via `traccarGeofenceId` |
| `Loan` | Links a vehicle to a financier + borrower | `(financierOrgId, externalRef)` unique; `daysInArrears`; `immobilizationFlag` |
| `InstallerJob` | Field work order | `completionEvidence` JSON (photos, geotag, test result) |
| `RecoveryLink` | Public expiring live-location link | `token` **unique**; `expiresAt` (72h default) |

**Retention note:** positions live in Traccar's `tc_positions`, not our schema. It is the fast-growing table; partition it before scale. Our audit tables (`Command`, `Payment`) are append-only.

## 5. Auth, sessions, permissions

**Authentication:** phone + OTP. No passwords anywhere.
1. `POST /v1/auth/otp/request` — phone normalised, 6-digit code generated, hashed (SHA-256) into the in-memory store, sent via the SMS provider. 60s resend cooldown → HTTP 429.
2. `POST /v1/auth/otp/verify` — 5-min TTL, 3 attempts then locked, single-use. On success `User` is upserted and tokens issued.
3. Access token: **JWT HS256**, 15 min. Refresh token: 48 random bytes, stored **hashed**, 30 days, **rotated** on use (old one revoked).

⚠️ Production gaps: HS256 shared secret (spec calls for RS256), OTP store is in-memory (B3), no rate limiting beyond the OTP cooldown.

**Authorization — two independent layers:**
- **Ownership** (consumer paths): services check `vehicle.ownerUserId === user.id` directly, e.g. `VehiclesService.getOwned()`.
- **Org RBAC** (B2B paths): `@RequireOrgRole('financier_ops')` + `OrgRoleGuard`.

Role ranks (`orgs/roles.ts`): `owner 50 > admin 40 > manager 30 > financier_ops 20 > installer/recovery_agent 15 > viewer 10`.
**`installer` and `recovery_agent` are *lateral*** — a manager does *not* inherit them; only admin+ can override into them. This is deliberate: being senior doesn't make you a certified installer.

**Public (unauthenticated) endpoints:** `GET /v1/health`, `GET /v1/recovery/:token`, and the three Daraja webhooks (protected only by the secret path segment).

## 6. Frontend state management

**None exists.** No Flutter or React project. `prototype-v2/` is static HTML/CSS with zero JavaScript logic.

`[UNVERIFIED — a decision for whoever builds it]` The spec (doc 01/03) calls for Flutter (Android-first) and React. Recommended shape when built: server state via a query cache (Riverpod/TanStack Query), a single long-lived `/v1/stream` WebSocket per session merged into that cache, and local persistence (Drift/SQLite) so every screen renders cache-first — the app must be usable offline showing last-known positions.

## 7. Architectural decisions to preserve

| Decision | Reason | Don't do this instead |
|---|---|---|
| Traccar decodes protocols; we never do | Years of work already done, Apache 2.0 | Writing a GT06 parser |
| Backend is Traccar's only client | Single auth/RBAC boundary; users can't be given Traccar accounts | Letting the app call Traccar directly |
| Two-step immobilization + safety gate run **twice** | An engine cut is irreversible and can be dangerous | Collapsing to one step "for UX" |
| No geofence-triggered automatic engine cut | Competitors offer it; it can stop a car in traffic | Adding auto-cut because a customer asks |
| Commands are written even when blocked | The audit trail must show attempts, not just successes | Only persisting successful commands |
| Dedup via unique DB constraint | Race-safe without locks | Application-level "check then insert" |
| Money records immutable (`rawCallback` kept) | Payment disputes need the original payload | Mutating payment rows in place |
| Phone is the identity | Kenya is mobile-first; M-Pesa is keyed on phone | Email/password accounts |
| Plate is the vehicle's public identity | Matches market muscle memory (competitor research) | Internal UUIDs shown to users |
| SMS provider behind an interface | Swap providers without touching business logic | Calling Africa's Talking from services |
