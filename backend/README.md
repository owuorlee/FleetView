# FleetView backend

NestJS + TypeScript + Prisma business backend per [../01-technical-spec.md](../01-technical-spec.md). Owns auth, registries, billing, commands, alerts; consumes a self-hosted Traccar for tracking.

## Dev setup

```powershell
cd backend
npm install
copy .env.example .env          # then edit values
npm run prisma:generate
npm run dev                     # boots without DB/Traccar; health shows what's connected
```

With Docker Desktop installed, bring up PostgreSQL + Traccar and push the schema:

```powershell
cd ..\infra
docker compose up -d
cd ..\backend
npm run prisma:push             # creates tables in the "app" database
```

Then in the Traccar UI (http://localhost:8082, admin/admin → change it): Settings → Account → generate an API **token**, put it in `.env` as `TRACCAR_TOKEN`.

## Smoke test

```powershell
npm test                          # unit tests (no DB needed)
curl http://localhost:3000/v1/health
curl -X POST http://localhost:3000/v1/auth/otp/request -H "Content-Type: application/json" -d "{\"phone\":\"0712345678\"}"
# with SMS_PROVIDER=dev the OTP is printed in the server console
```

## Implemented so far (M2 foundation)

- **Auth:** `POST /v1/auth/otp/request`, `/otp/verify`, `/refresh` — phone normalization to 2547XXXXXXXX, 6-digit OTP (5-min TTL, 3 attempts, 60 s resend cooldown), JWT access (15 min) + rotating refresh tokens (hashed at rest).
- **SMS:** provider interface — `dev` (console) and `africastalking` (live), selected by env.
- **Vehicles:** `GET/POST /v1/vehicles`, `GET /v1/vehicles/:id`, `GET /v1/vehicles/:id/position` — registry with Traccar device mirroring and knots→km/h conversion.
- **Traccar:** REST client (devices, positions, commands) + resilient WebSocket subscriber exposing `positions$`/`events$` streams for the alert pipeline.
- **Schema:** full Prisma data model from spec §3 (users→recovery links).
- **Alerts (spec §6):** Traccar `events$` → rules (`alert-rules.ts`) → dedup buckets (repeat counting on the same `type:vehicle:bucket`) → fan-out: in-app always, SMS for critical types with bilingual EN/SW titles; critical alerts enriched with last-known position. `GET /v1/alerts`, `POST /v1/alerts/:id/ack`.
- **Commands (spec §5):** two-step immobilization — `POST /v1/vehicles/:id/commands/immobilize` (safety gate: blocked above 10 km/h or stale/no fix; audited even when blocked) → OTP by SMS → `POST /v1/commands/:id/confirm` (10-min window, re-runs the gate, dispatches `engineStop` over GPRS or `RELAY,1#` / `setdigout 1` by SMS fallback when offline). Single-step audited restore. `GET /v1/commands/:id` for the audit trail.

- **Billing (spec §7):** subscriptions with plan catalog (`billing-logic.ts`), renewal invoices with ≤12-char PayBill account refs, STK Push via Daraja (`daraja.client.ts` — OAuth token caching, EAT timestamps; **verified against the live sandbox 2026-07-09**), STK callback + C2B confirmation webhooks behind an unguessable secret path, three-tier C2B auto-matching (account ref → plate → phone+amount → unmatched queue), daily renewal scheduler at 09:00 EAT (T-7/T-1/expiry reminders, auto-STK, active→grace→suspended transitions), bilingual receipt/reminder SMS. One-time C2B URL registration: `npm run daraja:register-c2b`; sandbox smoke test: `npx tsx scripts/stk-smoke.ts`.

- **Organizations & RBAC (spec §2.2):** `POST/GET /v1/orgs`, member management by phone; `@RequireOrgRole` + `OrgRoleGuard` enforce a ranked role hierarchy (owner>admin>manager>viewer, with lateral installer/recovery_agent and financier_ops).
- **Financier module (spec §4.1):** org-scoped console under `/v1/orgs/:orgId/financier` — loan linking, LMS repayment import, portfolio summary (arrears buckets, online %, immobilized count), defaulters queue with per-unit safety verdicts, and the two-step batch immobilization: `batch/flag` creates `pending_confirmation` commands and **never dispatches**, `batch/confirm` re-runs the safety gate per unit and dispatches (blocking moving units). Recovery links: `POST .../recovery-link` mints an expiring token; public `GET /v1/recovery/:token` resolves it to a live position with no auth.
- **Live stream (spec §4.1):** `WS /v1/stream?token=<JWT>` — one upstream Traccar socket fanned out to many app clients, each filtered to the vehicles they own (`stream-filter.ts`). On connect the client gets a `ready` message with its vehicle list, then live `position` and `alert` messages. JWT in the query string (browsers can't set WS headers); bad/missing token → 401. 30 s ping/pong heartbeat drops dead clients.
- **Command delivery confirmation (spec §5):** `CommandDeliveryWorker` watches the position stream; when a device reports its relay/output state (`command-delivery.ts` reads Traccar's `blocked`, or Teltonika `out1`/`output`), a recently-`sent` matching command (within 30 min) is moved to `delivered` with a timestamp — closing the audit trail with real device feedback rather than optimistic dispatch.

## Verified end-to-end (local stack, 2026-07-14)

- **Full M-Pesa loop against the live Daraja sandbox + ngrok tunnel:** STK initiation → callback delivered to our webhook (200) → real sandbox returns `1037` (no handset) so payment correctly marked `failed`, invoice stays `pending`; success path proven by the exact Daraja success callback → payment `confirmed`, invoice `paid`, subscription extended a year, bilingual receipt SMS. **C2B PayBill:** confirmation POST matched by **plate alias** → invoice paid, subscription extended; replayed `TransID` deduped (`Duplicate`).
- **WebSocket stream:** client connected with JWT, received scoped `ready`, then a live position injected into Traccar (OsmAnd) arrived filtered to the owning vehicle (knots→km/h applied).
- **Command delivery:** a `sent` engine_cut, plus a `blocked=true` position injected into Traccar → the worker matched it and moved the command to `delivered` in Postgres.

## Next (build order)

1. LMS webhooks out (loan.updated, vehicle.immobilized, vehicle.recovered, payment.received).
2. Extend stream fan-out to org members (fleet/financier), not just direct owners.
3. Move OTP store + STK dedup to Redis; JWT to RS256 (spec §10) before production.
4. Begin the Flutter app (M2) against this backend.

## Test note

`npm test` uses vitest's `forks` pool (set in `vitest.config.ts`) — the default `threads` pool intermittently throws "Timeout calling fetch" on slower Windows machines.

Production notes: move JWT to RS256 keys, OTP store to Redis, and add rate limiting at Nginx per spec §10.
