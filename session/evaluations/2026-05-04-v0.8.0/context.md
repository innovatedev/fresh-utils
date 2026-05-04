# Evaluation Context — @innovatedev/fresh-session v0.8.0

Evaluated: 2026-05-04\
Preset: KvDex (defaults, `-y`)\
Score: 92/100 — Exceeds expectations

---

## Package state snapshot

### Version evaluated

v0.8.0 — local workspace source (`session/src/`)

### Open issues (not fixed in this run)

1. **MemorySessionStorage concurrent test is non-deterministic**
   (`security_perf.test.ts:244–311`). The test itself acknowledges it cannot
   prove one request was rejected — it only checks the final version number. The
   OCC logic is sound but this test does not provide strong verification for the
   memory store specifically.

2. **Standard v3.0 inconsistency: DX criterion weights sum to 25, domain max
   states 22**. Does not affect implementation quality; affects scoring
   arithmetic. Capped DX at 22 in the v0.8.0 evaluation.

3. **Persistence correctness full matrix untested**: Standard calls for a test
   covering write→read, restart→read, and concurrent write→read in a single
   suite. Coverage is spread across separate test files rather than assembled
   into one explicit matrix test.

### Fixed after initial evaluation (same session)

- **absoluteExpiry defaulted to 30 days** in all three generated config
  templates (`kvdex.ts`, `kv.ts`, `memory.ts`). Previously commented out,
  meaning a default app had no hard session lifetime cap. The value is active
  and annotated with a comment so developers can adjust it.
- **Flash redirect boundary test added** (`session_flash.test.ts`). New
  `Deno.test("Integration: Flash Messages Across HTTP Redirect")` — POST handler
  returns a real 302, session cookie extracted from `Set-Cookie`, flash
  available on redirect target, gone on subsequent request.
- **WAL recovery store API assertion added** (`wal.test.ts`). Step 6 added to
  the recovery test: `store.get(sessionId)` is called after `#syncWal()`
  completes to confirm the session is readable via the application API, not just
  via raw KV index queries.

### Verified behaviors with evidence

| Behavior                                     | Evidence                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| 128-bit CSPRNG session IDs                   | `session.ts:377–381`; `security_perf.test.ts:12–35`                               |
| Secure/HttpOnly/SameSite=Lax cookie defaults | `session.ts:406–409`; RT smoke test                                               |
| Server-side idle expiry                      | `session.ts:603–608`; `security_perf.test.ts:37–83`                               |
| Server-side absolute expiry                  | `session.ts:611–616`; `security_perf.test.ts:135–198`                             |
| Fixation protection on login                 | `session.ts:636–651`; `security_perf.test.ts:200–242`; RT smoke test              |
| OCC versionstamp in KvDex                    | `kvdex.ts:480,501`; `concurrency.test.ts`                                         |
| WAL crash recovery in KvDex                  | `kvdex.ts:350,485–486,575–580`; `wal.test.ts`                                     |
| Write-on-change dirty tracking               | `session.ts:838–843`; `security_perf.test.ts:85–133`                              |
| lastSeenAt write throttle (60s)              | `session.ts:842–843`                                                              |
| Flash lifecycle (incl. redirect cycle)       | `session.ts:735–825`; `session_flash.test.ts` (lifecycle + redirect boundary)     |
| absoluteExpiry defaulted in all templates    | `init/templates/config/{kvdex,kv,memory}.ts` — 30-day default, annotated          |
| Dual-layer migration (__v + __appV)          | `migrations.ts`; `session.ts:414–436`; `session_migration_test.ts`                |
| onEvent lifecycle hooks                      | `session.ts:296`                                                                  |
| Custom logger binding                        | `session.ts:141,412,623`                                                          |
| StandardSchemaV1 runtime validation          | `kvdex.ts:89–114,157,387,437`                                                     |
| `storeSupports()` type guard                 | `session.ts:215–218`; `introspection_test.ts`                                     |
| KvDex startup hard-fail if db missing        | `kvdex.ts:296`                                                                    |
| Init idempotency                             | Scenario 7 verified: utils.ts and main.ts correctly detected as already patched   |
| DaisyUI detection                            | Confirmed on `fresh-session-test-app-daisy` — navbar/btn/dropdown classes present |

