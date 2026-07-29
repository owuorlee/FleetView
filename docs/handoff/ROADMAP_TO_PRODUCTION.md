# FleetView — Roadmap to Production

> Every remaining piece of work from 2026-07-28 to a production launch, in dependency order.
> Each task is sized for **one short agent session**. Do them in order unless `Depends on` says otherwise.
>
> **Priority:** `P0` blocks launch · `P1` should-have · `P2` post-launch.
> **`[HUMAN]`** = requires the owner (money, hardware, legal identity). An agent cannot complete these — flag and move on.
>
> **Milestones:** M0 Safety fixes → M1 Device validation → M2 Backend completion → M3 Security →
> M4 Testing & CI → M5 Mobile app → M6 Web dashboard → M7 Website → M8 Deploy & observability → M9 Launch.

---

# M0 — Make what exists safe

*These fix defects documented in `STATE_OF_PLAY.md` §3. Do them first; later work builds on them.*

### TASK-001: Add a timeout to the health check
- **Milestone:** M0 · **Priority:** P0 · **Depends on:** —
- **Why:** `/v1/health` currently hangs when Postgres is unreachable, so monitors read "down" instead of "degraded".
- **Files:** `backend/src/health/health.controller.ts`
- **Approach:** Wrap the `prisma.$queryRaw` call in `Promise.race` against a 2-second timeout that resolves `false`. Keep the existing response shape (`{status, db, traccar, time}`). Do not change the Traccar branch.
- **Acceptance:** With Postgres stopped, `GET /v1/health` returns within 3s with `"db":false` and HTTP 200.
- **Verify:** `docker stop infra-postgres-1 && time curl http://localhost:3000/v1/health` → returns <3s. Restart Postgres after.
- **Out of scope:** Adding readiness/liveness split (that is TASK-062).

### TASK-002: Replace `db push` with a real migration baseline
- **Milestone:** M0 · **Priority:** P0 · **Depends on:** —
- **Why:** `prisma db push` can silently drop columns and data. Unsafe once real customers exist.
- **Files:** `backend/prisma/migrations/**` (new), `backend/package.json`
- **Approach:** With a clean local DB, run `npx prisma migrate dev --name init` to generate the baseline migration. Replace the `prisma:push` script with `prisma:migrate` (`prisma migrate deploy` for prod, `migrate dev` for local). Update `HANDOFF.md` §5 Step 3 and `README` references.
- **Acceptance:** `prisma/migrations/` exists with an init migration; a fresh DB can be built with `npx prisma migrate deploy`; `db push` is no longer referenced in docs or scripts.
- **Verify:** `docker compose down -v && docker compose up -d && npx prisma migrate deploy && npm test` → migration applies, 87 tests pass.
- **Out of scope:** Schema changes of any kind.

### TASK-003: Fix alert fan-out for organisation-owned vehicles
- **Milestone:** M0 · **Priority:** P0 · **Depends on:** —
- **Why:** Trap T2 — every fleet/financier vehicle raises alerts that notify nobody. The whole B2B segment is silently unserved.
- **Files:** `backend/src/alerts/alerts.service.ts`, new `backend/test/alerts.service.spec.ts`
- **Approach:** In `fanOut()`, replace the `if (!vehicle.owner) return;` early return. Resolve recipients as: personal owner if present, **else** all `OrgMember` rows for `vehicle.orgId` whose role is `viewer` or higher (use `satisfiesRole` from `orgs/roles.ts`). Create one `NotificationDelivery` per recipient. Keep the existing critical-only SMS rule per recipient.
- **Acceptance:** An alert on an org-owned vehicle creates one in-app delivery per qualifying member; a personal vehicle behaves exactly as before.
- **Verify:** `npx vitest run test/alerts.service.spec.ts` — new tests cover personal-owner, org-owned-many-members, and no-recipients cases.
- **Out of scope:** Push notifications (TASK-030); per-user notification preferences (TASK-031).

### TASK-004: Scope the live stream to organisation members
- **Milestone:** M0 · **Priority:** P0 · **Depends on:** —
- **Why:** Trap T3 — fleet and financier users connect to `/v1/stream` and silently receive nothing.
- **Files:** `backend/src/stream/stream.gateway.ts`, `backend/test/stream-filter.spec.ts`
- **Approach:** In `buildScope()`, widen the query from `{ ownerUserId: userId }` to `OR: [{ ownerUserId: userId }, { org: { members: { some: { userId } } } }]`. Leave `stream-filter.ts` untouched — the filtering logic is already correct and tested.
- **Acceptance:** A user who is an org member receives that org's vehicles in the `ready` payload and gets their positions; a user with no relationship still receives an empty list.
- **Verify:** `npm test` stays green; manually connect a WS client with an org member's JWT and confirm the `ready` message lists the org's vehicles.
- **Out of scope:** Per-role filtering within an org (a viewer sees the same vehicles as an admin for now).

### TASK-005: Enforce the daily SMS cap
- **Milestone:** M0 · **Priority:** P0 · **Depends on:** TASK-003
- **Why:** Trap T4 — `SMS_DAILY_CAP_PER_VEHICLE` is declared but never used; SMS spend is unbounded.
- **Files:** `backend/src/alerts/alerts.service.ts`, `backend/test/alerts.service.spec.ts`
- **Approach:** Before sending SMS in `fanOut()`, count today's `NotificationDelivery` rows with `channel: 'sms'` for that vehicle's alerts. If `>= SMS_DAILY_CAP_PER_VEHICLE` and the alert is **not** critical, skip SMS (still write the in-app row). Critical alerts bypass the cap, per spec §6.
- **Acceptance:** The 11th non-critical SMS for a vehicle in one day is skipped; critical alerts always send.
- **Verify:** `npx vitest run test/alerts.service.spec.ts` with tests for under-cap, at-cap non-critical, and at-cap critical.
- **Out of scope:** Per-organisation monthly SMS budgets.

### TASK-006: Restrict CORS to known origins
- **Milestone:** M0 · **Priority:** P0 · **Depends on:** —
- **Why:** Trap T7 — `app.enableCors()` with no arguments allows every origin.
- **Files:** `backend/src/main.ts`, `backend/.env.example`
- **Approach:** Add `CORS_ORIGINS` (comma-separated) to env. Pass `{ origin: [...], credentials: true }`. Default to `http://localhost:5173,http://localhost:3000` when unset so local dev still works.
- **Acceptance:** A request with a disallowed `Origin` receives no permissive CORS header; allowed origins work.
- **Verify:** `curl -H "Origin: https://evil.test" -I http://localhost:3000/v1/health` → no `Access-Control-Allow-Origin: https://evil.test`.
- **Out of scope:** Full security headers (TASK-041).

### TASK-007: Add a Traccar mirror reconciliation job
- **Milestone:** M0 · **Priority:** P1 · **Depends on:** —
- **Why:** Trap T9 — if `createDevice` fails, a `Device` sits with `traccarDeviceId = null` forever and never tracks. Nothing retries or reports it.
- **Files:** new `backend/src/vehicles/traccar-reconcile.worker.ts`, `backend/src/vehicles/vehicles.module.ts`, new test
- **Approach:** A `@Cron` job (hourly) finding `Device` rows with `traccarDeviceId: null` and `status != 'retired'`; for each, attempt `traccar.createDevice()` and persist the id. Log a warning listing any still unmirrored. Imitate the scheduler pattern in `billing/renewals.scheduler.ts`.
- **Acceptance:** A device created while Traccar was down is mirrored on the next run; already-mirrored devices are untouched.
- **Verify:** Unit test with a mocked Prisma + Traccar; assert `createDevice` called only for null-id devices.
- **Out of scope:** Deleting orphaned Traccar devices.

