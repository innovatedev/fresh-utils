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
    // Handle JSR-rewritten relative path imports
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
    .replace(
      /from "(\.\.\/)+stores\/kvdex\.ts";/g,
      'from "@innovatedev/fresh-session/kvdex-store";',
    )
    // Handle JSR-rewritten versioned specifiers
    // e.g. "jsr:@innovatedev/fresh-session@^0.3.7/kvdex-store" → "@innovatedev/fresh-session/kvdex-store"
    .replace(
      /from "jsr:@innovatedev\/fresh-session@[^"\/]+(?:\/([^"]+))?";/g,
      (_, subpath) =>
        subpath
          ? `from "@innovatedev/fresh-session/${subpath}";`
          : `from "@innovatedev/fresh-session";`,
    )
    // Handle JSR-rewritten dependency specifiers
    // e.g. "jsr:@olli/kvdex@^3.4.2" → "@olli/kvdex"
    .replace(
      /from "jsr:(@[^\/]+\/[^@"]+)@[^"]+";/g,
      'from "$1";',
    )
    .replace(
      /from "(\.\.\/)+utils\.ts";/g,
      'from "@/utils.ts";',
    )
    .trimStart();
}

import denoConfig from "../../../deno.json" with { type: "json" };

type DenoJsonConfig = {
  unstable?: string[];
  imports?: Record<string, string>;
};

function getFreshSessionVersion(): string {
  // 1. Try to extract from import.meta.url (JSR)
  // URL format: https://jsr.io/@innovatedev/fresh-session/0.3.2/src/init/commands/init.ts
  const match = import.meta.url.match(/@innovatedev\/fresh-session\/([^/]+)\//);
  if (match) {
    return `^${match[1]}`;
  }
  // 2. Fallback to deno.json version
  return `^${denoConfig.version}`;
}

function getDependencyVersion(pkg: string, fallback: string): string {
  const imp = denoConfig.imports?.[pkg as keyof typeof denoConfig.imports];
  if (imp && imp.startsWith("jsr:")) {
    // Format: "jsr:@scope/pkg@^1.2.3" or "jsr:@scope/pkg@1.2.3"
    const lastAt = imp.lastIndexOf("@");
    if (lastAt > 4) { // ensuring it's not the @ in jsr:@...
      return imp.substring(lastAt + 1) || fallback;
    }
  }
  return fallback;
}

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
    | "kvdex-basic"
    | "kvdex-prod"
    | undefined;

  // Validate passed preset if any
  const validPresets = [
    "none",
    "basic",
    "kv-basic",
    "kv-prod",
    "kvdex-basic",
    "kvdex-prod",
  ];
  if (preset && !validPresets.includes(preset)) {
    console.error(`Invalid preset: ${preset}`);
    console.error(`Available presets: ${validPresets.join(", ")}`);
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
          {
            name: "Kvdex Basic (Structured KV, Simple Auth Templates)",
            value: "kvdex-basic",
          },
          {
            name: "Kvdex Production (Structured KV, Argon2 + Auth Templates)",
            value: "kvdex-prod",
          },
        ],
        default: "none",
      });
      preset = selectedPreset as
        | "none"
        | "basic"
        | "kv-basic"
        | "kv-prod"
        | "kvdex-basic"
        | "kvdex-prod";
    } else {
      // Default based on store preference if provided or default
      const store = options.store || "kvdex";
      if (store === "kvdex") {
        preset = "kvdex-prod";
      } else if (store === "kv") {
        preset = "kv-prod";
      } else {
        preset = "basic";
      }
      console.log(`Using default preset '${preset}' (store: ${store})`);
    }
  }

  // Determine store type based on preset
  const isKv = preset!.startsWith("kv"); // Matches kv-*, kvdex-*
  const isKvdex = preset!.startsWith("kvdex");
  const isProd = preset!.endsWith("prod");

  // Define templates based on store
  let configTemplate = "config/memory.ts";
  if (isKvdex) configTemplate = "config/kvdex.ts";
  else if (isKv) configTemplate = "config/kv.ts";

  const configContent = sanitizeImports(await readTemplate(configTemplate));

  // 1. Deno JSON Dependency Injection
  await updateDenoJson(options.yes, isProd, isKvdex);

  // 1.5. Check for 'unstable' 'kv' config if using KV store
  if (isKv) {
    await ensureUnstableKv(options.yes);
  }

  // 2. Config & Routes
  await writeFile("config/session.ts", configContent, options.yes);

  // 2.5. Write kv/ files for kvdex presets
  if (isKvdex) {
    await writeFile(
      "kv/db.ts",
      sanitizeImports(await readTemplate("kv/db.ts")),
      options.yes,
    );
    await writeFile(
      "kv/models.ts",
      sanitizeImports(await readTemplate("kv/models.ts")),
      options.yes,
    );
  }

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

    const useDaisy = await hasDaisyUI();
    const headerVariant = useDaisy ? "Header_daisyui.tsx" : "Header.tsx";

    // Header island
    await writeFile(
      "islands/template/Header.tsx",
      sanitizeImports(await readTemplate(`islands/template/${headerVariant}`)),
      options.yes,
    );
  }

  // 3. Patch utils.ts State interface
  await patchUtilsState(options.yes, isKvdex);

  // 4. Patch Main
  await patchMainTs(isKv);

  // 5. Patch _app.tsx
  if (preset !== "none") {
    await patchAppTsx();
  }

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