### Automatic failure close calls

- **noAbsoluteExpiry**: PASS. Was a close call at initial eval (option existed
  but was commented out in templates). Resolved in this session: all three
  generated config templates now default to `absoluteExpiry: 60 * 60 * 24 * 30`
  (30 days). No longer a close call.

---

## What the next agent should know

### Which tests are meaningful vs boilerplate

- **High signal**: `security_perf.test.ts`, `concurrency.test.ts`,
  `wal.test.ts`, `session_migration_test.ts`, `introspection_test.ts`,
  `update_helper.test.ts`
- **Medium signal**: `session_flash.test.ts` (now includes redirect boundary
  test), `repro_flash.test.ts`, `kvdex_store.test.ts`, `kv_store.test.ts`
- **Lower signal / supporting**: `helpers.test.ts`, `patchers.test.ts`,
  `property.test.ts`, `dx_test.ts` — these test implementation details or DX
  ergonomics, not core correctness

### Parts of the codebase changed since last eval (v0.7.1)

- `session.ts` — `logger.error` fix at line 623 (was `console.error`);
  introspection API (`getSessionsForUser`, `revokeOtherSessions`);
  `session.update()` `timeoutMs` option; custom logger support
- `stores/kvdex.ts` — WAL write/recovery changes; StandardSchemaV1 integration
- `stores/memory.ts` — `structuredClone` on read/write for reference isolation
- `init/commands/init.ts` — removed `ua`/`ip` from secondary indices
- All three config templates — `migrationConfig` pattern, `expiry` defaults,
  `absoluteExpiry: 30 days` default, memory production warning
- New tests: `introspection_test.ts`, updated `session_migration_test.ts`,
  `update_helper.test.ts`
- New ADRs: ADR-0002 (db mandatory), ADR-0003 (two-phase write), ADR-0004
  (dual-layer versioning), ADR-0005 (migration unknown input)

### Known gotchas encountered during this run

- The startup crash (migrate.version=0) was completely invisible to CI because
  `init_integration.test.ts` only runs `deno check` — it never executes
  `createSessionMiddleware`. Type-checking templates passes even when the
  runtime behavior is broken.
- `kill $(lsof -ti:5173)` is unsafe in remote development environments — it may
  kill the user's remote session process. Use a stored PID instead.
- `deno fmt` will reorder imports alphabetically and collapse short multi-line
  imports. Always run `deno task check` after edits to catch format drift before
  committing.
- The memory.ts template `console.warn` must appear after all `import`
  statements — ES module syntax requires imports at the top.

### Scenarios that passed without issue (safe to skim next time)

- Scenario 1 (zero-config defaults): clean pass after startup crash fix
- Scenario 2 (DaisyUI detection): confirmed working
- Scenario 3 (session.update() types): type-checks clean
- Scenario 7 (idempotency): correctly detects already-patched files
- Section 4 validation matrix: all checks passed including negative
  anti-patterns
- Runtime smoke test (full auth cycle): clean

---

## What the next agent should NOT do

- Do not run `deno task check` with a broad `lsof` kill — use a stored PID to
  stop the dev server.
- Do not assume `deno check` passing means the generated app will start. The
  startup crash shows that type-checking templates is insufficient — you must
  actually invoke `createSessionMiddleware` in a test to verify runtime
  behavior.
- Do not remove the `expiry` or `absoluteExpiry` options from generated
  templates in the name of simplicity — both are deliberate security defaults.
  `absoluteExpiry: 60 * 60 * 24 * 30` (30 days) is now the active default in all
  three templates; it is annotated for developers to adjust, not to remove.
- Do not add `ua` and `ip` back as secondary indices in the KvDex session
  collection. They are stored in the document for security binding but are
  high-cardinality fields unsuitable for secondary indexing. This was an
  intentional fix.
- Do not interpret the `migrationConfig` export as boilerplate to simplify. It
  is the critical guard that prevents the startup crash when
  `APP_SESSION_VERSION = 0`.
- Do not re-refactor `introspection_test.ts` to use `./deps.ts`. The `deps.ts`
  file only exports `expect` (jest-style) and `fast-check`. The introspection
  tests use `assertEquals`/`assertExists` from `@std/assert` — this is
  intentional and correct.
