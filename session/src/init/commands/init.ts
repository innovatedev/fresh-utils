import { Confirm, Input, Select } from "../deps.ts";
import {
  checkFreshVersion,
  ensureUnstableKv,
  hasDaisyUI,
  sanitizeImports,
  updateDenoJson,
  writeFile,
} from "../helpers.ts";
import { patchAppTsx, patchMainTs, patchUtilsState } from "../patchers.ts";

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

  let shouldUpdateUtils = false;
  let authPrefix = "";

  if (!options.yes) {
    if (!preset) {
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
    }

    shouldUpdateUtils = await Confirm.prompt({
      message: "Update utils.ts State interface automatically?",
      default: true,
    });

    if (preset !== "none") {
      authPrefix = await Input.prompt({
        message: "Auth route prefix? (e.g. /auth, default: none)",
        default: "",
      });
    }
  } else {
    // Defaults for non-interactive
    if (!preset) {
      const store = options.store || "kvdex";
      if (store === "kvdex") preset = "kvdex-prod";
      else if (store === "kv") preset = "kv-prod";
      else preset = "basic";
      console.log(`Using default preset '${preset}' (store: ${store})`);
    }
    shouldUpdateUtils = true;
    authPrefix = "";
  }

  if (authPrefix && !authPrefix.startsWith("/")) {
    authPrefix = "/" + authPrefix;
  }
  if (authPrefix.endsWith("/")) {
    authPrefix = authPrefix.slice(0, -1);
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
    let logoutContent = sanitizeImports(await readTemplate("routes/logout.ts"));
    if (authPrefix) {
      logoutContent = logoutContent.replace(
        /"\/login"/g,
        `"${authPrefix}/login"`,
      );
    }
    await writeFile(
      `routes${authPrefix}/(auth)/logout.ts`,
      logoutContent,
      options.yes,
    );

    // Guest Middleware
    let guestMiddleware = sanitizeImports(
      await readTemplate("routes/_middleware_guest.ts"),
    );
    guestMiddleware = guestMiddleware.replace("{{REDIRECT}}", "/");
    await writeFile(
      `routes${authPrefix}/(guest)/_middleware.ts`,
      guestMiddleware,
      options.yes,
    );

    // Auth Middleware
    let authMiddleware = sanitizeImports(
      await readTemplate("routes/_middleware_auth.ts"),
    );
    authMiddleware = authMiddleware.replace(
      "{{REDIRECT}}",
      `${authPrefix || ""}/login`,
    );
    await writeFile(
      `routes${authPrefix}/(auth)/_middleware.ts`,
      authMiddleware,
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
      // Determine Auth Logic based on store
      let loginLogic = "";
      let registerLogic = "";

      if (isKvdex) {
        loginLogic = `
      const { db } = await import("../kv/db.ts");
      const userRes = await db.users.findByPrimaryIndex("username", username);
      const user = userRes?.value;

      if (!user) {
        ctx.state.flash("error", "Invalid username or password");
        return ctx.redirect("${authPrefix || ""}/login");
      }
${
          isProd
            ? `
      const isValid = await verify(user.passwordHash, password);
      if (!isValid) {
        ctx.state.flash("error", "Invalid username or password");
        return ctx.redirect("${authPrefix || ""}/login");
      }
`
            : ""
        }
        `.trim();

        loginLogic = loginLogic + `
      await ctx.state.login(userRes.id);`;

        registerLogic = `
    const { db } = await import("../kv/db.ts");
    const existing = await db.users.findByPrimaryIndex("username", username);
    if (existing) {
      ctx.state.flash("error", "User already exists");
      return ctx.redirect("${authPrefix || ""}/register");
    }

${
          isProd
            ? `
    const passwordHash = await hash(password);
    const result = await db.users.add({ username, passwordHash });
    if (!result.ok) {
      ctx.state.flash("error", "Failed to create user");
      return ctx.redirect("${authPrefix || ""}/register");
    }
    await ctx.state.login(result.id);
`
            : `
    const result = await db.users.add({ username });
    if (!result.ok) {
      ctx.state.flash("error", "Failed to create user");
      return ctx.redirect("${authPrefix || ""}/register");
    }
    await ctx.state.login(result.id);
`
        }
        `.trim();
      } else if (isKv) {
        loginLogic = `
      const kv = await Deno.openKv();
      const userRes = await kv.get(["users", username]);
      const user = userRes.value as { username: string${
          isProd ? "; passwordHash: string" : ""
        } } | null;

      if (!user) {
        ctx.state.flash("error", "Invalid username or password");
        return ctx.redirect("${authPrefix || ""}/login");
      }

${
          isProd
            ? `
      const isValid = await verify(user.passwordHash, password);
      if (!isValid) {
        ctx.state.flash("error", "Invalid username or password");
        return ctx.redirect("${authPrefix || ""}/login");
      }
`
            : ""
        }
        `.trim();

        registerLogic = `
    const kv = await Deno.openKv();
    const existing = await kv.get(["users", username]);
    if (existing.value) {
      ctx.state.flash("error", "User already exists");
      return ctx.redirect("${authPrefix || ""}/register");
    }

${
          isProd
            ? `
    const passwordHash = await hash(password);
    await kv.set(["users", username], { username, passwordHash });
`
            : '    await kv.set(["users", username], { username });'
        }
        `.trim();
      }

      loginContent = loginContent.replace("// {{AUTH_LOGIC}}", loginLogic);
      registerContent = registerContent.replace(
        "// {{AUTH_LOGIC}}",
        registerLogic,
      );

      if (isProd) {
        loginContent = loginContent.replace(/\/\*|\*\//g, "");
        registerContent = registerContent.replace(/\/\*|\*\//g, "");
      }
    }

    if (authPrefix) {
      loginContent = loginContent
        .replace(/"\/register"/g, `"${authPrefix}/register"`)
        .replace(/"\/login"/g, `"${authPrefix}/login"`);
      registerContent = registerContent
        .replace(/"\/register"/g, `"${authPrefix}/register"`)
        .replace(/"\/login"/g, `"${authPrefix}/login"`);
    }

    await writeFile(
      `routes${authPrefix}/(guest)/login.tsx`,
      loginContent,
      options.yes,
    );
    await writeFile(
      `routes${authPrefix}/(guest)/register.tsx`,
      registerContent,
      options.yes,
    );

    const useDaisy = await hasDaisyUI();
    const headerVariant = useDaisy ? "Header_daisyui.tsx" : "Header.tsx";

    let headerContent = sanitizeImports(
      await readTemplate(`islands/layout/${headerVariant}`),
    );
    if (authPrefix) {
      headerContent = headerContent
        .replace(/"\/login"/g, `"${authPrefix}/login"`)
        .replace(/"\/register"/g, `"${authPrefix}/register"`)
        .replace(/"\/logout"/g, `"${authPrefix}/logout"`);
    }

    await writeFile(`islands/layout/Header.tsx`, headerContent, options.yes);
  }

  // 3. Patch utils.ts State interface
  await patchUtilsState(shouldUpdateUtils, isKvdex);

  // 4. Patch Main
  await patchMainTs(isKv);

  // 5. Patch _app.tsx
  if (preset !== "none") {
    await patchAppTsx();
  }

  console.log("\nSetup complete!");
}
