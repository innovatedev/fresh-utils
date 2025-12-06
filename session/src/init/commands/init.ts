import { Confirm, Select } from "jsr:@cliffy/prompt@1.0.0-rc.8";
import { join } from "jsr:@std/path@^1.0.0";
import * as jsonc from "jsr:@std/jsonc@^1.0.0";

const CWD = Deno.cwd();

interface InitOptions {
  store?: string;
  yes?: boolean;
}

export async function initAction(options: InitOptions) {
  console.log("Initializing session middleware...");

  await checkFreshVersion();

  let store = options.store || "memory";

  // Interactive store selection if not passed explicitly (Cliffy options might handle default,
  // but if we want to confirm or offer choice if explicitly unspecified vs default, we check logic here)
  // For now, if default is memory, we assume user accepts it unless they use interactive mode perhaps?
  // The command definition sets default to "memory".
  // If we want to force prompt if not passed, we shouldn't set default in command.
  // But let's stick to the options. If user wants interactive, maybe we should have not set default.
  // Actually, let's logic check: if !options.yes, we can ask for confirmation or changes.

  if (!options.yes) {
    const selectedStore = await Select.prompt({
      message: "Which session store do you want to use?",
      options: [
        { name: "Memory (Simple, good for dev)", value: "memory" },
        { name: "Deno KV (Persistent, production ready)", value: "kv" },
      ],
      default: store === "kv" ? "kv" : "memory",
    });
    store = selectedStore;
  }

  // Define templates based on store
  let storeImport = "";
  let storeClass = "";
  let storeInit = "";

  if (store === "kv") {
    storeImport =
      'import { DenoKvSessionStorage } from "@innovatedev-fresh/session/kv-store";';
    storeClass = "DenoKvSessionStorage";
    storeInit = "new DenoKvSessionStorage(await Deno.openKv())";
  } else {
    storeImport =
      'import { MemorySessionStorage } from "@innovatedev-fresh/session/memory-store";';
    storeClass = "MemorySessionStorage";
    storeInit = "new MemorySessionStorage()";
  }

  const templates = {
    config:
      `import { createSessionMiddleware } from "@innovatedev-fresh/session";
${storeImport}

export const sessionMiddleware = createSessionMiddleware({
  store: ${storeInit},
  cookie: {
    name: "sessionId",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    // maxAge: 60 * 60 * 24 * 7, // 1 week
  },
});
`,
    login: `import { define } from "../utils.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const form = await ctx.req.formData();
    const username = form.get("username")?.toString();

    if (username) {
      // In a real app, verify credentials here!
      ctx.state.session.data = { username }; 
      
      return new Response("", {
        status: 303,
        headers: { Location: "/" },
      });
    }

    return new Response("", {
        status: 303,
        headers: { Location: "/login" },
    });
  },
});

export default define.page<typeof handler>((ctx) => {
  return (
    <div class="p-4 mx-auto max-w-screen-md">
      <h1 class="text-2xl font-bold mb-4">Login</h1>
      <form method="POST">
        <input 
          type="text" 
          name="username" 
          placeholder="Enter username" 
          class="border p-2 rounded mr-2"
        />
        <button type="submit" class="bg-blue-500 text-white p-2 rounded">
          Login
        </button>
      </form>
    </div>
  );
});
`,
    logout: `import { define } from "../utils.ts";

export const handler = define.handlers({
  GET(ctx) {
    // Destroy session
    ctx.state.session = {}; 
    
    return new Response("", {
      status: 303,
      headers: { Location: "/" },
    });
  },
});
`,
  };

  // 1. Deno JSON Dependency Injection
  await updateDenoJson(options.yes);

  // 1.5. Check for 'unstable' 'kv' config if using KV store
  if (store === "kv") {
    await ensureUnstableKv(options.yes);
  }

  // 2. Config & Routes
  await writeFile("config/session.ts", templates.config, options.yes);
  await writeFile("routes/login.tsx", templates.login, options.yes);
  await writeFile("routes/logout.ts", templates.logout, options.yes);

  // 3. Patch Main
  await patchMainTs();

  console.log("\nSetup complete!");
}

async function ensureUnstableKv(yes?: boolean) {
  const denoJsonPath = join(CWD, "deno.json");
  try {
    const content = await Deno.readTextFile(denoJsonPath);
    let config: any;
    try {
      config = jsonc.parse(content);
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
    if (!await confirm("Deno KV requires 'kv' to be listed in the 'unstable' config in deno.json. Add it?", yes)) {
      console.log("Skipping 'unstable' config update. You may need to add it manually.");
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

async function updateDenoJson(yes?: boolean) {
  const denoJsonPath = join(CWD, "deno.json");
  try {
    const content = await Deno.readTextFile(denoJsonPath);
    // Use jsonc to parse to handle comments if present (though we might stripping them on write if we use JSON.stringify)
    // Ideally we simple check imports manually or use AST.
    // For simplicity, we'll try to parse, add, stringify.
    // Warning: This strips comments.
    // The user asked for it to be automated.

    let config: any;
    try {
      config = jsonc.parse(content);
    } catch (e) {
      console.warn("Could not parse deno.json. Skipping dependency injection.");
      return;
    }

    if (!config.imports) config.imports = {};

    if (!config.imports["@innovatedev-fresh/session"]) {
      console.log("Adding dependency to deno.json...");
      config.imports["@innovatedev-fresh/session"] =
        "jsr:@innovatedev-fresh/session";

      // Write back.
      await Deno.writeTextFile(denoJsonPath, JSON.stringify(config, null, 2));
      console.log("Updated deno.json imports.");
    } else {
      console.log("Dependency already exists in deno.json.");
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

    if (content.includes("sessionMiddleware")) {
      console.log(
        "main.ts seems to already contain sessionMiddleware. Skipping patch.",
      );
      return;
    }

    const importStmt =
      'import { sessionMiddleware } from "./config/session.ts";';
    const lastImportMatch = content.match(/import.*;\n(?!import)/);

    if (lastImportMatch) {
      const idx = lastImportMatch.index! + lastImportMatch[0].length;
      content = content.slice(0, idx) + importStmt + "\n" + content.slice(idx);
    } else {
      content = importStmt + "\n" + content;
    }

    const staticFilesUsage = "app.use(staticFiles());";
    const usageIndex = content.indexOf(staticFilesUsage);

    if (usageIndex !== -1) {
      const insertAt = usageIndex + staticFilesUsage.length;
      content = content.slice(0, insertAt) + "\n\napp.use(sessionMiddleware);" +
        content.slice(insertAt);
      await Deno.writeTextFile(mainTsPath, content);
      console.log("Patched main.ts");
    } else {
      console.warn(
        "Could not auto-patch main.ts (anchor 'app.use(staticFiles());' not found).",
      );
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

  let config: any;
  try {
    config = jsonc.parse(content);
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
