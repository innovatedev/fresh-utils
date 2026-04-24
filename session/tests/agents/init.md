# Agent Validation Guide: Fresh Session Init

This guide provides instructions for an AI agent to validate the
`@innovatedev/fresh-session` initialization script in a fresh project
environment.

## 1. Setup Fresh Environment

Before testing the init script, create a new, clean Fresh 2.0 project. Note that
the Fresh init script is interactive:

```bash
# Create a new project named 'test-app'
deno run -A jsr:@fresh/init ./work/fresh-test-app --tailwind --vscode
cd ./work/fresh-test-app
```

## 2. Run Initialization Script

Run the `init` script from the current workspace or a specific version.

### A. From Local Workspace (Development)

```bash
deno run -A ../../session/src/init/mod.ts -y
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
deno run -A ../../session/src/init/mod.ts -y
```

**Verification:**

- [ ] `config/session.ts` exists and uses `KvDexSessionStorage`.
- [ ] `kv/db.ts` and `kv/models.ts` are created.
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

### UI Standards (Tailwind 4)

- [ ] Search for legacy classes: `flex-shrink-0`, `flex-grow`. (Should be
      `shrink-0`, `grow`).
- [ ] Verify focus states: Should use `focus:ring-2` and `outline-none`.

### Dependency Integrity

- [ ] `deno.json` should contain `@olli/kvdex` and `zod`.
- [ ] `deno.lock` should be consistent (run `deno install`).

## 5. Execution Summary Template

When an agent completes validation, it should report:

1. Version tested.
2. Preset selected (Memory/KV/Kvdex).
3. Design System detected (Vanilla/DaisyUI).
4. Results of `deno check` (confirm no inference regressions).
5. Any manual fixes required (there should be none).

## 6. Cleanup

```bash
rm -rf ./work/fresh-test-app
```
