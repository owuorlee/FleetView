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

## Next (build order)

1. Client-facing live stream (`/v1/stream` WebSocket fan-out of positions).
2. Delivery confirmation for commands (watch position attributes for relay state) and vehicle `status` driven by it.
3. LMS webhooks out (loan.updated, vehicle.immobilized, vehicle.recovered, payment.received).
4. Callback reachability in dev: ngrok/cloudflared tunnel → set `DARAJA_CALLBACK_BASE_URL`, then test the full STK→callback→receipt loop.

## Test note

`npm test` uses vitest's `forks` pool (set in `vitest.config.ts`) — the default `threads` pool intermittently throws "Timeout calling fetch" on slower Windows machines.

Production notes: move JWT to RS256 keys, OTP store to Redis, and add rate limiting at Nginx per spec §10.
