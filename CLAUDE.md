# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Workspace structure

This is a Deno monorepo. Each package lives in its own subdirectory and is
listed as a workspace member in the root `deno.json`. Package-specific
architecture is documented in `<package>/CLAUDE.md`.

| Package       | Directory  | JSR name                     |
| ------------- | ---------- | ---------------------------- |
| fresh-session | `session/` | `@innovatedev/fresh-session` |

## Commands

```bash
# From repo root or session/ directory
deno task check        # Full validation: fmt, type-check, lint, doc-lint, tests
deno task test         # Run tests only

# Run a single test file
deno test -A session/tests/<file>_test.ts

# Check JSDoc on all exports
deno run -A tools/check-docs.ts
```

## AI Transparency Requirements

All packages **must** carry `"ai-generated"` and `"ai-assisted"` tags in
`deno.json` and a disclosure in `README.md`. The `deno task compliance` command
enforces this. New modules added to the workspace must follow the same pattern.

## Publishing

Publishing to JSR is automated via `.github/workflows/publish.yml` on push to
`main`. Version bumps go in `<package>/deno.json`.

## Adding a new package

1. Create the package directory and its own `deno.json` (with `name`, `version`,
   `exports`, `tags: ["ai-generated", "ai-assisted"]`).
2. Add the directory to the `workspace` array in the root `deno.json`.
3. Add a row to the package table above.
4. Add a `<package>/CLAUDE.md` covering its architecture.
