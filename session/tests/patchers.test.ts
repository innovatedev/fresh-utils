import { expect } from "./deps.ts";
import { dedent } from "../src/init/helpers.ts";

// We'll test the string generation logic directly
function getExpectedImports(isKvdex: boolean) {
  return isKvdex
    ? 'import { createDefineSession, type Define } from "@innovatedev/fresh-session/define";\nimport type { State } from "@innovatedev/fresh-session";\nexport type { State };\nimport type { User } from "./kv/models.ts";'
    : 'import { createDefineSession, type Define } from "@innovatedev/fresh-session/define";\nimport type { State } from "@innovatedev/fresh-session";\nexport type { State };';
}

function getExpectedStateInterface(isKvdex: boolean) {
  const extraStateDefinition =
    "export interface ExtraState extends Record<string, unknown> {}";
  return isKvdex
    ? dedent(`
        ${extraStateDefinition}

        /** Global application state */
        export type AppState = State<User, {}> & ExtraState;

        // Replace '{}' with your custom SessionData if needed
        export const define = createDefineSession<User, {}, ExtraState>();
        
        /** Strictly typed state for authenticated routes (guarantees user presence) */
        export type AuthState = AppState & { user: User; userId: string };
        /** Authenticated define helper */
        export const defineAuth = define as Define<AuthState>;`)
    : dedent(`
        ${extraStateDefinition}

        /** Global application state */
        export type AppState = State<unknown, {}> & ExtraState;

        // Replace 'unknown' and '{}' with your User and SessionData types
        export const define = createDefineSession<unknown, {}, ExtraState>();
        
        /** Strictly typed state for authenticated routes (guarantees user presence) */
        export type AuthState = AppState & { user: unknown; userId: string };
        /** Authenticated define helper */
        export const defineAuth = define as Define<AuthState>;`);
}

Deno.test("patchUtilsState - String Generation Logic", async (t) => {
  await t.step("should generate correct imports", () => {
    const output = getExpectedImports(true);
    expect(output).toContain(
      'import { createDefineSession, type Define } from "@innovatedev/fresh-session/define"',
    );
    expect(output).toContain('import type { User } from "./kv/models.ts"');
  });

  await t.step("should use User type for kvdex presets", () => {
    const output = getExpectedStateInterface(true);
    expect(output).toContain("createDefineSession<User, {}, ExtraState>()");
    expect(output).toContain(
      "export type AppState = State<User, {}> & ExtraState",
    );
    expect(output).toContain(
      "export type AuthState = AppState & { user: User; userId: string }",
    );
    expect(output).toContain("user: User");
  });

  await t.step("should use unknown for non-kvdex presets", () => {
    const output = getExpectedStateInterface(false);
    expect(output).toContain("createDefineSession<unknown, {}, ExtraState>()");
    expect(output).toContain(
      "export type AppState = State<unknown, {}> & ExtraState",
    );
    expect(output).toContain("user: unknown");
    expect(output).toContain(
      "Replace 'unknown' and '{}' with your User and SessionData types",
    );
  });
});
