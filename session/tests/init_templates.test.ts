import { expect } from "./deps.ts";
import { fromFileUrl, join } from "../src/init/deps.ts";

const TEMPLATES_PATH = join(
  fromFileUrl(new URL("../src/init/templates/routes", import.meta.url)),
);

async function readTemplate(name: string) {
  const path = join(TEMPLATES_PATH, name);
  return await Deno.readTextFile(path);
}

Deno.test("Registration Templates - Parentheses and Placeholder Structure", async (t) => {
  const templates = [
    "register_prod.tsx",
    "register_prod_daisyui.tsx",
    "register_basic.tsx",
    "register_basic_daisyui.tsx",
  ];

  for (const name of templates) {
    await t.step(`checking ${name}`, async () => {
      const content = await readTemplate(name);

      // Should contain the placeholder with parentheses
      // Match: ! ( /* {{REGISTER_VALIDATION}} */ true )
      // OR if it's the only check: ( /* {{REGISTER_VALIDATION}} */ true )
      const regex =
        /!\s*\(\s*\/\*\s*{{REGISTER_VALIDATION}}\s*\*\/\s*true\s*\)/m;
      expect(content).toMatch(regex);
    });
  }
});

Deno.test("Registration Templates - Replacement Logic", async (t) => {
  const registerValidation = "username && email";
  const registerImports = 'import { hash } from "@felix/argon2";';

  const templates = [
    "register_prod.tsx",
    "register_prod_daisyui.tsx",
  ];

  for (const name of templates) {
    await t.step(`simulating replacement for ${name}`, async () => {
      const content = await readTemplate(name);

      let finalCode = content.replace(
        /\/\* {{REGISTER_VALIDATION}} \*\/ true/m,
        registerValidation,
      );
      finalCode = finalCode.replace(
        "// {{AUTH_IMPORTS}}",
        registerImports,
      );

      // Verify that it is correctly parenthesized
      expect(finalCode).toContain(`!(${registerValidation})`);

      // Verify correct imports
      expect(finalCode).toContain('import { hash } from "@felix/argon2"');
      expect(finalCode).not.toContain("verify");
    });
  }

  await t.step(
    "simulating combined validation (username && email)",
    async () => {
      const content = await readTemplate("register_prod.tsx");
      const combinedValidation = "username && email";
      const finalCode = content.replace(
        /\/\* {{REGISTER_VALIDATION}} \*\/ true/m,
        combinedValidation,
      );
      // Should be correctly parenthesized as !(username && email)
      expect(finalCode).toContain(`!(${combinedValidation})`);
    },
  );
});

Deno.test("Login Templates - Structure", async (t) => {
  const templates = ["login_prod.tsx", "login_prod_daisyui.tsx"];

  for (const name of templates) {
    await t.step(`checking ${name}`, async () => {
      const content = await readTemplate(name);
      expect(content).toContain("if (!login || !password)");
    });
  }
});

Deno.test("Logout Template - Structure", async () => {
  const content = await readTemplate("logout.ts");
  expect(content).toContain("await ctx.state.logout()");
  expect(content).not.toContain("{{AUTH_LOGIC}}");
  expect(content).toContain("define.handlers");
  expect(content).not.toContain("defineAuth.handlers");
});