### TASK-008: Add ESLint, Prettier and npm scripts
- **Milestone:** M0 · **Priority:** P0 · **Depends on:** —
- **Why:** No linter or formatter exists, so style drift is unpoliced and CI has nothing to run.
- **Files:** new `backend/eslint.config.mjs`, new `backend/.prettierrc`, `backend/package.json`
- **Approach:** ESLint 9 flat config with `typescript-eslint` recommended, plus Prettier. Add scripts: `"lint": "eslint src test"`, `"format": "prettier --write src test"`, `"typecheck": "tsc --noEmit"`. **Configure to match the existing style** (2-space indent, single quotes, semicolons, trailing commas) — do not reformat the codebase into a different style.
- **Acceptance:** `npm run lint` and `npm run typecheck` both exit 0 on the current codebase.
- **Verify:** `npm run lint && npm run typecheck && npm test` — all exit 0.
- **Out of scope:** Fixing pre-existing warnings by rewriting logic; if a rule is noisy, disable the rule rather than churn the code.

### TASK-009: Add a database seed script
- **Milestone:** M0 · **Priority:** P1 · **Depends on:** TASK-002
- **Why:** A fresh developer or agent has an empty DB and no way to exercise the app without hand-crafting data.
- **Files:** new `backend/prisma/seed.ts`, `backend/package.json`
- **Approach:** Idempotent (upsert) seed creating: one personal user + vehicle + device + active subscription; one financier org with two members, three loan-linked vehicles (one current, one in arrears, one in default); one installer user. Register the Prisma `seed` key in `package.json` and add `"prisma:seed": "tsx prisma/seed.ts"`.
- **Acceptance:** Running twice produces no duplicates and no errors; `GET /v1/vehicles` with the seeded user's token returns data.
- **Verify:** `npm run prisma:seed && npm run prisma:seed` → succeeds both times.
- **Out of scope:** Seeding Traccar devices or positions.

---

# M1 — Prove it on real hardware

*The single largest unvalidated assumption in this project. Cheap to resolve; do it early.*

### TASK-010: Procure test devices `[HUMAN]`
- **Milestone:** M1 · **Priority:** P0 · **Depends on:** —
- **Why:** Nothing in this system has ever spoken to a physical tracker. Every device claim is from manuals.
- **Approach:** Buy: 1× Concox GT06N (gt06/5023), 1× Teltonika FMB920 (teltonika/5027), 1× VT05S (the model competitors actually use in Kenya — protocol unverified, this is the migration test), 3× Safaricom SIMs with data bundles, 1× automotive relay + wiring. Budget ≈ KSh 25,000.
- **Acceptance:** Devices in hand with IMEIs recorded and SIMs activated.
- **Out of scope:** Bulk purchase.

### TASK-011: Write the device bring-up runbook
- **Milestone:** M1 · **Priority:** P0 · **Depends on:** —
- **Why:** Bring-up must be repeatable by installers, not rediscovered each time.
- **Files:** new `docs/DEVICE_BRINGUP.md`
- **Approach:** Distil `02-traccar-server-setup-guide.md` §8 into a single-page checklist per model: SIM prep, exact SMS command sequence, expected replies, how to confirm in Traccar, and the offline troubleshooting order (SIM data → APN → IMEI → port → GPS cold start). Include a results table to fill in.
- **Acceptance:** A technician who has never seen the project can follow it end to end.
- **Verify:** Peer-read; no step assumes prior context.
- **Out of scope:** Relay wiring instructions beyond referencing doc 02 §8.3.

### TASK-012: Validate GT06 end-to-end on real hardware `[HUMAN + agent]`
- **Milestone:** M1 · **Priority:** P0 · **Depends on:** TASK-010, TASK-011
- **Why:** Confirms the entire ingest path with a real device, not an HTTP simulation.
- **Approach:** Point the GT06N at the dev server (public IP or tunnel, port 5023). Register the IMEI via `POST /v1/vehicles`. Confirm: device appears online in Traccar; positions flow to `/v1/stream`; ignition and power-cut events raise alerts.
- **Acceptance:** A real position from a real device is visible via `GET /v1/vehicles/:id/position`, and a power-cut alert fires when the device is unplugged.
- **Verify:** Record actual results in `docs/DEVICE_BRINGUP.md` and `PROGRESS_LOG.md`.
- **Out of scope:** Relay/immobilization (TASK-013).

### TASK-013: Validate immobilization on a real vehicle `[HUMAN + agent]`
- **Milestone:** M1 · **Priority:** P0 · **Depends on:** TASK-012
- **Why:** The relay path is the highest-liability feature and is entirely unproven.
- **Approach:** With a qualified auto-electrician, fit a relay per doc 02 §8.3 (normally-closed, fuel pump or starter). With the **engine off**, run `immobilize` → confirm → observe the device report `blocked=true` → confirm the command flips to `delivered` → restore → confirm the vehicle starts.
- **Acceptance:** Full cycle works over GPRS; command status reaches `delivered` from real device feedback.
- **Verify:** Record command IDs and timings in `PROGRESS_LOG.md`.
- **Out of scope:** Testing at speed — **never** test cut-off on a moving vehicle.

### TASK-014: Validate the SMS fallback path `[HUMAN + agent]`
- **Milestone:** M1 · **Priority:** P0 · **Depends on:** TASK-013, TASK-036
- **Why:** `command-dispatch.ts` SMS strings come from manuals; no SMS has ever been sent.
- **Approach:** With Africa's Talking live, take the device offline (remove data bundle), issue an immobilize, and confirm the SMS reaches the tracker SIM and the relay actuates.
- **Acceptance:** `RELAY,1#` (GT06) actuates the relay; command records `channel: 'sms_fallback'`.
- **Verify:** Log the exact sent string and device behaviour.
- **Out of scope:** Teltonika SMS syntax if no Teltonika unit is available — record as untested.

### TASK-015: Test whether a competitor device can be adopted `[HUMAN + agent]`
- **Milestone:** M1 · **Priority:** P1 · **Depends on:** TASK-010
- **Why:** Determines whether "keep your tracker, switch platform" — the core migration offer in doc 05 — is real. VT05S is not in Traccar's supported list by name.
- **Approach:** Send the re-point sequence to the VT05S (try xexun-style `adminip<pw> <IP> <PORT>` per doc 05 §6.1, then GT06-style). Watch `docker logs infra-traccar-1` and the Traccar log for "unknown device" lines revealing the protocol.
- **Acceptance:** A documented yes/no per model, with the working command sequence if yes.
- **Verify:** Update `05-competitive-analysis.md` §6.1 with the real result.
- **Out of scope:** Building the switch onboarding UI (TASK-071).

---

# M2 — Complete the backend

### TASK-016: Geofences module — CRUD
- **Milestone:** M2 · **Priority:** P0 · **Depends on:** TASK-002
- **Why:** `Geofence` exists in the schema with **zero code**. Customers cannot create a zone — a core parity feature.
- **Files:** new `backend/src/geofences/{geofences.module.ts,geofences.controller.ts,geofences.service.ts,dto.ts}`, `backend/src/app.module.ts`
- **Approach:** Copy the structure of `src/orgs/`. Endpoints: `GET/POST /v1/geofences`, `PATCH/DELETE /v1/geofences/:id`. Store `areaWkt` (`CIRCLE (lat lon radius)` or `POLYGON ((...))`). Scope by org membership or personal ownership, mirroring `VehiclesService.getOwned()`.
- **Acceptance:** A user can create, list, edit and delete their own geofences and cannot see others'.
- **Verify:** New `test/geofences.service.spec.ts` covering ownership isolation; `npm test` green.
- **Out of scope:** Traccar mirroring (TASK-017); vehicle assignment (TASK-018).

### TASK-017: Mirror geofences into Traccar
- **Milestone:** M2 · **Priority:** P0 · **Depends on:** TASK-016
- **Why:** Traccar computes entry/exit events; a geofence that only exists in our DB produces no alerts.
- **Files:** `backend/src/traccar/traccar.client.ts`, `backend/src/geofences/geofences.service.ts`
- **Approach:** Add `createGeofence`/`updateGeofence`/`deleteGeofence` to `TraccarClient` (`/api/geofences`), imitating `createDevice`. Persist `traccarGeofenceId`. Handle failure the same way device mirroring does — log and continue, leaving the id null for the reconciler.
- **Acceptance:** Creating a geofence produces a matching Traccar geofence; deleting removes it.
- **Verify:** Create one, then `curl -H "Authorization: Bearer $TRACCAR_TOKEN" http://localhost:8082/api/geofences`.
- **Out of scope:** Schedule/restricted-hours logic.

