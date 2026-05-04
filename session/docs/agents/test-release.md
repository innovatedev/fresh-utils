# Agent Validation Guide: Fresh Session Init

> [!NOTE]
> If running in Claude Code: read this entire document before taking any action.
> Do not begin setup until you have confirmed the workspace structure matches
> section 1. Report findings to the user before generating the evaluation JSON.

This guide provides instructions for an AI agent to validate the
`@innovatedev/fresh-session` initialization script in a fresh project
environment.

## 1. Setup Fresh Environment

Before testing the init script, create a new, clean Fresh 2.0 project. Note that
the Fresh init script is interactive:

```bash
# assumes we are at workspaceroot (not ./session/)
# ls .. # should show {workspaceroot folder} folder, as well as a work/ folder
# Create a new project named 'fresh-session-test-app'
rm -rf ../work/fresh-session-test-app
deno run -A jsr:@fresh/init ../work/fresh-session-test-app --tailwind --vscode
cd ../work/fresh-session-test-app
```

## 2. Run Initialization Script

Run the `init` script from the current workspace or a specific version.

### A. From Local Workspace (Development)

When evaluating the script using local source files instead of the published JSR
package, Deno and Vite require explicit mapping for internal dependencies since
there is no JSR metadata to resolve them.

1. Run the initialization script:

```bash
deno run -A {workspaceroot}/session/src/init/mod.ts -y
```

2. Open the test app's `deno.json` and replace the `@innovatedev/fresh-session`
   `jsr:` import with local paths, and manually add its internal `@std/http`
   dependency:

```json
"imports": {
  /* ... existing imports ... */
  "@innovatedev/fresh-session": "../../fresh-utils/session/src/mod.ts",
  "@innovatedev/fresh-session/kv-store": "../../fresh-utils/session/src/stores/kv.ts",
  "@innovatedev/fresh-session/memory-store": "../../fresh-utils/session/src/stores/memory.ts",
  "@innovatedev/fresh-session/kvdex-store": "../../fresh-utils/session/src/stores/kvdex.ts",
  "@std/http": "jsr:@std/http@^1.0.22"
}
```

### B. From JSR (Release Testing)

```bash
# Use -r to ensure latest version is pulled
deno run -A -r jsr:@innovatedev/fresh-session/init -y
```

## 3. Test Scenarios

### Scenario 1: Zero-Config Defaults (-y)

Run the script with the non-interactive flag:

```bash
deno run -A {workspaceroot}/session/src/init/mod.ts -y
```

### Scenario 2: DaisyUI Detection

1. Add `daisyui` to `deno.json` imports.
2. Run the init script and confirm DaisyUI detection.

### Scenario 3: Atomic Update Smoke Test

After init, add a handler that calls `session.update()` and verify:

- [ ] Handler compiles with zero type errors
- [ ] `result.ok` and `result.reason` are accessible with correct types
- [ ] Calling with `onExhausted: "throw"` compiles correctly

### Scenario 4: Memory Store Preset

Run `init` and select **Memory** storage.

- [ ] Verify it warns or errors appropriately if the project looks
      multi-process.
- [ ] Verify DX around "don't use this in production" is clearly surfaced.

### Scenario 5: KV Store Preset (non-kvdex)

Run `init` and select **Deno KV** (not Kvdex).

- [ ] Verify atomic behavior works.
- [ ] Verify `session.update()` works WITHOUT a manual `db` instance requirement
      in the store config.

### Scenario 6: Vanilla Tailwind vs No CSS framework

Test the fallback path:

1. Run on a project with Tailwind but NO DaisyUI.
2. Run on a project with NO CSS framework.

### Scenario 7: Upgrade Scenario

Run `init` on a project that ALREADY has session configured.

- [ ] Verify idempotency (no duplicate patching of `utils.ts` or `main.ts`).

### Scenario 8: Monorepo Scenario

Test in a subdirectory of a monorepo using `DENO_NO_WORKSPACE=1`.

### Scenario 9: Application Session Migration

- [ ] Manually insert a record with `__appV: 0` (or no `__appV`) into the store
- [ ] Make a request that reads the session
- [ ] Verify the migrated data shape matches `TData` for the current version
- [ ] Verify `__appV` is updated to current version after next write
- [ ] Insert a record with `__appV` higher than configured version
- [ ] Verify `onUnknownVersion: "invalidate"` logs the user out
- [ ] Verify `onUnknownVersion: "reset"` preserves `userId` but clears `data`
- [ ] Verify startup throws `SessionConfigError` if migration chain has gaps
- [ ] Verify `forceWriteOnMigration: true` causes a store write even on
      read-only requests
- [ ] Confirm migration functions are never called with typed assumptions —
      input is `unknown`

## 4. Code Validation Checklist

### Validation Matrix

| Check                         | Memory | KV  | Kvdex    |
| ----------------------------- | ------ | --- | -------- |
| `config/session.ts` exists    | ✓      | ✓   | ✓        |
| `kv/db.ts` exists             | ✗      | ✗   | ✓        |
| `kv/models.ts` exists         | ✗      | ✗   | ✓        |
| `db` instance passed to store | N/A    | N/A | Required |
| `session.update()` supported  | ✓      | ✓   | ✓        |
| `utils.ts` patched            | ✓      | ✓   | ✓        |
| `main.ts` patched             | ✓      | ✓   | ✓        |

### General Integrity

