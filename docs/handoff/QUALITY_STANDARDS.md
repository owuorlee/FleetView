# FleetView — Quality Standards

> **Read this as direct instructions to you, the agent working on this project.**
> These rules are derived from how this codebase is *actually* written, not from generic best practice.
> Following them keeps the codebase coherent for whoever comes after you.

---

## 1. Read before you write

**Locate and imitate the existing pattern before inventing a new one.** This codebase is internally consistent; your job is to extend it, not to introduce a second style.

Concretely, before you write a new module, open `src/orgs/` and copy its shape:

```
src/<feature>/
  <feature>.module.ts       Nest module — imports, controllers, providers, exports
  <feature>.controller.ts   HTTP only: routing, guards, DTO binding. NO business logic.
  <feature>.service.ts      All business logic. Injected PrismaService.
  dto.ts                    class-validator DTOs
  <pure-logic>.ts           Optional — see §2
```

**File naming is kebab-case** (`alert-rules.ts`, `command-dispatch.ts`, `org-role.guard.ts`). Classes are PascalCase, methods and variables camelCase. Do not introduce snake_case or index barrels.

## 2. The most important pattern in this codebase: extract pure logic

Every well-tested part of this project follows one rule: **decision logic lives in a pure function file with no I/O, and the service calls it.**

Existing examples — read at least one before writing new logic:

| Pure file | Its service |
|---|---|
| `commands/safety-gate.ts` | `commands.service.ts` |
| `alerts/alert-rules.ts` | `alerts.service.ts` |
| `billing/billing-logic.ts` | `billing.service.ts` |
| `stream/stream-filter.ts` | `stream.gateway.ts` |
| `orgs/roles.ts` | `org-role.guard.ts` |
| `common/phone.ts` | everywhere |

If you are writing a rule ("when is this blocked?", "which bucket does this fall into?", "how do we match this payment?"), it belongs in a pure function that takes plain arguments and returns a plain result — **not** inside a method that also queries the database. This is why 87 tests exist without a test database.

## 3. Consistency beats personal preference

- **Do not restyle, reformat, or "modernise" working code.** No converting callbacks to a different async style, no renaming for taste, no reordering imports across files you didn't otherwise touch.
- Do not swap libraries for equivalents you prefer.
- If you disagree with an existing choice, note it in `PROGRESS_LOG.md` and move on.

## 4. No silent scope creep

Implement **the task, and nothing else**. Every task in `ROADMAP_TO_PRODUCTION.md` has an explicit *Out of scope* line — respect it.

If you spot something else that needs doing, **write it in `PROGRESS_LOG.md` under "Discovered"** and, if it's substantial, propose it as a new TASK. Do not fix it in passing. Unrelated changes bundled into a task make review impossible and break the roadmap's dependency ordering.

## 5. Never fabricate

**Do not invent an API, library method, environment variable, file path, config key, or CLI flag.** If you are not certain it exists, check:
- the code (`grep`),
- `package.json` for what is actually installed,
- the library's real documentation.

This applies especially to **Traccar's API** and **Daraja's API**. If you cannot verify an endpoint's shape, say so and stop — a plausible-looking wrong endpoint will fail silently in production and cost days.

Every claim you write in a doc or a commit message must be something you observed. **Never state a test passed, a build succeeded, or a feature works unless you ran it and saw the output.**

## 6. Error handling

Follow the existing convention exactly: **throw NestJS HTTP exceptions from services**, don't return error objects.

```ts
// The established pattern — see vehicles.service.ts, commands.service.ts
if (!vehicle) throw new NotFoundException('Vehicle not found');
if (vehicle.ownerUserId !== userId) throw new ForbiddenException();
if (existing) throw new ConflictException(`Vehicle ${regPlate} already registered`);
```

Rules:
- **No empty catch blocks. No swallowed exceptions.** If you catch, either handle it meaningfully or log it with context and rethrow.
- Where a failure is genuinely non-fatal, catch it, **log with the reason**, and continue — and say why in a comment. The established example is best-effort Traccar enrichment in `alerts.service.ts`.
- Every user-facing failure needs a real message and a real UI state. "Something went wrong" is not acceptable; neither is a spinner that never resolves.
- Use `Logger` per class: `private readonly logger = new Logger('Alerts');`
- **Never log secrets** — no OTP codes, tokens, passwords, or raw Daraja payloads.

## 7. Validate everything at the boundary