### TASK-018: Assign geofences to vehicles
- **Milestone:** M2 · **Priority:** P0 · **Depends on:** TASK-017
- **Why:** `VehicleGeofence` exists with no code; without a link, Traccar won't evaluate the zone for that device.
- **Files:** `backend/src/geofences/geofences.{controller,service}.ts`, `backend/src/traccar/traccar.client.ts`
- **Approach:** `POST/DELETE /v1/geofences/:id/vehicles/:vehicleId`. Write the `VehicleGeofence` row **and** call Traccar's `/api/permissions` to link `deviceId` ↔ `geofenceId`.
- **Acceptance:** Linking makes Traccar emit `geofenceEnter/Exit` for that device; unlinking stops it.
- **Verify:** Link, then inject a position inside the zone and confirm an alert row appears.
- **Out of scope:** Bulk assignment UI.

### TASK-019: Expose trip history and route playback
- **Milestone:** M2 · **Priority:** P0 · **Depends on:** —
- **Why:** `TraccarClient.route()` exists but **no endpoint calls it**. Trip playback (≥90 days) is a headline parity feature and is currently unreachable.
- **Files:** `backend/src/vehicles/vehicles.{controller,service}.ts`, `backend/src/traccar/traccar.client.ts`
- **Approach:** Add `GET /v1/vehicles/:id/route?from&to` (raw polyline) and `GET /v1/vehicles/:id/trips?from&to` (Traccar `/api/reports/trips`). Enforce ownership via `getOwned()`. Convert knots→km/h with `TraccarClient.speedKmh`. Cap the range at 31 days and return 400 beyond it.
- **Acceptance:** Both endpoints return data for an owned vehicle, 403 for another user's, 400 for a >31-day range.
- **Verify:** Unit tests with a mocked Traccar client; manual curl against seeded data.
- **Out of scope:** Server-side polyline thinning (TASK-020).

### TASK-020: Add data-saver polyline thinning
- **Milestone:** M2 · **Priority:** P1 · **Depends on:** TASK-019
- **Why:** Spec §4.2 promises thinned routes for low-data users; boda riders are on metered 3G.
- **Files:** new `backend/src/vehicles/route-thinning.ts`, `vehicles.service.ts`, new test
- **Approach:** Implement Douglas–Peucker as a pure function. Apply when the request carries `X-Data-Saver: 1`. Keep first and last points always.
- **Acceptance:** A 1,000-point route reduces materially with the header set and is unchanged without it.
- **Verify:** Unit tests for the pure function (straight line collapses to 2 points; endpoints preserved).
- **Out of scope:** Compression/gzip config.

### TASK-021: SIM cards module
- **Milestone:** M2 · **Priority:** P1 · **Depends on:** TASK-002
- **Why:** `SimCard` has zero code, so `Device.simCardId` can never be set — which means **the SMS fallback path can never find a number to text**.
- **Files:** new `backend/src/sims/{sims.module.ts,sims.controller.ts,sims.service.ts,dto.ts}`, `app.module.ts`
- **Approach:** Admin-scoped CRUD: `GET/POST /v1/admin/sims`, `PATCH /v1/admin/sims/:id`, plus `POST /v1/admin/sims/:id/attach` to bind a SIM to a device. Validate MSISDN with `normalizePhone` from `common/phone.ts`.
- **Acceptance:** A SIM can be registered and attached; `Device.simCardId` is populated; attaching an already-attached SIM returns 409.
- **Verify:** New spec file; `npm test` green.
- **Out of scope:** Bundle-expiry alerting (TASK-022).

### TASK-022: SIM bundle expiry sweep
- **Milestone:** M2 · **Priority:** P2 · **Depends on:** TASK-021
- **Why:** An expired data bundle is the #1 cause of "device offline" (doc 02 §11).
- **Files:** new `backend/src/sims/sim-expiry.worker.ts`, test
- **Approach:** Daily `@Cron` flagging SIMs with `bundleExpiry` within 7 days; log a report. Imitate `renewals.scheduler.ts`.
- **Acceptance:** SIMs expiring within 7 days appear in the log; others don't.
- **Verify:** Unit test with fixed dates.
- **Out of scope:** Auto-purchasing bundles.

### TASK-023: Installer jobs module
- **Milestone:** M2 · **Priority:** P1 · **Depends on:** TASK-002
- **Why:** `InstallerJob` has zero code; the installer app (M5) has no API to call.
- **Files:** new `backend/src/installer/{installer.module.ts,installer.controller.ts,installer.service.ts,dto.ts}`, `app.module.ts`
- **Approach:** `GET /v1/installer/jobs` (jobs assigned to the caller), `POST /v1/installer/jobs` (admin creates), `PATCH /v1/installer/jobs/:id` (status), `POST /v1/installer/jobs/:id/complete` (accepts `completionEvidence` JSON). Guard with `@RequireOrgRole('installer')` where org-scoped. **Reject completion unless the evidence includes a passed cut/restore test** — mirror the safety stance in `commands`.
- **Acceptance:** An installer sees only their jobs; completion without a passed test returns 409.
- **Verify:** New spec file covering the blocked-completion rule.
- **Out of scope:** Photo upload/storage (TASK-024).

### TASK-024: File upload for installer evidence
- **Milestone:** M2 · **Priority:** P2 · **Depends on:** TASK-023
- **Why:** Install photos are the proof of work and the defence in a liability dispute.
- **Files:** `backend/src/installer/*`, `backend/.env.example`
- **Approach:** Presigned-URL upload to S3-compatible storage (e.g. Backblaze B2). Store only the object key in `completionEvidence`. Never proxy file bytes through the API.
- **Acceptance:** An installer can request a presigned URL and the stored key resolves.
- **Verify:** Integration test against a local MinIO container, or document as untested if none available.
- **Out of scope:** Image resizing.

### TASK-025: Vehicle update and decommission endpoints
- **Milestone:** M2 · **Priority:** P0 · **Depends on:** —
- **Why:** Only list/create/get/position exist. A customer cannot correct a plate or retire a vehicle, and `TraccarClient.disableDevice()` is dead code.
- **Files:** `backend/src/vehicles/{vehicles.controller.ts,vehicles.service.ts,dto.ts}`
- **Approach:** `PATCH /v1/vehicles/:id` (plate, makeModel, type) and `DELETE /v1/vehicles/:id` → set `status` and `Device.status = 'retired'`, call `disableDevice()`. Soft delete only — never hard-delete a vehicle with commands or payments attached.
- **Acceptance:** Patch updates fields; delete retires and disables in Traccar; a retired vehicle no longer appears in the default list.
- **Verify:** New tests; confirm the Traccar device shows `disabled`.
- **Out of scope:** Transferring a vehicle between owners.

### TASK-026: Reports module — summary reports
- **Milestone:** M2 · **Priority:** P0 · **Depends on:** TASK-019
- **Why:** Every competitor ships ~10 report types; we have none. Fleet buyers will not switch without them.
- **Files:** new `backend/src/reports/{reports.module.ts,reports.controller.ts,reports.service.ts,dto.ts}`, `app.module.ts`
- **Approach:** `GET /v1/reports/summary?vehicleIds&from&to` → distance, max/avg speed, engine hours, stop count, via Traccar `/api/reports/summary`. Also `/v1/reports/trips` and `/v1/reports/stops`. Enforce a 31-day cap and ownership scoping.
- **Acceptance:** Returns per-vehicle rows for owned vehicles only.
- **Verify:** New spec file with a mocked Traccar client.
- **Out of scope:** Export (TASK-027), scheduling (TASK-028), driver behaviour (TASK-029).

