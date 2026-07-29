# FleetView — Progress Log

> **This file replaces long-lived chat memory. It is the project's continuity mechanism.**
>
> The agent working on this project has **no memory between sessions**. This log is the only
> record of what happened, what was learned, and what to do next. If you do not append to it,
> the next session starts blind and will repeat work or undo it.
>
> **Append an entry after EVERY task. Newest at the top. Never edit or delete past entries** —
> if something turns out to be wrong, add a new entry correcting it.

---

## Entry template — copy this

```markdown
## YYYY-MM-DD — TASK-XXX: <title>

**Status:** Done | Partial | Blocked | Abandoned
**Files touched:**
- path/to/file.ts (what changed)

**What changed:**
<2–4 sentences. What now works that didn't before.>

**Verification (real output, pasted):**
```
$ npm test
Test Files  11 passed (11)
     Tests  87 passed (87)
```

**Discovered:**
<Anything learned that isn't in the docs: a wrong assumption, a landmine, a doc that's now
stale, an API that behaved unexpectedly. Write it even if it seems minor — this is where the
next session's time is saved. "Nothing" is a valid answer.>

**Docs updated:** <which handoff docs you corrected, or "none">

**Next:** <the next unblocked task id, and anything the next session needs to know first>
```

---

# Log

## 2026-07-28 — HANDOFF: project transferred from Claude Code to a new agent

**Status:** Done
**Files touched:**
- `docs/handoff/HANDOFF.md` (new)
- `docs/handoff/ARCHITECTURE.md` (new)
- `docs/handoff/STATE_OF_PLAY.md` (new)
- `docs/handoff/ROADMAP_TO_PRODUCTION.md` (new)
- `docs/handoff/QUALITY_STANDARDS.md` (new)
- `docs/handoff/PROGRESS_LOG.md` (new, this file)
- `docs/handoff/AGENT_ONBOARDING.md` (new)

**What changed:**
No production code was modified. The project was audited against the actual codebase (not from
memory) and a complete handoff package was written so a new agent with zero context can continue.
84 remaining tasks were specified across 9 milestones.

**Verification (real output, pasted):**
```
$ node --version
v24.12.0
$ npm --version
11.6.2

$ npm run build
> fleetview-backend@0.1.0 build
> tsc -p tsconfig.json
build exit code: 0

$ npm test
 ✓ test/alert-rules.spec.ts (8 tests) 15ms
 ✓ test/roles.spec.ts (4 tests) 9ms
 ✓ test/phone.spec.ts (15 tests) 13ms
 ✓ test/safety-gate.spec.ts (6 tests) 18ms
 ✓ test/otp.store.spec.ts (5 tests) 15ms
 ✓ test/stream-filter.spec.ts (4 tests) 22ms
 ✓ test/billing-logic.spec.ts (14 tests) 49ms
 ✓ test/auth.service.spec.ts (5 tests) 30ms
 ✓ test/financier.service.spec.ts (6 tests) 30ms
 ✓ test/command-delivery.spec.ts (10 tests) 27ms
 ✓ test/commands.service.spec.ts (10 tests) 46ms

 Test Files  11 passed (11)
      Tests  87 passed (87)
test exit code: 0

$ node dist/main.js
[Nest] LOG [NestApplication] Nest application successfully started
[Nest] LOG [Bootstrap] FleetView backend listening on :3000 (+ WS /v1/stream)
```

**Discovered** (all of this was found during the audit and is NOT obvious from reading the code):

1. **Four Prisma models have zero code behind them** — `SimCard`, `Geofence`, `VehicleGeofence`,
   `InstallerJob`. Verified by grepping for every `prisma.<model>.` accessor. The data model makes
   the system look more complete than it is.
2. **Trip history is unreachable.** `TraccarClient.route()` exists but no controller calls it.
3. **`TraccarClient.disableDevice()` is dead code** — nothing calls it; there is no vehicle
   delete endpoint.
4. **`/v1/health` hangs when Postgres is down** rather than reporting `db:false`. Observed: the
   request timed out at 5s while the app itself had started normally. Prisma has no query timeout here.
5. **Alert fan-out silently skips org-owned vehicles** (`if (!vehicle.owner) return;` in
   `alerts.service.ts`). The entire B2B segment currently receives no notifications at all.
6. **`/v1/stream` returns nothing to org members** — `buildScope()` queries `ownerUserId` only.
   It connects successfully and reports zero vehicles, so it looks like it works.
7. **`SMS_DAILY_CAP_PER_VEHICLE` is declared and never referenced** — SMS spend is uncapped.
8. **No migrations exist.** Schema is applied with `prisma db push`; `prisma/migrations/` is absent.
   This is destructive and must be fixed before real data exists.
9. **No linter, formatter, or CI** — verified: no configs, no scripts, no workflow files.
10. **All 87 tests mock Prisma.** There is no integration test, no e2e test, and nothing that
    touches a real database, a real HTTP request, or a real Traccar.
11. **Traccar 6.x has no default admin** (no admin/admin). The first user must be created via
    `POST /api/users` while the user table is empty. This blocks local setup if you don't know it.
12. Docker was **not running** at audit time (machine had rebooted), so DB-dependent behaviour was
    verified by reading code rather than executing. Tagged `[UNVERIFIED]` where relevant.

**Docs updated:** all seven handoff docs created.

**Next:** **TASK-001** (health check timeout) — small, self-contained, no dependencies. Then work
through M0 in order; those nine tasks fix the defects listed above and everything else builds on them.

Before writing code, read in this order: `AGENT_ONBOARDING.md` → `HANDOFF.md` →
`STATE_OF_PLAY.md` §3 (Traps) → `QUALITY_STANDARDS.md` → the task in `ROADMAP_TO_PRODUCTION.md`.

**Open decisions needing the owner** (do not guess these):
- VPS provider and the **static IP commitment** (some trackers accept only an IP, not a hostname)
- Whether to build the dealer/reseller console (doc 05 §9)
- Whether recovery operations are software-only or a partnership (Cartrack's moat is operational)
- Confirmation that "FleetView" survives a KIPI trademark search (three non-Kenyan FleetView
  telematics products already exist; `fleetview.com` is taken)