- Every `@Body()` must have a DTO with `class-validator` decorators. The global `ValidationPipe` runs with `whitelist: true, forbidNonWhitelisted: true, transform: true` — unknown fields are rejected, so DTOs must be complete.
- Validate route params: `ParseUUIDPipe` for ids.
- Normalise phone numbers with `normalizePhone()` from `common/phone.ts` — **never** hand-roll phone parsing.
- **Never trust the client** for authorization. Always derive the user from the JWT (`@CurrentUser()`), never from a body field.

## 8. Security rules that are not negotiable

- **Never commit secrets.** `.env` is gitignored; keep it that way. No credentials, keys, tokens, or URLs hardcoded in source — use `ConfigService`.
- Never weaken the immobilization safety model. The safety gate runs at request **and** at confirm; both are deliberate.
- Never add an endpoint that lets a client bypass `JwtAuthGuard` without a written reason in the progress log.
- Treat everything under `research/` as containing a third party's personal data — never commit it, never paste it into docs, issues, or commit messages.

## 9. Tests

**Framework:** Vitest 3.2.7. Unit tests in `backend/test/*.spec.ts`. Run with `npm test`.

- `vitest.config.ts` uses `pool: 'forks'` deliberately (the threads pool times out on slower Windows machines). **Do not change it.**
- **Every P0 task ships with tests that fail before your change and pass after.** Write the failing test first where practical.
- Test the pure logic file directly (fast, no mocks). For services, mock Prisma with `vi.fn()` — copy the `build()` helper pattern from `test/commands.service.spec.ts`.
- Test the **negative** cases: unauthorized access, blocked-by-safety, duplicate constraint, expired token, malformed input. The existing command tests are the model to follow.
- Do not delete or weaken an existing test to make your change pass. If a test is genuinely wrong, say so explicitly in the progress log and explain why.

## 10. Definition of done

A task is **not** done until you have run **all** of these and seen them pass:

```bash
cd backend
npm run lint        # after TASK-008 exists
npm run typecheck   # after TASK-008 exists
npm test
npm run build
```

**Paste the real output into `PROGRESS_LOG.md`.** Never claim a green build you did not observe. If something fails and you cannot fix it within the task's scope, record the failure honestly and flag it — a documented failure is far more useful than a false pass.

For frontend tasks, also run the framework's build and analyzer (`flutter analyze` / `npm run build`).

## 11. Commits

- **One task, one commit** (or a small focused series). Never bundle unrelated changes.
- Message format — first line references the task:
  ```
  TASK-016: add geofences module with ownership-scoped CRUD

  <what changed and why, wrapped at ~72 chars>
  ```
- Do not commit `node_modules`, `dist`, `.env`, or anything under `research/`.
- Do not rewrite history on `main`.

## 12. Dependencies

- **Do not add, upgrade, or remove a dependency without recording the reason in `PROGRESS_LOG.md`.**
- Prefer the standard library or something already installed. Example: TASK-027 asks for CSV export — write ~20 lines rather than adding a CSV package.
- Never upgrade a major version as a side effect of another task.
- Current stack is pinned in `package.json`; NestJS 11, Prisma 6, TypeScript 5.9, Vitest 3. Stay on those majors.

## 13. Don't delete what you don't understand

If code looks wrong but you can't explain why it exists, **leave it and ask**. This codebase has several deliberate oddities that look like bugs (see `HANDOFF.md` §10 Landmines) — the `BigInt.prototype.toJSON` patch, the double safety-gate evaluation, the forks test pool, the knots→km/h conversion. Deleting any of them breaks something real.

## 14. Accessibility and responsive behaviour are acceptance criteria

Not polish, not optional, not "later":
- Contrast ≥ 4.5:1 for text (AA). Status must **never** be conveyed by colour alone — always pair with a label or shape.
- Touch targets ≥ 48px (52px on consumer app screens — these users are outdoors, on cracked screens, sometimes wearing gloves).
- Respect `prefers-reduced-motion`.
- Visible focus rings on every interactive element.
- Every screen needs explicit **loading, empty, error and offline** states. Offline is a normal condition in rural Kenya — show cached data with an "as at" timestamp, never an error page.

## 15. When reality contradicts these docs

The handoff docs were accurate on 2026-07-28. Code drifts.

**If you find that a document is wrong: update the document as part of your task, and note the correction in `PROGRESS_LOG.md`.** Do not silently work around a doc you believe is stale, and do not guess. If you are blocked on something only the owner can decide (money, hardware, legal identity, a business rule), stop and ask — a clear question costs minutes, a wrong assumption costs days.
