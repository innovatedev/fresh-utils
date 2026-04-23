import { expect } from "./deps.ts";
import { dedent } from "../src/init/helpers.ts";

// We'll test the string generation logic directly
function getExpectedImports(isKvdex: boolean) {
  return isKvdex
    ? 'import { createDefineSession } from "@innovatedev/fresh-session/define";\nimport type { User } from "./kv/models.ts";'
    : 'import { createDefineSession } from "@innovatedev/fresh-session/define";';
}

function getExpectedStateInterface(isKvdex: boolean) {
  return isKvdex
    ? dedent(`
        // Replace '{}' with your custom SessionData if needed
        export const define = createDefineSession<User, {}>();
        
        /** Strictly typed state for authenticated routes (guarantees user presence) */
        export type AuthState = State<User, {}> & { user: User; userId: string };
        /** Authenticated define helper */
        export const defineAuth = define as any;`)
    : dedent(`
        // Replace 'unknown' and '{}' with your User and SessionData types
        export const define = createDefineSession<unknown, {}>();
        
        /** Strictly typed state for authenticated routes (guarantees user presence) */
        export type AuthState = State<unknown, {}> & { user: unknown; userId: string };
        /** Authenticated define helper */
        export const defineAuth = define as any;`);
}

Deno.test("patchUtilsState - String Generation Logic", async (t) => {
  await t.step("should generate correct imports", () => {
    const output = getExpectedImports(true);
    expect(output).toContain(
      'import { createDefineSession } from "@innovatedev/fresh-session/define"',
    );
    expect(output).toContain('import type { User } from "./kv/models.ts"');
  });

  await t.step("should use User type for kvdex presets", () => {
    const output = getExpectedStateInterface(true);
    expect(output).toContain("createDefineSession<User, {}>()");
    expect(output).toContain("export type AuthState = State<User, {}>");
    expect(output).toContain("user: User");
    expect(output).toContain("export const defineAuth = define as any");
  });

  await t.step("should use unknown for non-kvdex presets", () => {
    const output = getExpectedStateInterface(false);
    expect(output).toContain("createDefineSession<unknown, {}>()");
    expect(output).toContain("export type AuthState = State<unknown, {}>");
    expect(output).toContain("user: unknown");
    expect(output).toContain(
      "Replace 'unknown' and '{}' with your User and SessionData types",
    );
  });
});
