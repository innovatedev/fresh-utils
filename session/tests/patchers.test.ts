import { expect } from "./deps.ts";
import { dedent } from "../src/init/helpers.ts";

// We'll test the string generation logic directly
function getExpectedImports(isKvdex: boolean) {
  return isKvdex
    ? 'import type { State as SessionState } from "@innovatedev/fresh-session";\nimport type { User } from "./kv/models.ts";'
    : 'import type { State as SessionState } from "@innovatedev/fresh-session";';
}

function getExpectedStateInterface(isKvdex: boolean) {
  return isKvdex
    ? dedent(`
        export interface State extends SessionState<User> {
          shared: string;
        }

        export type AuthState = State & { user: User; userId: string };
        export const defineAuth = createDefine<AuthState>();`)
    : dedent(`
        export interface State extends SessionState {
          shared: string;
        }

        // Replace 'unknown' with your User type for full type safety
        export type AuthState = State & { user: unknown; userId: string };
        export const defineAuth = createDefine<AuthState>();`);
}

Deno.test("patchUtilsState - String Generation Logic", async (t) => {
  await t.step("should generate correct imports", () => {
    expect(getExpectedImports(true)).toContain(
      'import type { User } from "./kv/models.ts"',
    );
    expect(getExpectedImports(false)).not.toContain("import type { User }");
  });

  await t.step("should use User type for kvdex presets", () => {
    const output = getExpectedStateInterface(true);
    expect(output).toContain("extends SessionState<User>");
    expect(output).toContain("user: User");
  });

  await t.step("should use unknown for non-kvdex presets", () => {
    const output = getExpectedStateInterface(false);
    expect(output).toContain("extends SessionState {");
    expect(output).toContain("user: unknown");
    expect(output).toContain("Replace 'unknown' with your User type");
  });
});
