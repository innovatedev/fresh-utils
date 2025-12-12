import { Confirm, Select } from "../deps.ts";
import { join } from "../deps.ts";
import { jsonc } from "../deps.ts";
const CWD = Deno.cwd();

// Helper to read template
async function readTemplate(path: string): Promise<string> {
  const url = new URL(`../templates/${path}`, import.meta.url);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to read template '${path}': ${res.status} ${res.statusText}`,
    );
  }
  return await res.text();
}

/**
 * JSR rewrites imports to be relative when publishing.
 * We need to revert them to package imports for the user's project.
 */
function sanitizeImports(content: string): string {
  return content
    .replace(/\/\*\* @jsx.*?\*\//g, "")
    .replace(
      /from "(\.\.\/)+mod\.ts";/g,
      'from "@innovatedev/fresh-session";',
    )
    .replace(
      /from "(\.\.\/)+stores\/kv\.ts";/g,
      'from "@innovatedev/fresh-session/kv-store";',
    )
    .replace(
      /from "(\.\.\/)+stores\/memory\.ts";/g,
      'from "@innovatedev/fresh-session/memory-store";',
    )
    .trimStart();
}

type DenoJsonConfig = {
  unstable?: string[];
  imports?: Record<string, string>;
};

/**
 * Usage: `deno run -Ar jsr:@innovatedev/fresh-session/init`
 *
 * @param options - Configuration options for the initialization.
 */
export async function initAction(
  options: { yes?: boolean; store?: string; preset?: string },
) {
  console.log("Initializing session middleware...");

  await checkFreshVersion();

  let preset = options.preset as
    | "none"
    | "basic"
    | "kv-basic"
    | "kv-prod"
    | undefined;

  // Validate passed preset if any
  if (preset && !["none", "basic", "kv-basic", "kv-prod"].includes(preset)) {
    console.error(`Invalid preset: ${preset}`);
    console.error("Available presets: none, basic, kv-basic, kv-prod");
    Deno.exit(1);
  }

  if (!preset) {
    if (!options.yes) {
      const selectedPreset = await Select.prompt({
        message: "Select an initialization preset:",
        options: [
          { name: "None (Config only, no routes)", value: "none" },
          {
            name: "Basic (Memory Store, Simple Auth Templates)",
            value: "basic",
          },
          {
            name: "KV Basic (Deno KV, Simple Auth Templates)",
            value: "kv-basic",
          },
          {
            name: "KV Production (Deno KV, Argon2 + Auth Templates)",
            value: "kv-prod",
          },
        ],
        default: "none",
      });
      preset = selectedPreset as "none" | "basic" | "kv-basic" | "kv-prod";
    } else {
      // Default based on store preference if provided or default
      const store = options.store || "kv";
      if (store === "kv") {
        preset = "kv-prod";
      } else {
        preset = "basic";
      }
      console.log(`Using default preset '${preset}' (store: ${store})`);
    }
  }

  // Determine store type based on preset
  const isKv = preset!.startsWith("kv");
  const isProd = preset === "kv-prod";

  // Define templates based on store
  // Define templates based on store
  const configTemplate = isKv ? "config/kv.ts" : "config/memory.ts";
  const configContent = sanitizeImports(await readTemplate(configTemplate));

  // 1. Deno JSON Dependency Injection
  await updateDenoJson(options.yes, isProd);

  // 1.5. Check for 'unstable' 'kv' config if using KV store
  if (isKv) {
    await ensureUnstableKv(options.yes);
  }

  // 2. Config & Routes
  await writeFile("config/session.ts", configContent, options.yes);

  if (preset !== "none") {
    const suffix = isProd ? "_prod" : "_basic";
    // Shared logout
    await writeFile(
      "routes/logout.ts",
      sanitizeImports(await readTemplate("routes/logout.ts")),
      options.yes,
    );

    // Variant login/register
    let loginContent = sanitizeImports(
      await readTemplate(`routes/login${suffix}.tsx`),
    );
    let registerContent = sanitizeImports(
      await readTemplate(`routes/register${suffix}.tsx`),
    );

    if (isProd) {
      // Uncomment DB logic for production preset
      loginContent = loginContent
        .replace(/\/\*|\*\//g, "")
        .replace(
          "      // Note: In a real app, do this ONLY after verification passes!\n",
          "",
        );
      registerContent = registerContent.replace(/\/\*|\*\//g, "");
    }

    await writeFile(
      "routes/login.tsx",
      loginContent,
      options.yes,
    );
    await writeFile(
      "routes/register.tsx",
      registerContent,
      options.yes,
    );
  }

  // 3. Patch Main
  await patchMainTs();

  console.log("\nSetup complete!");
}

async function ensureUnstableKv(yes?: boolean) {
  const denoJsonPath = join(CWD, "deno.json");
  try {
    const content = await Deno.readTextFile(denoJsonPath);
    let config: DenoJsonConfig;
    try {
      config = jsonc.parse(content) as DenoJsonConfig;
    } catch {
      console.warn("Could not parse deno.json to check for 'unstable' config.");
      return;
    }

    const unstable = config.unstable || [];
    // 'unstable' can be an array of strings.
    // If it's not an array (e.g. strict boolean in older deno?), we handle array only for now as 'kv' is a feature flag.
    if (!Array.isArray(unstable)) {
      // If it's explicitly true or something else, we might not want to touch it blindly?
      // Modern Deno uses array for features.
      // Let's assume array or missing.
    } else if (unstable.includes("kv")) {
      return; // Already has kv
    }

    // Need to add it
    if (
      !await confirm(
        "Deno KV requires 'kv' to be listed in the 'unstable' config in deno.json. Add it?",
        yes,
      )
    ) {
      console.log(
        "Skipping 'unstable' config update. You may need to add it manually.",
      );
      return;
    }

    const newUnstable = [...(Array.isArray(unstable) ? unstable : []), "kv"];
    config.unstable = newUnstable;

    await Deno.writeTextFile(denoJsonPath, JSON.stringify(config, null, 2));
    console.log("Added 'kv' to 'unstable' in deno.json.");
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      // No deno.json, can't update it
    } else {
      console.error("Error checking 'unstable' config:", e);
    }
  }
}

async function updateDenoJson(_yes?: boolean, includeArgon2 = false) {
  const denoJsonPath = join(CWD, "deno.json");
  try {
    const content = await Deno.readTextFile(denoJsonPath);
    // Use jsonc to parse to handle comments if present (though we might stripping them on write if we use JSON.stringify)
    // Ideally we simple check imports manually or use AST.
    // For simplicity, we'll try to parse, add, stringify.
    // Warning: This strips comments.
    // The user asked for it to be automated.

    let config: DenoJsonConfig;
    try {
      config = jsonc.parse(content) as DenoJsonConfig;
    } catch (_e) {
      console.warn("Could not parse deno.json. Skipping dependency injection.");
      return;
    }

    if (!config.imports) config.imports = {};
    let changed = false;

    if (!config.imports["@innovatedev/fresh-session"]) {
      console.log("Adding dependency to deno.json...");
      config.imports["@innovatedev/fresh-session"] =
        "jsr:@innovatedev/fresh-session";
      changed = true;
      console.log("Updated deno.json imports.");
    } else {
      console.log("Dependency already exists in deno.json.");
    }

    if (includeArgon2 && !config.imports["@felix/argon2"]) {
      console.log("Adding @felix/argon2 for password hashing...");
      config.imports["@felix/argon2"] = "jsr:@felix/argon2";
      changed = true;
    }

    if (changed) {
      await Deno.writeTextFile(denoJsonPath, JSON.stringify(config, null, 2));
    }
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      console.warn("No deno.json found in current directory.");
    } else {
      console.error("Error updating deno.json:", e);
    }
  }
}

async function confirm(msg: string, yes?: boolean): Promise<boolean> {
  if (yes) return true;
  return await Confirm.prompt(msg);
}

async function writeFile(path: string, content: string, yes?: boolean) {
  const fullPath = join(CWD, path);
  try {
    await Deno.stat(fullPath);
    if (!await confirm(`File ${path} already exists. Overwrite?`, yes)) {
      console.log(`Skipping ${path}`);
      return;
    }
  } catch {
    // File doesn't exist
  }

  const dir = join(fullPath, "..");
  await Deno.mkdir(dir, { recursive: true });
  await Deno.writeTextFile(fullPath, content);
  console.log(`Created ${path}`);
}

async function patchMainTs() {
  const mainTsPath = join(CWD, "main.ts");
  try {
    let content = await Deno.readTextFile(mainTsPath);
    let patched = false;

    const importStmt = 'import { session } from "./config/session.ts";';
    const middlewareUsage = "app.use(session);";

    // 1. Check/Add Import
    if (!content.includes(importStmt)) {
      const lastImportMatch = content.match(/import.*;\n(?!import)/);
      if (lastImportMatch) {
        const idx = lastImportMatch.index! + lastImportMatch[0].length;
        content = content.slice(0, idx) + importStmt + "\n" +
          content.slice(idx);
      } else {
        content = importStmt + "\n" + content;
      }
      console.log("Added import to main.ts");
      patched = true;
    } else {
      console.log("Import already exists in main.ts");
    }

    // 2. Check/Add Middleware Usage
    if (!content.includes(middlewareUsage)) {
      const staticFilesUsage = "app.use(staticFiles());";
      const usageIndex = content.indexOf(staticFilesUsage);

      if (usageIndex !== -1) {
        const insertAt = usageIndex + staticFilesUsage.length;
        const middlewareCode = `\n\n${middlewareUsage}`;

        content = content.slice(0, insertAt) + middlewareCode +
          content.slice(insertAt);
        console.log("Added app.use(session) to main.ts");
        patched = true;
      } else {
        console.warn(
          "Could not auto-patch main.ts (anchor 'app.use(staticFiles());' not found).",
        );
      }
    } else {
      console.log("Middleware usage already exists in main.ts");
    }

    if (patched) {
      await Deno.writeTextFile(mainTsPath, content);
      console.log("Updated main.ts");
    }
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      console.warn("main.ts not found.");
    } else {
      console.error("Error patching main.ts:", err);
    }
  }
}

async function checkFreshVersion() {
  const denoJsonPath = join(CWD, "deno.json");
  let content: string;
  try {
    content = await Deno.readTextFile(denoJsonPath);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      console.error(
        "Error: deno.json not found. Please run this command in the root of your Fresh project.",
      );
      Deno.exit(1);
    }
    throw e;
  }

  let config: DenoJsonConfig;
  try {
    config = jsonc.parse(content) as DenoJsonConfig;
  } catch {
    console.error("Error: Could not parse deno.json.");
    Deno.exit(1);
  }

  const freshImport = config.imports?.["fresh"];
  if (!freshImport) {
    console.error(
      "Error: 'fresh' dependency not found in deno.json 'imports'.",
    );
    Deno.exit(1);
  }

  // formats: "jsr:@fresh/core@^2.0.0", "https://...", "npm:..."
  // specific check for fresh v2
  // We look for "@2" or "^2"

  const versionMatch = freshImport.match(/@\^?(\d+)\./);
  if (versionMatch) {
    const major = parseInt(versionMatch[1], 10);
    if (major < 2) {
      console.error(
        `Error: Fresh version must be >= 2.0.0 (Found major version ${major}).`,
      );
      Deno.exit(1);
    }
  } else {
    // If we can't detect version easily, verify if it is arguably fresh 2 based on usage or warn
    // For now, loose check or warn.
    // Let's assume standard JSR usage imports.
    // If user uses raw URL without semver in regex scope, we might warn.

    // strict check logic as requested: "at least version 2, abort if not"
    // If we can't determine, maybe we shouldn't abort blindly, but the prompt implies strictness.
    // Let's print the import and ask/fail.

    console.warn(
      `Warning: Could not determine Fresh version from import '${freshImport}'.`,
    );
    console.warn("Please ensure you are using Fresh v2.");
    // We allow proceeding with warning if regex fails (e.g. edge cases),
    // but if we matched < 2 we definitely exited.
  }
}
