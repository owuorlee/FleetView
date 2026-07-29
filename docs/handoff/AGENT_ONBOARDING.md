# Start here

**You are taking over FleetView.** You have no memory of this project and no prior context. That is expected — everything you need is in this repo.

**What it is, in three sentences.** FleetView is a GPS vehicle-tracking platform for Kenya: it tracks cars and motorbikes, raises theft alerts, allows a safety-gated remote engine cut-off, and bills customers over M-Pesa. Its highest-value customers are asset financiers who finance motorbikes and need to track their collateral. The NestJS backend is substantially built and tested; **there is no mobile app, no web dashboard, and no deployment** — those are your job.

## Before you write any code

Read these, in this order. Do not skip — several things in this repo look finished and are not.

1. **`PROGRESS_LOG.md`** — what happened most recently and what's next. Always read this first.
2. **`HANDOFF.md`** — what the product is, how to run it locally, env vars, codebase map, **§9 known bugs and §10 landmines**.
3. **`STATE_OF_PLAY.md`** — what's real vs stubbed. **§3 "Traps" is mandatory reading.**
4. **`QUALITY_STANDARDS.md`** — how to write code in this repo.
5. **`ARCHITECTURE.md`** — read when your task touches data flow, the data model, or auth.
6. **`ROADMAP_TO_PRODUCTION.md`** — find your task; read only that task plus its dependencies.

Then get it running locally (`HANDOFF.md` §5) and confirm `npm test` gives you **87 passing tests** before you change anything. If it doesn't, stop and investigate — you need a known-good baseline.

## Your operating loop

Repeat this for every task:

```
1. READ    PROGRESS_LOG.md — what was just done, what's next, what was discovered
2. PICK    the next unblocked task from ROADMAP_TO_PRODUCTION.md (respect "Depends on")
3. RE-READ the actual files that task will touch — never work from memory or docs alone
4. BUILD   only what the task specifies (respect its "Out of scope")
5. VERIFY  run the task's "How to verify", plus:  npm test && npm run build
           (once TASK-008 has added them, also: npm run lint && npm run typecheck)
6. LOG     append an entry to PROGRESS_LOG.md with the REAL pasted output
7. COMMIT  one focused commit: "TASK-XXX: <what you did>"
```

Work in milestone order: **M0 first** — those nine tasks fix real defects that everything else depends on.

## Hard rules — never break these

1. **Never claim something works unless you ran it and saw the output.** Paste real output into the progress log. A documented failure is more valuable than a false pass.
2. **Never fabricate** an API, method, env var, file path, or config key. Check the code or the real docs. This matters most for the Traccar and Daraja APIs.
3. **Never do more than the task asks.** Found something else broken? Write it under "Discovered" in the progress log; don't fix it in passing.
4. **Never commit secrets** (`.env`) or anything under `research/` (it contains a real third party's personal data).
5. **Never weaken the immobilization safety model.** The safety gate is evaluated twice — at request and at confirm — deliberately. This feature can stop a stranger's vehicle; treat it with care.
6. **Never run `prisma db push` against a database with real data.** It can drop columns silently. Fix this properly in TASK-002.
7. **Never delete code you don't understand.** Several oddities here are deliberate — see `HANDOFF.md` §10.
8. **Never leave a stub, mock, or TODO in a path that ships.** If you must stub, mark it `// STUB:` and add it to the roadmap.
9. **If the docs contradict reality, update the docs** and note it in the progress log. Don't silently work around them.
10. **If you're blocked on something only the owner can decide** — money, hardware, legal identity, a business rule — stop and ask. Don't guess.

## The one thing to understand about this product

An engine cut-off is irreversible and can be dangerous. A financier agent using this software can stop a stranger's motorbike — someone's livelihood. The codebase reflects that: two-step confirmation, a safety gate that blocks cuts above 10 km/h, blocked attempts still written to the audit trail, and a deliberate refusal to offer automatic geofence-triggered cut-off even though competitors do.

**Preserve that stance.** If a change would make stopping a vehicle easier, faster, or more automatic, that is a decision for the owner — not a convenience for you to add.
