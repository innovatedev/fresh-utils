import { Confirm, join, jsonc } from "./deps.ts";
import denoConfig from "../../deno.json" with { type: "json" };

export function getCWD() {
  return Deno.cwd();
}

export async function checkFreshVersion() {
  const djPath = join(getCWD(), "deno.json");
  let isFreshProject = false;
  try {
    const dj = JSON.parse(await Deno.readTextFile(djPath));
    if (dj.imports?.["fresh"] || dj.imports?.["$fresh/"]) {
      isFreshProject = true;
    }
  } catch {
    // Check deno.jsonc
    try {
      const djc = await Deno.readTextFile(join(getCWD(), "deno.jsonc"));
      if (djc.includes('"fresh"') || djc.includes('"$fresh/"')) {
        isFreshProject = true;
      }
    } catch {
      // ignore
    }
  }

  if (!isFreshProject) {
    console.error("This does not appear to be a Fresh project.");
    console.error("Please run this command from the root of a Fresh project.");
    Deno.exit(1);
  }
}

export function sanitizeImports(content: string): string {
  return content
    .replace(/\/\*\* @jsx.*?\*\//g, "")
    // Handle JSR-rewritten relative path imports
    .replace(
      /from "(\.\.\/)+mod\.ts"/g,
      'from "@innovatedev/fresh-session"',
    )
    .replace(
      /from "(\.\.\/)+stores\/kv\.ts"/g,
      'from "@innovatedev/fresh-session/kv-store"',
    )
    .replace(
      /from "(\.\.\/)+stores\/memory\.ts"/g,
      'from "@innovatedev/fresh-session/memory-store"',
    )
    .replace(
      /from "(\.\.\/)+stores\/kvdex\.ts"/g,
      'from "@innovatedev/fresh-session/kvdex-store"',
    )
    // Handle JSR-rewritten versioned specifiers
    .replace(
      /from "jsr:@innovatedev\/fresh-session@[^"\/]+(?:\/([^"]+))?"/g,
      (_, subpath) =>
        subpath
          ? `from "@innovatedev/fresh-session/${subpath}"`
          : `from "@innovatedev/fresh-session"`,
    )
    // Handle JSR-rewritten dependency specifiers
    .replace(
      /from "(jsr|npm):(@?[^@\/"]+(?:\/[^@\/"]+)?)@[^"]+"/g,
      'from "$2"',
    )
    .replace(
      /from "(\.\.\/)+utils\.ts"/g,
      'from "@/utils.ts"',
    )
    .replace(
      /from "(\.\.\/)+components\/Button\.tsx"/g,
      'from "@/components/Button.tsx"',
    )
    .replace(
      /from "(\.\.\/)+kv\/([^"]+)"/g,
      'from "@/kv/$2"',
    )
    .replace(
      /import\("(\.\.\/)+kv\/([^"]+)"\)/g,
      'import("@/kv/$2")',
    )
    .trimStart();
}

export function getFreshSessionVersion(): string {
  const match = import.meta.url.match(/@innovatedev\/fresh-session\/([^/]+)\//);
  if (match) {
    return `^${match[1]}`;
  }
  return `^${denoConfig.version}`;
}

export function getDependencyVersion(pkg: string, fallback: string): string {
  const imp = denoConfig.imports?.[pkg as keyof typeof denoConfig.imports];
  if (imp && imp.startsWith("jsr:")) {
    const lastAt = imp.lastIndexOf("@");
    if (lastAt > 4) {
      return imp.substring(lastAt + 1) || fallback;
    }
  }
  return fallback;
}

export async function confirm(msg: string, yes?: boolean): Promise<boolean> {
  if (yes) return true;
  return await Confirm.prompt(msg);
}

export async function writeFile(path: string, content: string, yes?: boolean) {
  const fullPath = join(getCWD(), path);
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

export async function hasDaisyUI(
  options: { cwd?: string; readFile?: (path: string) => Promise<string> } = {},
): Promise<boolean> {
  const { cwd = getCWD(), readFile = Deno.readTextFile } = options;
  const checkFile = async (filename: string) => {
    try {
      const content = await readFile(join(cwd, filename));
      return content.toLowerCase().includes("daisyui");
    } catch {
      return false;
    }
  };

  return (await checkFile("deno.json")) || (await checkFile("deno.jsonc"));
}

type DenoJsonConfig = {
  unstable?: string[];
  imports?: Record<string, string>;
};

export async function ensureUnstableKv(yes?: boolean, force = false) {
  const denoJsonPath = join(getCWD(), "deno.json");
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
    if (!Array.isArray(unstable)) {
      // modern deno uses array for features
    } else if (unstable.includes("kv")) {
      return; // Already has kv
    }

    if (
      !force &&
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

export async function updateDenoJson(
  _yes?: boolean,
  includeArgon2 = false,
  includeKvdex = false,
) {
  const denoJsonPath = join(getCWD(), "deno.json");
  try {
    const content = await Deno.readTextFile(denoJsonPath);
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