### TASK-027: CSV/Excel report export
- **Milestone:** M2 · **Priority:** P0 · **Depends on:** TASK-026
- **Why:** Verified competitor weakness — theirs email a blank page. Direct download is a cheap win.
- **Files:** `backend/src/reports/reports.controller.ts`, new `backend/src/reports/csv.ts`
- **Approach:** Add `?format=csv`, set `Content-Type: text/csv` and `Content-Disposition: attachment`. Write a small CSV serialiser (escape quotes/commas/newlines) — **do not add a dependency** for this.
- **Acceptance:** `?format=csv` downloads a valid file that opens in Excel; values containing commas are correctly quoted.
- **Verify:** Unit test the serialiser with awkward values.
- **Out of scope:** PDF export (P2).

### TASK-028: Scheduled report delivery
- **Milestone:** M2 · **Priority:** P1 · **Depends on:** TASK-027
- **Why:** Competitors offer scheduled/emailed reports; fleet managers rely on them monthly.
- **Files:** new `backend/src/reports/report-schedule.worker.ts`, schema addition, migration
- **Approach:** New `ReportSchedule` model (owner, type, cadence, recipients, format). Daily cron generating due reports. Email requires an SMTP/provider decision — if none, deliver via a signed download link over SMS and record the limitation.
- **Acceptance:** A daily schedule produces one delivery per day.
- **Verify:** Unit tests with fixed clocks.
- **Out of scope:** A rich email template system.