async function updateDenoJson(
  _yes?: boolean,
  includeArgon2 = false,
  includeKvdex = false,
) {
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
        `jsr:@innovatedev/fresh-session@${getFreshSessionVersion()}`;
      changed = true;
      console.log("Updated deno.json imports.");
    } else {
      console.log("Dependency already exists in deno.json.");
    }

    if (includeArgon2 && !config.imports["@felix/argon2"]) {
      console.log("Adding @felix/argon2 for password hashing...");
      const v = getDependencyVersion("@felix/argon2", "^3.0.2");
      config.imports["@felix/argon2"] = `jsr:@felix/argon2@${v}`;
      changed = true;
    }

    if (includeKvdex && !config.imports["@olli/kvdex"]) {
      const v = getDependencyVersion("@olli/kvdex", "^3.4.2");
      config.imports["@olli/kvdex"] = `jsr:@olli/kvdex@${v}`;
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

const DEFAULT_STATE_MARKER = "shared: string";

async function hasDaisyUI(): Promise<boolean> {
  const checkFile = async (filename: string) => {
    try {
      const content = await Deno.readTextFile(join(CWD, filename));
      return content.includes("daisyui");
    } catch {
      return false;
    }
  };

  return (await checkFile("deno.json")) ||
    (await checkFile("deno.jsonc"));
}

async function patchUtilsState(yes?: boolean, isKvdex = false) {
  const utilsPath = join(CWD, "utils.ts");
  try {
    const content = await Deno.readTextFile(utilsPath);

    if (
      content.includes("State as SessionState") ||
      content.includes('from "@innovatedev/fresh-session"')
    ) {
      console.log("utils.ts already imports session State.");
      return;
    }

    if (content.includes(DEFAULT_STATE_MARKER)) {
      // Default Fresh State — safe to update automatically
      if (
        !await confirm(
          "Update utils.ts State to extend session State?",
          yes,
        )
      ) {
        console.log("Skipping utils.ts update.");
        printStateExample(isKvdex);
        return;
      }

      const sessionImport = isKvdex
        ? 'import type { State as SessionState } from "@innovatedev/fresh-session";\nimport type { User } from "./kv/models.ts";'
        : 'import type { State as SessionState } from "@innovatedev/fresh-session";';

      const stateInterface = isKvdex
        ? `export interface State extends SessionState<User> {\n  shared: string;\n}`
        : `export interface State extends SessionState {\n  shared: string;\n}`;

      const updated = content
        .replace(
          /import\s*\{\s*createDefine\s*\}\s*from\s*"fresh";/,
          `import { createDefine } from "fresh";\n${sessionImport}`,
        )
        .replace(
          /\/\/.*\n*export interface State \{[^}]*\}/s,
          stateInterface,
        );

      await Deno.writeTextFile(utilsPath, updated);
      console.log("Updated utils.ts with session State.");
    } else {
      // Customized State — print guidance
      console.log(
        "\n⚠️  Your utils.ts has a custom State interface.",
      );
      printStateExample(isKvdex);
    }
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      console.warn("utils.ts not found.");
    } else {
      console.error("Error patching utils.ts:", e);
    }
  }
}

function printStateExample(isKvdex = false) {
  const userImport = isKvdex
    ? '\n  import type { User } from "./kv/models.ts";'
    : "";
  const stateExtends = isKvdex ? "SessionState<User>" : "SessionState";
  console.log(
    `\nPlease update your State interface in utils.ts to extend the session State:\n\n  import type { State as SessionState } from "@innovatedev/fresh-session";${userImport}\n\n  export interface State extends ${stateExtends} {\n    // your existing properties...\n  }\n`,
  );
}

async function patchAppTsx() {
  const appPath = join(CWD, "routes/_app.tsx");
  try {
    let content = await Deno.readTextFile(appPath);
    if (
      content.includes("<body>\n        <Component />\n      </body>")
    ) {
      if (!content.includes("import Header")) {
        content = content.replace(
          /^(import .*?;)/m,
          `$1\nimport Header from "../islands/template/Header.tsx";`,
        );
      }

      content = content.replace(
        /export default function App\(\{\s*([\w\s,]+?)\s*\}:\s*PageProps\)/,
        (_match, inner) => {
          const params = inner.split(",").map((s: string) => s.trim()).filter(
            Boolean,
          );
          if (!params.includes("state")) params.push("state");
          if (!params.includes("url")) params.push("url");
          return `export default function App({ ${
            params.join(", ")
          } }: PageProps)`;
        },
      );

      content = content.replace(
        /<body>\n\s*<Component \/>\n\s*<\/body>/,
        `<body>\n        <Header activeUrl={url?.pathname} username={state?.user?.username ?? state?.userId} />\n        <Component />\n      </body>`,
      );

      await Deno.writeTextFile(appPath, content);
      console.log("Updated routes/_app.tsx with Header.");
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) {
      console.error("Error patching routes/_app.tsx:", e);
    }
  }
}

async function patchMainTs(isKv = false) {
  const mainTsPath = join(CWD, "main.ts");
  try {
    let content = await Deno.readTextFile(mainTsPath);
    let patched = false;

    // 0. Add triple-slash reference for KV stores
    const kvRef = '/// <reference lib="deno.unstable" />';
    if (isKv && !content.includes(kvRef)) {
      content = kvRef + "\n" + content;
      console.log("Added deno.unstable reference to main.ts");
      patched = true;
    }

    const importStmt = 'import { session } from "./config/session.ts";';
    const middlewareUsage = "app.use(session)";

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