- [ ] Run `deno check **/*.ts **/*.tsx`. There should be **zero** type errors.
- [ ] `utils.ts` MUST use `export type { State }` (not just import).
- [ ] `utils.ts` MUST define an `AppState` alias merging `State` and
      `ExtraState`.
- [ ] `deno.lock` should be consistent (run `deno install`).

### Negative Validation (Anti-Patterns)

- [ ] **No session payload** appears in any generated log output.
- [ ] **No hardcoded secrets** or placeholder credentials in generated files.
- [ ] **No `any` casts** in generated middleware config (not just route
      handlers).
- [ ] **`MemorySessionStorage` is NOT the default** for any production preset.
- [ ] **No `overwrite: true`** on indexed kvdex collections.

## 5. Runtime Verification

Static validation is insufficient. You MUST run the generated application to
ensure code that compiles also behaves correctly at runtime.

### Smoke Test Procedure

1. Start the generated app: `deno task dev`.
2. Perform a full auth cycle using `curl` or a browser:
   - [ ] **Login**: POST to `/login` and verify a `Set-Cookie` header is
         returned.
   - [ ] **Persistence**: GET a protected route using the cookie and verify
         `ctx.state.user` is populated.
   - [ ] **Update**: Trigger a `session.update()` call and verify the data
         persists across requests.
   - [ ] **Logout**: POST to `/logout` and verify the cookie is cleared and the
         session is destroyed in the store.
3. **Storage Integrity**:
   - [ ] (Kvdex) Check Deno KV to ensure indices are correctly written.
   - [ ] (Memory) Verify session is LOST on server restart.

## 6. Self-Assessment & Compliance Report

After completing the technical validation, perform a formal evaluation of the
implementation against the
[Session Middleware Evaluation Standard](../session-middleware-standards.md).

1. **Grade the implementation**: Use the worksheet in the standards document.
2. **Generate a JSON report**: Create a file in `evaluations/<date>-v<version>/`
   named `<options>-<timestamp>.json`.
3. **Naming Convention**: Use ISO-8601-like timestamp in the filename to allow
   multiple evaluations: `defaults-cli-2026-05-03T10-30-00Z.json`.

**JSON Schema:**

```json
{
  "standard_version": "3.0",
  "version": "x.y.z",
  "timestamp": "ISO-8601",
  "score": 0-100,
  "rating": "Failure/Sub-standard/Acceptable/Exceeds expectations",
  "evaluator": "Agent Name",
  "domains": {
    "security": { "score": 0, "max": 35, "findings": [] },
    "correctness": { "score": 0, "max": 25, "findings": [] },
    "performance": { "score": 0, "max": 18, "findings": [] },
    "dx": { "score": 0, "max": 22, "findings": [] }
  },
  "findings": [
    {
      "criterion": "Concurrency safety",
      "score": 3,
      "max_score": 4,
      "weighted_pts": 8,
      "evidence": "kvdex.ts:L463 — versionstamp check in atomic block",
      "notes": "WAL recovery path verified via #syncWal at L332"
    }
  ],
  "automaticFailureConditions": {
    "insufficientEntropy": "PASS/FAIL",
    "noServerSideInvalidation": "PASS/FAIL",
    "fixationVulnerability": "PASS/FAIL",
    "plaintextStorage": "PASS/FAIL",
    "noAbsoluteExpiry": "PASS/FAIL",
    "lastWriteWinsWithNoConflictDetection": "PASS/FAIL",
    "claimedBehaviorWithNoTestCoverage": "PASS/FAIL"
  }
}
```

> [!IMPORTANT]
> You are a QUALITY CONTROL AUDITOR. Apply the standard ruthlessly:
>
> - Every finding MUST cite file and line number evidence.
> - A claimed behavior without a corresponding test scores MAX 2, not 4.
> - Security claims cannot be self-reported — verify against source.
> - Domain maxes: Security 35, Correctness 25, Performance 18, DX 22.
> - A perfect domain score requires evidence that the criterion is exceeded, not
>   just met.
> - Close calls on automatic failure conditions must be documented, not just
>   marked PASS.

## 7. Execution Summary

When an agent completes validation, it should report:

1. Version tested.
2. Preset selected (Memory/KV/Kvdex).
3. Design System detected (Vanilla/DaisyUI).
4. Results of `deno check` (confirm no inference regressions).
5. Evidence citations for all security claims (file + line).
6. Explicit statement of the conflict resolution path verified.
7. WAL recovery path verification result (or N/A for non-kvdex stores).
8. Any automatic failure conditions that were close calls, not just pass/fail.
9. Runtime verification: confirm login → session created → logout → session
   destroyed with an actual HTTP request cycle against the generated app.
10. Link to the **Self-Assessment JSON report**.

## 8. Post-Eval Artifact

After completing validation, write a file to
`evaluations/<date>-v<version>/context.md` containing:

### Package state snapshot

- Version evaluated
- All open issues found (not fixed in this run)
- All verified behaviors with evidence citations
- Any automatic failure conditions that were close calls

### What the next agent should know

- Which tests are meaningful vs boilerplate
- Which parts of the codebase changed since last eval
- Known gotchas encountered during this run
- Which scenarios passed without issue (safe to skim next time)

### What the next agent should NOT do

- List anything that was attempted and failed or caused problems
- List any "obvious fixes" that are intentional design decisions (reference ADR)