### TASK-029: Driver behaviour events
- **Milestone:** M2 · **Priority:** P1 · **Depends on:** TASK-026
- **Why:** Parity for fleets and the enabler for insurer partnerships (doc 04 GTM #5).
- **Files:** `backend/src/alerts/alert-rules.ts`, `backend/src/reports/reports.service.ts`
- **Approach:** Map Traccar's `deviceMoving`/`accident`/harsh-driving attributes into alert types; aggregate counts per driver/vehicle in reports. **Device-dependent** — record which models actually emit these.
- **Acceptance:** Harsh events appear as alerts and aggregate in reports where the device supports them.
- **Verify:** Unit tests for rule mapping.
- **Out of scope:** A scoring algorithm.

### TASK-030: Push notifications via FCM
- **Milestone:** M2 · **Priority:** P0 · **Depends on:** TASK-003
- **Why:** The product's headline promise is fast alerts. Today only SMS exists — expensive and rate-limited.
- **Files:** new `backend/src/push/{push.module.ts,fcm.provider.ts}`, `alerts.service.ts`, schema (`DeviceToken` model), `.env.example`
- **Approach:** Mirror the SMS provider seam exactly: a `PushProvider` interface with `dev` (console) and `fcm` implementations selected by env. New `DeviceToken` model (userId, token, platform). Register `POST /v1/me/device-tokens`. Call push before SMS in `fanOut()`.
- **Acceptance:** With `PUSH_PROVIDER=dev`, an alert logs a push payload per registered token.
- **Verify:** New spec file; `npm test` green.
- **Out of scope:** iOS/APNs.

### TASK-031: Per-user notification preferences
- **Milestone:** M2 · **Priority:** P1 · **Depends on:** TASK-030
- **Why:** Spec §4.1 promises a per-type channel matrix and quiet hours; alert fatigue is a real churn driver.
- **Files:** schema (`NotificationPreference`), new endpoints on a `me` controller, `alerts.service.ts`
- **Approach:** `GET/PUT /v1/me/notification-prefs`. Matrix of alert type → {push, sms, off} plus quiet hours. **Critical severity always bypasses quiet hours** — enforce in code, not config.
- **Acceptance:** Muting a type stops non-critical delivery; critical still delivers during quiet hours.
- **Verify:** Unit tests for the bypass rule.
- **Out of scope:** Per-vehicle preferences.

### TASK-032: Unmatched payment resolution endpoint
- **Milestone:** M2 · **Priority:** P0 · **Depends on:** —
- **Why:** C2B payments that don't match land in `status: 'unmatched'` with **no way to resolve them**. That is a customer who paid and stays suspended.
- **Files:** `backend/src/billing/{billing.controller.ts,billing.service.ts}`
- **Approach:** `GET /v1/admin/payments/unmatched` and `POST /v1/admin/payments/:id/match` (body `{invoiceId}`) → set `matchedBy: 'manual'`, then reuse the existing private `applyPayment()`. Guard as admin-only.
- **Acceptance:** Manually matching a payment marks the invoice paid and extends the subscription.
- **Verify:** New spec file asserting `applyPayment` behaviour.
- **Out of scope:** Refunds.

### TASK-033: Idempotency keys on mutating endpoints
- **Milestone:** M2 · **Priority:** P1 · **Depends on:** —
- **Why:** Spec §4.2 requires it; a retried STK request currently creates a duplicate `Payment`.
- **Files:** new `backend/src/common/idempotency.interceptor.ts`, schema (`IdempotencyKey`), billing + commands controllers
- **Approach:** Interceptor reading the `Idempotency-Key` header; store key → response hash; replay the stored response on repeat. Apply to STK initiation and immobilize request only.
- **Acceptance:** Two identical POSTs with the same key produce one side effect and identical responses.
- **Verify:** Unit test the interceptor.
- **Out of scope:** Applying it to every endpoint.

### TASK-034: Recovery link revoke endpoint
- **Milestone:** M2 · **Priority:** P1 · **Depends on:** —
- **Why:** `RecoveryLinkStatus.revoked` exists in the schema but nothing can set it — a shared live-location link cannot be withdrawn.
- **Files:** `backend/src/financier/{financier.controller.ts,financier.service.ts}`
- **Approach:** `POST /v1/orgs/:orgId/financier/recovery-link/:id/revoke`. Also add a personal-owner equivalent so consumers can revoke their own shares.
- **Acceptance:** A revoked token returns 404 from the public resolver.
- **Verify:** Test asserting revoked links resolve to 404.
- **Out of scope:** Link access logs.

### TASK-035: Outbound webhooks to financier loan systems
- **Milestone:** M2 · **Priority:** P1 · **Depends on:** —
- **Why:** Financier integration is inbound-only; doc 01 §4.1 promises `loan.updated`, `vehicle.immobilized`, `vehicle.recovered`, `payment.received`.
- **Files:** new `backend/src/webhooks/{webhooks.module.ts,webhook-dispatcher.service.ts}`, schema (`WebhookEndpoint`, `WebhookDelivery`)
- **Approach:** Registered endpoints per org; HMAC-SHA256 signature header; exponential-backoff retry (5 attempts) with deliveries recorded. Emit from the financier and billing services.
- **Acceptance:** A registered endpoint receives a signed POST on immobilization; failures retry and are visible.
- **Verify:** Unit tests for signing and retry scheduling.
- **Out of scope:** A webhook management UI.

### TASK-036: Wire up Africa's Talking for real `[HUMAN + agent]`
- **Milestone:** M2 · **Priority:** P0 · **Depends on:** —
- **Why:** Trap T5 — the AT provider has **never executed**. Every OTP and alert currently goes to a log file.
- **Files:** `backend/.env`, `backend/src/sms/africas-talking.provider.ts`
- **Approach:** `[HUMAN]` create an Africa's Talking account, obtain API key, register a sender ID with Kenyan networks (this takes days — start early). Then set `SMS_PROVIDER=africastalking` and send one real OTP end to end. Fix whatever the real API rejects.
- **Acceptance:** A real SMS arrives on a real handset with the correct sender ID.
- **Verify:** Record the message ID and delivery status in `PROGRESS_LOG.md`.
- **Out of scope:** Delivery-report webhooks (TASK-037).

### TASK-037: SMS delivery reports and OTP monitoring
- **Milestone:** M2 · **Priority:** P1 · **Depends on:** TASK-036
- **Why:** Verified competitor complaint #2 is *"I don't get the OTP"* — being locked out of your own anti-theft product. If OTP is our front door, we must know when it fails.
- **Files:** new AT delivery-report webhook, `NotificationDelivery` status updates, alerting
- **Approach:** Register AT's delivery-report callback; update `NotificationDelivery.status`. Add a scheduled check that logs an error if OTP delivery success drops below 90% in an hour.
- **Acceptance:** Delivery status transitions to `delivered`/`failed` from real callbacks.
- **Verify:** Simulate a callback payload in a unit test.
- **Out of scope:** A second SMS provider for failover.

---

# M3 — Security and hardening

### TASK-038: Move JWT to RS256
- **Milestone:** M3 · **Priority:** P0 · **Depends on:** —
- **Why:** Spec §10 requires it. HS256 means anything that can verify a token can also mint one.
- **Files:** `backend/src/auth/auth.module.ts`, `.env.example`, `HANDOFF.md`
- **Approach:** Generate an RSA keypair; add `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` (PEM, base64-encoded in env). Configure `signOptions.algorithm = 'RS256'`. Keep TTLs unchanged.
- **Acceptance:** Tokens verify with the public key only; a token signed with the old secret is rejected.
- **Verify:** `npm test` green; decode a token and confirm `alg: RS256`.
- **Out of scope:** Key rotation tooling.

### TASK-039: Move the OTP store to Redis
- **Milestone:** M3 · **Priority:** P0 · **Depends on:** —
- **Why:** Bug B3 — in-memory OTPs die on restart and break with more than one instance, which blocks horizontal scaling entirely.
- **Files:** `backend/src/auth/otp.store.ts`, `infra/docker-compose.yml`, `.env.example`
- **Approach:** Keep the **exact public interface** (`issue`, `verify`) so `auth.service.ts` and `commands.service.ts` are untouched and the 5 existing tests still pass. Back it with Redis `SETEX`. Add a Redis service to compose.
- **Acceptance:** OTPs survive a restart; existing tests pass unchanged.
- **Verify:** `npm test`; request an OTP, restart the server, verify the code still works.
- **Out of scope:** Redis for caching anything else.

### TASK-040: Rate limiting
- **Milestone:** M3 · **Priority:** P0 · **Depends on:** TASK-039
- **Why:** Spec §4.2 specifies limits; only the 60s OTP cooldown exists. OTP endpoints are an SMS-cost DoS vector.
- **Files:** `backend/src/app.module.ts`, controllers
- **Approach:** Add `@nestjs/throttler` with Redis storage. Global 100 req/min/IP; OTP request 3/phone/10 min; command endpoints 10/user/hour.
- **Acceptance:** Exceeding a limit returns 429; normal use is unaffected.
- **Verify:** Loop 5 OTP requests for one phone → the 4th returns 429.
- **Out of scope:** Nginx-level limiting (TASK-060).

### TASK-041: Security headers
- **Milestone:** M3 · **Priority:** P0 · **Depends on:** TASK-006
- **Why:** No security headers are set at all.
- **Files:** `backend/src/main.ts`
- **Approach:** Add `helmet` with sensible defaults; disable CSP on the API (it serves JSON) but keep HSTS, `noSniff`, frame-guard, and referrer policy.
- **Acceptance:** Responses carry HSTS, `X-Content-Type-Options`, and frame-ancestors protection.
- **Verify:** `curl -I http://localhost:3000/v1/health` shows the headers.
- **Out of scope:** CSP for the web dashboard (TASK-067).

### TASK-042: Validate Daraja callbacks by source IP
- **Milestone:** M3 · **Priority:** P1 · **Depends on:** —
- **Why:** Callbacks are protected only by a secret path segment; anyone who learns it can forge a payment.
- **Files:** `backend/src/billing/billing.controller.ts`, `.env.example`
- **Approach:** Add `DARAJA_ALLOWED_IPS`; check `X-Forwarded-For`/`req.ip` against it and 404 on mismatch. Leave empty in dev to disable the check.
- **Acceptance:** Requests from disallowed IPs get 404 when the list is set.
- **Verify:** Unit/e2e test with a spoofed header.
- **Out of scope:** mTLS.

### TASK-043: Boundary input-validation audit
- **Milestone:** M3 · **Priority:** P0 · **Depends on:** —
- **Why:** Some route params (`:id`, `:orgId`, `:token`) are used unvalidated; malformed UUIDs reach Prisma.
- **Files:** all `*.controller.ts`
- **Approach:** Add `ParseUUIDPipe` to UUID params; explicitly validate `:token` and `:secret` as opaque strings with a length cap. Confirm every `@Body()` has a DTO — the global `ValidationPipe` already uses `whitelist` + `forbidNonWhitelisted`.
- **Acceptance:** A malformed UUID returns 400, not a 500 from Prisma.
- **Verify:** `curl http://localhost:3000/v1/vehicles/not-a-uuid -H "Authorization: Bearer $T"` → 400.
- **Out of scope:** Changing DTO shapes.

### TASK-044: Structured logging with request correlation
- **Milestone:** M3 · **Priority:** P0 · **Depends on:** —
- **Why:** Logs are unstructured Nest defaults; production incidents can't be traced across a request.
- **Files:** `backend/src/main.ts`, new `backend/src/common/logging.interceptor.ts`
- **Approach:** JSON logs in production (`pino` or Nest's logger with a JSON formatter). Generate a request id, attach to every log line, return it as `X-Request-Id`. **Never log OTP codes, tokens, or `rawCallback` contents.**
- **Acceptance:** Logs are one JSON object per line with a correlation id; no secrets present.
- **Verify:** Trigger an error and confirm the id appears in both the log and the response.
- **Out of scope:** Shipping logs off-host (TASK-063).

### TASK-045: Global exception filter
- **Milestone:** M3 · **Priority:** P0 · **Depends on:** TASK-044
- **Why:** Unhandled errors currently leak stack traces (observed: a Prisma connection error rendered a full trace).
- **Files:** new `backend/src/common/all-exceptions.filter.ts`, `main.ts`
- **Approach:** Catch-all filter → RFC 7807 `problem+json` (`{type,title,status,detail,traceId}`) per spec §4.2. Log the full error server-side; return a generic message for 5xx. Preserve existing `HttpException` messages for 4xx.
- **Acceptance:** A forced 500 returns no stack trace but logs one with the request id.
- **Verify:** Stop Postgres and hit an endpoint → clean JSON error.
- **Out of scope:** Changing existing 4xx messages.

### TASK-046: Dependency and secret audit
- **Milestone:** M3 · **Priority:** P0 · **Depends on:** —
- **Why:** `npm audit` has never been run; `.env` has been shared in chat during development.
- **Files:** `backend/package.json`, `.env`
- **Approach:** Run `npm audit`; fix high/critical only. `[HUMAN]` rotate every credential that has ever appeared in chat or a screenshot: Daraja consumer key/secret, ngrok token, Traccar token, JWT secret. Confirm `git log -p -- backend/.env` returns nothing.
- **Acceptance:** No high/critical advisories; all shared credentials rotated.
- **Verify:** `npm audit --audit-level=high` exits 0.
- **Out of scope:** Major version upgrades.

---

# M4 — Testing and CI

### TASK-047: Integration test harness with a real database
- **Milestone:** M4 · **Priority:** P0 · **Depends on:** TASK-002
- **Why:** All 87 tests mock Prisma. Nothing verifies that a query, constraint or migration actually works.
- **Files:** new `backend/test/integration/setup.ts`, `vitest.config.ts`
- **Approach:** Separate `integration` project in vitest config pointing at a disposable Postgres (Testcontainers, or a compose-managed `app_test` DB). Run migrations before the suite, truncate between tests. Keep unit tests fast and separate: `npm test` (unit) vs `npm run test:integration`.
- **Acceptance:** An integration test creating a user and vehicle against a real DB passes.
- **Verify:** `npm run test:integration` exits 0.
- **Out of scope:** Converting existing unit tests.

### TASK-048: Integration tests for auth and vehicles
- **Milestone:** M4 · **Priority:** P0 · **Depends on:** TASK-047
- **Why:** These paths carry unique constraints and ownership rules that unit tests with mocks cannot prove.
- **Files:** new `backend/test/integration/{auth,vehicles}.int.spec.ts`
- **Approach:** Boot the Nest app with `Test.createTestingModule`, use supertest. Cover: OTP → JWT; duplicate plate → 409; duplicate IMEI → 409; another user's vehicle → 403.
- **Acceptance:** All pass against a real DB.
- **Verify:** `npm run test:integration`.
- **Out of scope:** Traccar integration (mock the client).

### TASK-049: Integration tests for billing webhooks
- **Milestone:** M4 · **Priority:** P0 · **Depends on:** TASK-047
- **Why:** Money handling depends on unique-constraint dedup that only a real DB enforces.
- **Files:** new `backend/test/integration/billing.int.spec.ts`
- **Approach:** POST a C2B callback → assert invoice paid and period extended. POST the same `TransID` again → assert `Duplicate` and no second payment. Wrong secret → 404. Test all three matching tiers.
- **Acceptance:** Replay protection and matching verified against a real DB.
- **Verify:** `npm run test:integration`.
- **Out of scope:** Calling the real Daraja API.

### TASK-050: Guard and RBAC tests
- **Milestone:** M4 · **Priority:** P0 · **Depends on:** TASK-047
- **Why:** `JwtAuthGuard` and `OrgRoleGuard` are completely untested and are the entire authorization surface.
- **Files:** new `backend/test/integration/rbac.int.spec.ts`
- **Approach:** For each protected route: no token → 401; valid token, wrong org → 403; insufficient role → 403; sufficient role → 200. Include the lateral installer/recovery_agent cases.
- **Acceptance:** Every protected endpoint has at least one negative authorization test.
- **Verify:** `npm run test:integration`.
- **Out of scope:** Load testing.

### TASK-051: CI pipeline
- **Milestone:** M4 · **Priority:** P0 · **Depends on:** TASK-008, TASK-047
- **Why:** No CI exists; nothing prevents a broken commit reaching `main`.
- **Files:** new `.github/workflows/ci.yml`
- **Approach:** On push/PR: Node 24, `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, then `npm run test:integration` with a Postgres service container. Cache npm.
- **Acceptance:** The workflow passes on `main` and fails on a deliberately broken test.
- **Verify:** Push a branch and observe the run.
- **Out of scope:** Deployment (TASK-061).

---

# M5 — Mobile app (Flutter, Android-first)

> Nothing exists. Design is specified in `06-design-system-and-interfaces.md`; mockups in `prototype-v2/app-owner.html`.

### TASK-052: Scaffold the Flutter project
- **Milestone:** M5 · **Priority:** P0 · **Depends on:** —
- **Why:** No app project exists.
- **Files:** new `mobile/`
- **Approach:** `flutter create --org ke.fleetview --platforms android mobile`. Add: `dio` (HTTP), `riverpod` (state), `go_router`, `drift` + `sqlite3_flutter_libs` (offline cache), `web_socket_channel`, `flutter_localizations`. Set `minSdkVersion 24`. Commit the lockfile.
- **Acceptance:** `flutter build apk --debug` succeeds.
- **Verify:** `cd mobile && flutter analyze && flutter build apk --debug`.
- **Out of scope:** Any screens.

### TASK-053: Port the design tokens into Flutter
- **Milestone:** M5 · **Priority:** P0 · **Depends on:** TASK-052
- **Why:** The design system must be defined once, not re-invented per screen.
- **Files:** new `mobile/lib/theme/{colors.dart,typography.dart,theme.dart}`
- **Approach:** Transcribe the palette and type scale from `prototype-v2/tokens.css` (petrol/plate/sodium/live/alarm/hazard). Bundle Big Shoulders Display + IBM Plex Sans/Mono as local assets (do **not** fetch from a CDN — APK size and offline). Build a light `ThemeData` for consumer screens.
- **Acceptance:** A demo screen renders correct colours and fonts offline.
- **Verify:** `flutter analyze`; screenshot the demo screen.
- **Out of scope:** Dark theme (consoles are web-only).

### TASK-054: Build the plate block widget
- **Milestone:** M5 · **Priority:** P0 · **Depends on:** TASK-053
- **Why:** It is the design signature and appears on nearly every screen.
- **Files:** new `mobile/lib/widgets/plate_block.dart`, widget test
- **Approach:** Reusable widget taking `plate` and `status`; renders the plate face with a status strip. Support sm/md/lg sizes. Status must **never** be conveyed by colour alone — pair with a label elsewhere in the row.
- **Acceptance:** Renders correctly for all four statuses and long plates without overflow.
- **Verify:** `flutter test test/widgets/plate_block_test.dart`.
- **Out of scope:** Animation.

### TASK-055: API client and auth flow
- **Milestone:** M5 · **Priority:** P0 · **Depends on:** TASK-052
- **Why:** Every screen needs authenticated access; token refresh must be automatic.
- **Files:** new `mobile/lib/api/{client.dart,auth_repository.dart}`, `mobile/lib/screens/onboarding/`
- **Approach:** Dio with an interceptor attaching the access token and transparently refreshing on 401 (single-flight — do not fire parallel refreshes). Store tokens in `flutter_secure_storage`. Screens: phone entry → OTP entry (auto-read via SMS Retriever if simple) → name/consent.
- **Acceptance:** A user can sign in and the session survives an app restart.
- **Verify:** Run against the local backend with `SMS_PROVIDER=dev`, reading the OTP from the server log.
- **Out of scope:** Biometric unlock.

### TASK-056: Home screen — vehicle list
- **Milestone:** M5 · **Priority:** P0 · **Depends on:** TASK-054, TASK-055
- **Why:** The core screen: "is my vehicle where it should be?" answered in under a second.
- **Files:** new `mobile/lib/screens/home/`
- **Approach:** Match `prototype-v2/app-owner.html` — plate block, status chip, place name, time since fix, renewal banner. **Render from cache first**, then refresh. Explicit loading, empty, error and offline states — offline shows cached data with an "as at" age, never an error page.
- **Acceptance:** All four states render; touch targets ≥ 48px.
- **Verify:** Widget tests per state; manual run against the seeded backend.
- **Out of scope:** Live map (TASK-057).

### TASK-057: Live map with the WebSocket stream
- **Milestone:** M5 · **Priority:** P0 · **Depends on:** TASK-056, TASK-004
- **Why:** Live tracking is the product.
- **Files:** new `mobile/lib/screens/map/`, `mobile/lib/api/stream_client.dart`
- **Approach:** `flutter_map` with OSM tiles (licensing-friendly, cacheable). One WS connection per session to `/v1/stream?token=`, auto-reconnect with backoff. Show the visible refresh indicator (a convention switchers expect). Fall back to 30s polling on a metered connection.
- **Acceptance:** Marker moves on live positions; reconnects after airplane-mode toggle; shows last-known position when offline.
- **Verify:** Manual test injecting positions into Traccar.
- **Out of scope:** Trip playback (TASK-058).

### TASK-058: Trip history and playback
- **Milestone:** M5 · **Priority:** P1 · **Depends on:** TASK-057, TASK-019
- **Why:** Parity feature (≥90 days) that customers check after a dispute or a theft.
- **Files:** new `mobile/lib/screens/trips/`
- **Approach:** Day picker → trip list → tap for a polyline with a play/scrub control. Send `X-Data-Saver: 1` when the user enables data saver.
- **Acceptance:** Trips load for a chosen day; playback animates; empty days show an empty state.
- **Verify:** Manual against seeded data.
- **Out of scope:** Export.

### TASK-059: Immobilize and restore flow
- **Milestone:** M5 · **Priority:** P0 · **Depends on:** TASK-057
- **Why:** The highest-stakes user action in the product.
- **Files:** new `mobile/lib/screens/immobilize/`
- **Approach:** Follow `prototype-v2/app-owner.html` exactly: intent screen showing the live safety verdict → blocked screen if moving (explain why, offer "notify me when stopped") → confirm sheet with reason + PIN + slide-to-confirm → live status trail. **Never** put engine cut on the home screen. Restore is single-step but confirmed.
- **Acceptance:** A blocked (moving) vehicle cannot be cut from the UI; a successful cut shows delivery status.
- **Verify:** Manual against a device reporting >10 km/h and stationary.
- **Out of scope:** Financier batch flows (web only).

### TASK-060: Alerts inbox and push registration
- **Milestone:** M5 · **Priority:** P0 · **Depends on:** TASK-030, TASK-056
- **Why:** Alerts are why people buy this.
- **Files:** new `mobile/lib/screens/alerts/`, FCM setup
- **Approach:** Register the FCM token after login (`POST /v1/me/device-tokens`). Inbox grouped by day with filter chips; critical alerts get a full-screen heads-up notification with sound that **bypasses quiet hours**. Tapping opens the map at the alert position.
- **Acceptance:** A critical alert produces a heads-up notification and appears in the inbox.
- **Verify:** Trigger a power-cut alert on the backend.
- **Out of scope:** Notification preferences UI (P1).

### TASK-061: M-Pesa renewal flow
- **Milestone:** M5 · **Priority:** P0 · **Depends on:** TASK-056
- **Why:** This is the differentiator — incumbents lose renewals to manual PayBill.
- **Files:** new `mobile/lib/screens/billing/`
- **Approach:** Subscription card with expiry and price always visible. "Lipa na M-Pesa" → STK → a waiting state with a 90s timer → success or a clear "if you entered your PIN, your receipt will arrive by SMS — don't pay twice" message. Always show the PayBill fallback with copyable number and account ref.
- **Acceptance:** STK completes end to end against the sandbox; the timeout message is correct and non-alarming.
- **Verify:** Manual with the sandbox test MSISDN.
- **Out of scope:** Card payments.

### TASK-062: Bilingual EN/SW and offline cache
- **Milestone:** M5 · **Priority:** P0 · **Depends on:** TASK-056
- **Why:** Swahili is a first-class requirement, not a toggle; and offline is a normal state in rural Kenya.
- **Files:** `mobile/lib/l10n/`, `mobile/lib/data/local/`
- **Approach:** ARB files for EN and SW, seeded with the 10 core strings from doc 03 §5. Language chosen at onboarding. Drift tables caching last positions, 7 days of trips, and the alert inbox; every screen renders cache-first.
- **Acceptance:** Switching language updates the UI without restart; airplane mode still shows cached data with ages.
- **Verify:** Manual in both languages, online and offline.
- **Out of scope:** Professional Swahili review `[HUMAN]` — flag for a native speaker before launch.

### TASK-063: Android release build and Play Store submission `[HUMAN + agent]`
- **Milestone:** M5 · **Priority:** P0 · **Depends on:** TASK-060, TASK-061, TASK-062
- **Why:** Distribution.
- **Files:** `mobile/android/`, signing config
- **Approach:** `[HUMAN]` create a Play Console account and an upload key (never commit the keystore). Build with `--split-per-abi`; verify APK size against the ≤25 MB target. Prepare listing, screenshots, and a privacy policy URL (TASK-072).
- **Acceptance:** A signed release APK/AAB builds and installs on a 2 GB test device.
- **Verify:** `flutter build appbundle --release`; record the size.
- **Out of scope:** iOS.

---

# M6 — Web dashboard (React)

### TASK-064: Scaffold the React dashboard
- **Milestone:** M6 · **Priority:** P0 · **Depends on:** —
- **Files:** new `web/`
- **Approach:** Vite + React + TypeScript. Add TanStack Query, React Router, and a charting library only when a chart is actually needed. Port `prototype-v2/tokens.css` verbatim as the token layer — **do not restyle**.
- **Acceptance:** `npm run build` succeeds; a page renders using the tokens.
- **Verify:** `cd web && npm run build`.
- **Out of scope:** Any feature screens.

### TASK-065: Dashboard auth and shell
- **Milestone:** M6 · **Priority:** P0 · **Depends on:** TASK-064
- **Approach:** OTP login reusing the mobile flow's endpoints; token in memory with refresh on 401; org switcher; the dark control-room shell from `prototype-v2/console-financier.html`.
- **Acceptance:** Sign in, see the shell, refresh the page without being logged out.
- **Verify:** Manual against the local backend.
- **Out of scope:** Feature pages.

### TASK-066: Fleet view — list plus live map
- **Milestone:** M6 · **Priority:** P0 · **Depends on:** TASK-065, TASK-004
- **Approach:** Split view: sortable vehicle table (plate block as row identity) + map. All/Online/Offline tabs. Subscribe to `/v1/stream`.
- **Acceptance:** All org vehicles appear and update live.
- **Verify:** Manual with seeded org data.
- **Out of scope:** Reports.

### TASK-067: Financier portfolio and defaulters queue
- **Milestone:** M6 · **Priority:** P0 · **Depends on:** TASK-065
- **Approach:** Port `prototype-v2/console-financier.html`: KPI row, defaulters table with a **per-row safety verdict**, selection, then the two-screen batch flag → review → confirm. The confirm sheet must show the **borrower's name and last known place**, require a typed reason, and visibly exclude blocked units.
- **Acceptance:** Moving units cannot be selected for immobilization; confirm requires a reason.
- **Verify:** Manual against seeded loans.
- **Out of scope:** Recovery workflow (TASK-068).

### TASK-068: Recovery workflow and public link page
- **Milestone:** M6 · **Priority:** P1 · **Depends on:** TASK-067, TASK-034
- **Approach:** "Start recovery" → creates a link → shows a copyable URL with expiry. Build the **public** page (no auth, works on an old browser): big map, plate, fix age, directions button, visible expiry.
- **Acceptance:** The public page loads without a session and shows live position; an expired token shows a clear message.
- **Verify:** Open the link in a private window.
- **Out of scope:** Native navigation handoff.

### TASK-069: Reports UI with export
- **Milestone:** M6 · **Priority:** P0 · **Depends on:** TASK-066, TASK-027
- **Approach:** Report picker + date presets (Today/Week/Month), results table, and a **direct download** button. Explicitly beat the competitor failure mode: the file must download immediately and contain real data.
- **Acceptance:** A CSV downloads and opens in Excel with correct values.
- **Verify:** Manual download check.
- **Out of scope:** Scheduled reports UI.

### TASK-070: Admin console
- **Milestone:** M6 · **Priority:** P1 · **Depends on:** TASK-065, TASK-021, TASK-032
- **Approach:** Internal-only pages: device stock, SIM register with expiry flags, unmatched payments queue with a match action, installer jobs.
- **Acceptance:** An admin can resolve an unmatched payment end to end.
- **Verify:** Manual.
- **Out of scope:** A dealer/reseller console — that is a pending strategic decision (doc 05 §9).

---

# M7 — Website

### TASK-071: Turn the prototype into a deployable site
- **Milestone:** M7 · **Priority:** P1 · **Depends on:** —
- **Files:** new `site/` from `prototype-v2/website.html`
- **Approach:** Move to a static site (plain HTML or Astro). Self-host the fonts. Add the "switch from your current tracker" page built on the doc 05 §6 migration story. Add a real contact/lead form posting somewhere real.
- **Acceptance:** Builds to static files; Lighthouse performance ≥ 90 on mobile.
- **Verify:** `npx lighthouse <url> --only-categories=performance`.
- **Out of scope:** A CMS.

### TASK-072: Legal pages and SEO
- **Milestone:** M7 · **Priority:** P0 · **Depends on:** TASK-071
- **Why:** A privacy policy is required by the Data Protection Act **and** by the Play Store listing.
- **Files:** `site/privacy`, `site/terms`, meta tags, `sitemap.xml`, `robots.txt`
- **Approach:** Privacy policy covering location-data collection, retention (≥12 months), consent, and data-subject rights; terms covering the immobilization service and its limits. `[HUMAN]` have both reviewed by a Kenyan lawyer. Add Open Graph tags and structured data; target "car tracking Kenya".
- **Acceptance:** Both pages live and linked from the footer and the app.
- **Verify:** Fetch the URLs; validate OG tags.
- **Out of scope:** Ongoing SEO content.

---

# M8 — Deployment and observability

### TASK-073: Provision the production server `[HUMAN + agent]`
- **Milestone:** M8 · **Priority:** P0 · **Depends on:** TASK-012
- **Why:** Devices need a stable public endpoint. **The IP becomes a long-term commitment** — some trackers accept only an IP, not a hostname.
- **Approach:** Follow `02-traccar-server-setup-guide.md`. Ubuntu 24.04, 2 vCPU/4 GB minimum. `[HUMAN]` choose the provider and record the decision. Reserve a **static IP** explicitly.
- **Acceptance:** SSH access, static IP recorded in the handoff docs, DNS A records pointing at it.
- **Verify:** `ssh` in; `dig` resolves.
- **Out of scope:** App deployment (TASK-074).

### TASK-074: Deploy the stack with TLS and a firewall
- **Milestone:** M8 · **Priority:** P0 · **Depends on:** TASK-073
- **Approach:** Docker Compose for Postgres + Traccar + backend. Nginx reverse proxy with Let's Encrypt. UFW allowing only 22, 80, 443, 5023, 5027. **Traccar's 8082 must not be publicly reachable.**
- **Acceptance:** `https://api.<domain>/v1/health` returns ok; port 8082 refuses external connections.
- **Verify:** `curl https://api.<domain>/v1/health`; `nmap` confirms 8082 closed.
- **Out of scope:** Auto-deploy (TASK-075).

### TASK-075: Deployment pipeline and rollback
- **Milestone:** M8 · **Priority:** P0 · **Depends on:** TASK-074, TASK-051
- **Approach:** CI builds a tagged image on `main`; deploy by tag. Migrations run as a separate explicit step **before** the app starts. Document rollback: redeploy the previous tag; note that Prisma migrations are not auto-reversible, so forward-fix is the default.
- **Acceptance:** A tagged commit deploys; the previous tag can be restored within 10 minutes.
- **Verify:** Perform one deploy and one rollback; record timings.
- **Out of scope:** Blue/green.

### TASK-076: Backups and a restore drill
- **Milestone:** M8 · **Priority:** P0 · **Depends on:** TASK-074
- **Why:** Losing the `app` database means losing every payment record and audit trail.
- **Approach:** Nightly `pg_dump` of **both** databases, encrypted, shipped **off-host** (a backup on the same disk is not a backup). 30 daily + 12 monthly. Then actually restore into a scratch DB and verify row counts.
- **Acceptance:** A restore drill succeeds and is recorded with a date.
- **Verify:** `pg_restore` into `app_restore_test`; compare counts.
- **Out of scope:** PITR.

### TASK-077: Monitoring, uptime and error tracking
- **Milestone:** M8 · **Priority:** P0 · **Depends on:** TASK-074, TASK-001
- **Approach:** External uptime checks on `https://api/v1/health` **and a TCP check on 5023** (the web tier can be healthy while ingest is dead). Add Sentry (consent-gated) for backend and app. Alert on: ingest down, health degraded, disk >80%, Daraja callback failures.
- **Acceptance:** Stopping the backend produces an alert within 5 minutes.
- **Verify:** Stop the service and confirm the alert.
- **Out of scope:** Full APM.

### TASK-078: Database indexes and a performance pass
- **Milestone:** M8 · **Priority:** P1 · **Depends on:** TASK-047
- **Approach:** Review the query plans behind the defaulters queue, alert listing and portfolio aggregation. Add indexes where missing (`Alert.vehicleId+createdAt` and `Command.vehicleId+createdAt` exist; check `Loan.financierOrgId+daysInArrears` and `Subscription.status+currentPeriodEnd`). The portfolio endpoint currently calls Traccar **per loan in a loop** — batch or cache it.
- **Acceptance:** Portfolio for 1,000 units responds in <2s.
- **Verify:** Seed 1,000 loans and time the endpoint.
- **Out of scope:** Sharding.

### TASK-079: Staging environment
- **Milestone:** M8 · **Priority:** P1 · **Depends on:** TASK-075
- **Approach:** A second, smaller instance running the same compose stack against Daraja **sandbox** and `SMS_PROVIDER=dev`. Never point staging at production data.
- **Acceptance:** Staging runs the same build with separate credentials.
- **Verify:** Deploy a branch to staging.
- **Out of scope:** Production data anonymisation.

---

# M9 — Launch

### TASK-080: ODPC data-controller registration `[HUMAN]`
- **Milestone:** M9 · **Priority:** P0 · **Depends on:** TASK-072
- **Why:** Legally required under the Kenya Data Protection Act 2019 before processing location data commercially — and financiers will ask for proof.
- **Approach:** Register with the Office of the Data Protection Commissioner; document retention (positions ≥12 months) and the consent mechanism.
- **Acceptance:** Registration certificate obtained and filed.
- **Out of scope:** —

### TASK-081: Company, trademark and PayBill `[HUMAN]`
- **Milestone:** M9 · **Priority:** P0 · **Depends on:** —
- **Approach:** Register the company at BRS. **Run a KIPI trademark search on "FleetView" before printing anything** — doc 05 found three existing FleetView telematics products (non-Kenyan) and `fleetview.com` is taken; register as e.g. "FleetView Africa Ltd" and build on `fleetview.co.ke`. Apply for the M-Pesa PayBill and Daraja **production** credentials.
- **Acceptance:** Certificate of incorporation, KIPI search result, live PayBill.
- **Out of scope:** —

### TASK-082: Switch billing to Daraja production `[HUMAN + agent]`
- **Milestone:** M9 · **Priority:** P0 · **Depends on:** TASK-081, TASK-049
- **Approach:** Swap `DARAJA_BASE_URL` to `https://api.safaricom.co.ke` with production credentials. Run `npm run daraja:register-c2b` against the production shortcode. Test with **one real KSh 1 payment** end to end, then refund/reconcile.
- **Acceptance:** A real STK push completes and a real C2B payment reconciles automatically.
- **Verify:** Check the payment row and the receipt SMS.
- **Out of scope:** Bulk migration of existing customers.

### TASK-083: Accessibility and responsive audit
- **Milestone:** M9 · **Priority:** P1 · **Depends on:** TASK-069, TASK-071
- **Why:** Acceptance criteria, not polish — outdoor readability and colour-blind safety are core to this product.
- **Approach:** Verify AA contrast on every text/background pair; confirm status is never colour-alone; keyboard navigation through the consoles; visible focus rings; `prefers-reduced-motion` respected; layouts at 1440/768/375px.
- **Acceptance:** No AA contrast failures; full keyboard operation of the financier console.
- **Verify:** Lighthouse accessibility ≥ 95; manual keyboard pass.
- **Out of scope:** Screen-reader certification.

### TASK-084: Pre-launch checklist
- **Milestone:** M9 · **Priority:** P0 · **Depends on:** all P0 tasks
- **Files:** new `docs/PRELAUNCH_CHECKLIST.md`
- **Approach:** Assemble and tick: all P0 tasks done · migrations applied · backups verified by restore · monitoring alerting · secrets rotated and out of git · rate limiting live · TLS A-grade · privacy policy published · ODPC registered · production M-Pesa tested with real money · 10 pilot devices reporting for 14 days at ≥99% · one supervised engine-cut test on a real vehicle · rollback rehearsed · support line and SLA staffed.
- **Acceptance:** Every item ticked with evidence.
- **Verify:** Owner sign-off.
- **Out of scope:** Marketing launch.

---

## Deferred / explicitly out of scope for v1

Recorded so they are not mistaken for oversights:

| Item | Why deferred |
|---|---|
| iOS app | Android is ~95% of the target market |
| Dealer/reseller console | Strategic decision pending (doc 05 §9) — large build, different business model |
| Fuel sensors, tyre pressure, temperature, OBD, RFID | Hardware-dependent, v2 |
| Dashcam / video telematics | Capital-intensive |
| Speed governors (NTSA-certified) | Regulatory gate; out of v1 scope per doc 01 |
| Listen-in microphone | **Deliberately refused** — covert cabin audio is a consent/DPA problem (doc 05 §8) |
| Geofence-triggered automatic engine cut | **Deliberately refused** on safety grounds (doc 05 §8) |
| AT1-style BLE backup tracker | Promising differentiator; needs a hardware sourcing study first |
| Multi-region / horizontal scaling | Single VPS covers the 3-year plan to ~5,000 devices |
