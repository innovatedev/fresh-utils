# Agent Validation Guide: Fresh Session Init

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

```bash
deno run -A {workspaceroot}/session/src/init/mod.ts -y
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

**Verification:**

- [ ] `config/session.ts` exists and uses `KvDexSessionStorage`.
- [ ] `kv/db.ts` exists.
- [ ] `kv/models.ts` exists and uses the `sessionModel()` helper.
- [ ] `utils.ts` is patched with `AppState` and `defineAuth`.
- [ ] `main.ts` includes `app.use(session)`.
- [ ] Authentication routes (`routes/login.tsx`, etc.) are generated.

### Scenario 2: DaisyUI Detection

1. Add `daisyui` to `deno.json` imports.
2. Run the init script and confirm DaisyUI detection.
3. **Verification:** Generated routes should use `daisyui` classes (e.g.,
   `btn-primary`, `input-bordered`).

## 4. Code Validation Checklist

After running the script, validate the following. Note: If testing in a
subdirectory of a monorepo, you may need `DENO_NO_WORKSPACE=1`.

### Type Safety & Inference

- [ ] Run `deno check **/*.ts **/*.tsx`. There should be **zero** type errors.
- [ ] `utils.ts` MUST use `export type { State }` (not just import) to ensure
      global visibility.
- [ ] `utils.ts` MUST define an `AppState` alias that merges `State` and
      `ExtraState`.
- [ ] Verify `routes/index.tsx` can still access `ctx.state.shared` (boilerplate
      preservation).
- [ ] No `any` casts should exist in the generated route handlers.

### Dependency Integrity

- [ ] `deno.json` should contain `@olli/kvdex`.
- [ ] Runtime validation (Zod/Arktype) is OPTIONAL and developer-selected.
- [ ] `deno.lock` should be consistent (run `deno install`).

### Data Architecture

- [ ] Verify `kvdex` records are **flattened** (metadata at top-level).
- [ ] Confirm NO redundant `id` field exists inside the stored record.
- [ ] Verify `sessionModel()` is used to provide a library-agnostic base.

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
  "version": "x.y.z",
  "timestamp": "ISO-8601",
  "score": 0-100,
  "rating": "Failure/Sub-standard/Acceptable/Exceeds expectations",
  "evaluator": "Agent Name",
  "domains": {
    "security": { "score": 0, "max": 35, "findings": [] },
    "correctness": { "score": 0, "max": 22, "findings": [] },
    "performance": { "score": 0, "max": 18, "findings": [] },
    "dx": { "score": 0, "max": 25, "findings": [] }
  },
  "automaticFailureConditions": {
    "insufficientEntropy": "PASS/FAIL",
    "noServerSideInvalidation": "PASS/FAIL",
    "fixationVulnerability": "PASS/FAIL",
    "plaintextStorage": "PASS/FAIL",
    "noAbsoluteExpiry": "PASS/FAIL"
  }
}
```

> [!IMPORTANT]
> BE CRITICAL. You are a QUALITY CONTROL AUDITOR, not an enabler of bad practices or shortcuts.
> For DX, punish any code smells or messy code generation practices, or bad DX with using this package.
> If the agent is testing multiple presets or design systems, create a separate
> JSON report file for each combination. Also make sure all domain values are
> weighted correctly based on the standards document and total is out of 100
> (weighted from standards document).

## 7. Execution Summary

When an agent completes validation, it should report:

1. Version tested.
2. Preset selected (Memory/KV/Kvdex).
3. Design System detected (Vanilla/DaisyUI).
4. Results of `deno check` (confirm no inference regressions).
5. Link to the **Self-Assessment JSON report**.

## 8. Cleanup

```bash
rm -rf ./work/fresh-test-app
```
