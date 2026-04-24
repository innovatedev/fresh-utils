import { expect } from "./deps.ts";
import { fromFileUrl, join } from "@std/path";
import { copy } from "@std/fs";

const __dirname = fromFileUrl(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const INIT_SCRIPT = join(ROOT, "src", "init", "mod.ts");
const FIXTURE_DIR = join(__dirname, "fixtures", "fresh-boilerplate");

Deno.test({
  name: "Init Script E2E - Full Project Generation",
  async fn() {
    const tempDir = await Deno.makeTempDir({ prefix: "fresh_session_test_" });

    try {
      // 1. Setup Fixture
      await copy(FIXTURE_DIR, tempDir, { overwrite: true });

      // 2. Run Init Script
      const command = new Deno.Command(Deno.execPath(), {
        args: [
          "run",
          "-A",
          INIT_SCRIPT,
          "-y",
        ],
        cwd: tempDir,
        env: {
          "DENO_NO_WORKSPACE": "1",
        },
      });

      const { success, stdout, stderr } = await command.output();
      const output = new TextDecoder().decode(stdout);
      const error = new TextDecoder().decode(stderr);

      if (!success) {
        console.error("Init script failed:", error);
      }
      expect(success).toBe(true);
      expect(output).toContain("Setup complete!");

      // 3. Verify Files Created
      const expectedFiles = [
        "config/session.ts",
        "kv/db.ts",
        "kv/models.ts",
        "routes/(guest)/login.tsx",
        "routes/(guest)/register.tsx",
        "islands/layout/Header.tsx",
      ];

      for (const file of expectedFiles) {
        const stats = await Deno.stat(join(tempDir, file));
        expect(stats.isFile).toBe(true);
      }

      // 4. Verify utils.ts content (the specific fix for v0.5.0)
      const utilsContent = await Deno.readTextFile(join(tempDir, "utils.ts"));
      expect(utilsContent).toContain("export type { State }");
      expect(utilsContent).toContain(
        "export type AppState = State<User, {}> & ExtraState",
      );
      expect(utilsContent).toContain(
        "createDefineSession<User, {}, ExtraState>()",
      );

      // 5. Verify deno.json updates
      const denoJson = JSON.parse(
        await Deno.readTextFile(join(tempDir, "deno.json")),
      );
      expect(denoJson.imports["@innovatedev/fresh-session"]).toBeDefined();
      expect(denoJson.unstable).toContain("kv");

      // 6. Run Deno Check
      // We need to point the import map to local source for this to work without JSR publish
      denoJson.imports["@innovatedev/fresh-session"] = join(
        ROOT,
        "src",
        "mod.ts",
      );
      denoJson.imports["@innovatedev/fresh-session/define"] = join(
        ROOT,
        "src",
        "define.ts",
      );
      denoJson.imports["@innovatedev/fresh-session/kvdex-store"] = join(
        ROOT,
        "src",
        "stores",
        "kvdex.ts",
      );
      // Add missing std imports for the check to pass
      denoJson.imports["@std/http"] = "jsr:@std/http@^1.0.22";
      denoJson.imports["@std/http/cookie"] = "jsr:@std/http@^1.0.22/cookie";

      // Ensure JSX is configured
      denoJson.compilerOptions = {
        "jsx": "precompile",
        "jsxImportSource": "preact",
      };

      await Deno.writeTextFile(
        join(tempDir, "deno.json"),
        JSON.stringify(denoJson, null, 2),
      );

      // Run deno install to fetch dependencies
      const installCommand = new Deno.Command(Deno.execPath(), {
        args: ["install"],
        cwd: tempDir,
        env: { "DENO_NO_WORKSPACE": "1" },
      });
      await installCommand.output();

      const checkCommand = new Deno.Command(Deno.execPath(), {
        args: [
          "check",
          "--unstable-kv",
          "utils.ts",
          "config/session.ts",
          "routes/_app.tsx",
          "routes/index.tsx",
        ],
        cwd: tempDir,
        env: {
          "DENO_NO_WORKSPACE": "1",
        },
      });

      const checkResult = await checkCommand.output();
      if (!checkResult.success) {
        const checkError = new TextDecoder().decode(checkResult.stderr);
        console.error("Deno check failed on generated project:\n", checkError);
      }
      expect(checkResult.success).toBe(true);
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
