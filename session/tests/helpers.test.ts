import { expect } from "./deps.ts";
import { hasDaisyUI, sanitizeImports } from "../src/init/helpers.ts";

Deno.test("sanitizeImports", async (t) => {
  await t.step("should remove @jsx annotations", () => {
    const input =
      '/** @jsx h */\n/** @jsxFrag Fragment */\nimport { h } from "preact";';
    const expected = 'import { h } from "preact";';
    expect(sanitizeImports(input)).toBe(expected);
  });

  await t.step("should rewrite relative mod.ts imports to package name", () => {
    const input = 'import { session } from "../../../mod.ts";';
    const expected = 'import { session } from "@innovatedev/fresh-session";';
    expect(sanitizeImports(input)).toBe(expected);
  });

  await t.step(
    "should rewrite relative store imports to package subpaths",
    () => {
      const input = `
import { KvStore } from "../stores/kv.ts";
import { MemoryStore } from "../../stores/memory.ts";
import { KvdexStore } from "../../../stores/kvdex.ts";
    `.trimStart();
      const expected = `
import { KvStore } from "@innovatedev/fresh-session/kv-store";
import { MemoryStore } from "@innovatedev/fresh-session/memory-store";
import { KvdexStore } from "@innovatedev/fresh-session/kvdex-store";
    `.trimStart();
      expect(sanitizeImports(input)).toBe(expected);
    },
  );

  await t.step(
    "should handle JSR-rewritten versioned specifiers for fresh-session",
    () => {
      const input = `
import { session } from "jsr:@innovatedev/fresh-session@^0.3.7";
import { KvStore } from "jsr:@innovatedev/fresh-session@^0.3.7/kv-store";
    `.trimStart();
      const expected = `
import { session } from "@innovatedev/fresh-session";
import { KvStore } from "@innovatedev/fresh-session/kv-store";
    `.trimStart();
      expect(sanitizeImports(input)).toBe(expected);
    },
  );

  await t.step(
    "should handle JSR/NPM dependency specifiers by removing versions",
    () => {
      const jsrInput = 'import { kvdex } from "jsr:@olli/kvdex@^3.4.2";';
      const jsrExpected = 'import { kvdex } from "@olli/kvdex";';
      expect(sanitizeImports(jsrInput)).toBe(jsrExpected);

      const npmInput = 'import { somePkg } from "npm:some-pkg@^1.2.3";';
      const npmExpected = 'import { somePkg } from "some-pkg";';
      expect(sanitizeImports(npmInput)).toBe(npmExpected);

      const signalsInput =
        'import { useSignal } from "npm:@preact/signals@^2.8.2";';
      const signalsExpected = 'import { useSignal } from "@preact/signals";';
      expect(sanitizeImports(signalsInput)).toBe(signalsExpected);
    },
  );

  await t.step("should rewrite relative utils.ts to @/utils.ts", () => {
    const input = 'import { someUtil } from "../../../utils.ts";';
    const expected = 'import { someUtil } from "@/utils.ts";';
    expect(sanitizeImports(input)).toBe(expected);
  });

  await t.step("should trim leading whitespace", () => {
    const input = '   \n\nimport { h } from "preact";';
    const expected = 'import { h } from "preact";';
    expect(sanitizeImports(input)).toBe(expected);
  });

  await t.step("should handle complex combined input", () => {
    const _input = `
/** @jsx h */
import { session } from "../../mod.ts";
import { KvStore } from "../stores/kv.ts";
import { kvdex } from "jsr:@olli/kvdex@^3.4.2";
import { someUtil } from "./utils.ts";
    `.trimStart();

    // Note: ./utils.ts doesn't match (\.\.\/)+utils\.ts
    // Let's test with ../utils.ts too
    const input2 = `
/** @jsx h */
import { session } from "../../mod.ts";
import { someUtil } from "../../utils.ts";
    `.trimStart();

    const expected2 = `
import { session } from "@innovatedev/fresh-session";
import { someUtil } from "@/utils.ts";
    `.trimStart();

    expect(sanitizeImports(input2)).toBe(expected2);
  });
});

Deno.test("hasDaisyUI", async (t) => {
  const createMockReadFile = (files: Record<string, string>) => {
    return (path: string) => {
      for (const [name, content] of Object.entries(files)) {
        if (path.endsWith(name)) return Promise.resolve(content);
      }
      return Promise.reject(new Deno.errors.NotFound());
    };
  };

  await t.step("should return true if deno.json contains daisyui", async () => {
    const readFile = createMockReadFile({
      "deno.json": JSON.stringify({ imports: { "daisyui": "npm:daisyui" } }),
    });
    expect(await hasDaisyUI({ readFile })).toBe(true);
  });

  await t.step("should return false if no file contains daisyui", async () => {
    const readFile = createMockReadFile({});
    expect(await hasDaisyUI({ readFile })).toBe(false);
  });

  await t.step(
    "should return true if deno.jsonc contains daisyui",
    async () => {
      const readFile = createMockReadFile({
        "deno.jsonc": '{ "imports": { "daisyui": "npm:daisyui" } }',
      });
      expect(await hasDaisyUI({ readFile })).toBe(true);
    },
  );

  await t.step("should return true if case is different", async () => {
    const readFile = createMockReadFile({
      "deno.json": JSON.stringify({ imports: { "daisyUI": "npm:daisyui" } }),
    });
    expect(await hasDaisyUI({ readFile })).toBe(true);
  });
});
