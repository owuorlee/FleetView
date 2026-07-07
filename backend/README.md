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

## Next (build order)

1. Billing: subscriptions/invoices, Daraja STK + C2B webhooks (spec §7) — **re-verify Daraja endpoints on the Safaricom portal first**.
2. Organizations/RBAC beyond personal ownership; financier module (spec §4.1).
3. Client-facing live stream (`/v1/stream` WebSocket fan-out of positions).
4. Delivery confirmation for commands (watch position attributes for relay state) and vehicle `status` driven by it.

Production notes: move JWT to RS256 keys, OTP store to Redis, and add rate limiting at Nginx per spec §10.
