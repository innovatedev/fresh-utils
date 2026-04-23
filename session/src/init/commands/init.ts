import { Confirm, Input, Select } from "../deps.ts";
import {
  checkFreshVersion,
  dedent,
  ensureUnstableKv,
  hasDaisyUI,
  replaceWithIndent,
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
  const useDaisy = await hasDaisyUI();

  let preset = options.preset as
    | "none"
    | "basic"
    | "kv-basic"
    | "kv-prod"
    | "kvdex-basic"
    | "kvdex-prod"
    | undefined;

  let shouldUpdateUtils = true;
  let authPrefix = "";
  let shouldResetLock = false;
  let shouldAddUnstableKv = false;
  let enableUsername = true;
  let enableEmail = true;
  let loginField: "username" | "email" = "email";

  // 1. Handle defaults and flags
  const hasFlags = !!(options.store || options.preset);

  if (!options.yes && !hasFlags) {
    const useDefaults = await Confirm.prompt({
      message: "Run with defaults? (Kvdex Production, Argon2, Prefix: none)",
      default: true,
    });

    if (useDefaults) {
      preset = "kvdex-prod";
      shouldResetLock = true;
      shouldAddUnstableKv = true;
    } else {
      // Manual configuration continues below
    }
  }

  // Set default preset if not defined by flag or "defaults" prompt
  if (!preset && (options.yes || hasFlags)) {
    const store = options.store || "kvdex";
    if (store === "kvdex") preset = "kvdex-prod";
    else if (store === "kv") preset = "kv-prod";
    else preset = "basic";

    console.log(`Using preset '${preset}' (store: ${store})`);
  }

  // Non-interactive or auto-defaults also set these
  if (options.yes || (preset && !options.yes)) {
    if (options.yes || !hasFlags) { // If it's pure --yes or they hit ENTER on defaults
      shouldUpdateUtils = true;
      authPrefix = "";
      shouldResetLock = true;
      shouldAddUnstableKv = true;
      enableUsername = true;
      enableEmail = true;
      loginField = "email";
    }
  }

  // 2. Interactive Manual Configuration (only if flags are NOT present and not --yes and not using defaults)
  if (
    !options.yes && !hasFlags && preset !== "kvdex-prod" &&
    preset !== "kv-prod" && preset !== "basic"
  ) {
    // If we're here, it means they said NO to defaults and we need to prompt for everything
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
        default: "kvdex-prod",
      });
      preset = selectedPreset as
        | "none"
        | "basic"
        | "kv-basic"
        | "kv-prod"
        | "kvdex-basic"
        | "kvdex-prod";
    }

    enableUsername = await Confirm.prompt({
      message: "Enable username field?",
      default: true,
    });

    enableEmail = await Confirm.prompt({
      message: "Enable email field?",
      default: true,
    });

    if (!enableUsername && !enableEmail) {
      console.error(
        "Error: You must enable at least one of username or email.",
      );
      Deno.exit(1);
    }

    if (enableUsername && enableEmail) {
      loginField = await Select.prompt({
        message: "Primary login field?",
        options: [
          { name: "Email", value: "email" },
          { name: "Username", value: "username" },
        ],
        default: "email",
      }) as "username" | "email";
    } else {
      loginField = enableEmail ? "email" : "username";
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

    shouldResetLock = await Confirm.prompt({
      message: "Reset lock file? (Resolves Preact dependency issues)",
      default: true,
    });

    if (preset!.startsWith("kv") || preset!.startsWith("kvdex")) {
      shouldAddUnstableKv = await Confirm.prompt({
        message: "Add 'kv' to 'unstable' in deno.json? (Required for Deno KV)",
        default: true,
      });
    }
  }

  if (authPrefix && !authPrefix.startsWith("/")) {
    authPrefix = "/" + authPrefix;
  }
  if (authPrefix.endsWith("/")) {
    authPrefix = authPrefix.slice(0, -1);
  }

  // Determine store type based on preset
  const needsKv = preset!.startsWith("kv") || preset!.startsWith("kvdex");
  const isKvdex = preset!.startsWith("kvdex");
  const isProd = preset!.endsWith("prod");

  // Prepare dynamic field data
  const userFields = [
    enableUsername ? "  username: string;" : "",
    enableEmail ? "  email: string;" : "",
    isProd ? "  passwordHash: string;" : "",
  ].filter(Boolean).join("\n");

  const registerFields = [
    enableUsername
      ? (useDaisy
        ? dedent(`
            <label class="form-control w-full">
              <div class="label">
                <span class="label-text font-semibold">Username</span>
              </div>
              <input type="text" name="username" placeholder="Username" class="input input-bordered w-full focus:input-primary transition-all" required />
            </label>`)
        : dedent(`
            <label class="block space-y-1">
              <span class="block text-sm font-semibold text-gray-700">Username</span>
              <input type="text" name="username" placeholder="Username" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all" required />
            </label>`))
      : "",
    enableEmail
      ? (useDaisy
        ? dedent(`
            <label class="form-control w-full">
              <div class="label">
                <span class="label-text font-semibold">Email</span>
              </div>
              <input type="email" name="email" placeholder="email@example.com" class="input input-bordered w-full focus:input-primary transition-all" required />
            </label>`)
        : dedent(`
            <label class="block space-y-1">
              <span class="block text-sm font-semibold text-gray-700">Email</span>
              <input type="email" name="email" placeholder="email@example.com" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all" required />
            </label>`))
      : "",
  ].filter(Boolean).join("\n");

  const loginLabel = loginField === "username" ? "Username" : "Email";
  const loginPlaceholder = loginField === "username"
    ? "Username"
    : "email@example.com";
  const loginType = loginField === "username" ? "text" : "email";

  const loginFields = useDaisy
    ? dedent(`
        <label class="form-control w-full">
          <div class="label">
            <span class="label-text font-semibold">${loginLabel}</span>
          </div>
          <input type="${loginType}" name="login" placeholder="${loginPlaceholder}" class="input input-bordered w-full focus:input-primary transition-all" required />
        </label>`)
    : dedent(`
        <label class="block space-y-1">
          <span class="block text-sm font-semibold text-gray-700">${loginLabel}</span>
          <input type="${loginType}" name="login" placeholder="${loginPlaceholder}" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all" required />
        </label>`);

  const registerExtraction = [
    enableUsername ? 'const username = form.get("username")?.toString();' : "",
    enableEmail ? 'const email = form.get("email")?.toString();' : "",
  ].filter(Boolean).join("\n");

  const registerValidation = [
    enableUsername ? "username" : "",
    enableEmail ? "email" : "",
  ].filter(Boolean).join(" && ");

  // Define templates based on store
  let configTemplate = "config/memory.ts";
  if (isKvdex) configTemplate = "config/kvdex.ts";
  else if (needsKv) configTemplate = "config/kv.ts";

  const configContent = sanitizeImports(await readTemplate(configTemplate));

  // 1. Deno JSON Dependency Injection
  await updateDenoJson(options.yes, isProd, isKvdex);
  if (needsKv) {
    await ensureUnstableKv(options.yes, shouldAddUnstableKv);
  }

  // 2. Config & Routes
  await writeFile("config/session.ts", configContent, options.yes);

  // 2.5. Write kv/ files for kvdex presets
  if (isKvdex) {
    const userIndices = [
      enableUsername ? '        username: "primary",' : "",
      enableEmail ? '        email: "primary",' : "",
    ].filter(Boolean).join("\n");

    let dbContent = await readTemplate("kv/db.ts");
    dbContent = replaceWithIndent(
      dbContent,
      "// {{USER_INDICES}}",
      userIndices,
    );

    await writeFile(
      "kv/db.ts",
      sanitizeImports(dbContent),
      options.yes,
    );
    await writeFile(
      "kv/models.ts",
      sanitizeImports(
        replaceWithIndent(
          await readTemplate("kv/models.ts"),
          "// {{USER_FIELDS}}",
          userFields,
        ),
      ),
      options.yes,
    );
  }

  if (preset !== "none") {
    const suffix = isProd ? "_prod" : "_basic";

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
    const templateSuffix = `${suffix}${useDaisy ? "_daisyui" : ""}`;
    let loginContent = sanitizeImports(
      await readTemplate(`routes/login${templateSuffix}.tsx`),
    );
    let registerContent = sanitizeImports(
      await readTemplate(`routes/register${templateSuffix}.tsx`),
    );

    // Determine Auth Logic and Imports based on store
    let loginLogic = "";
    let registerLogic = "";
    let authImports = "";

    if (isKvdex) {
      authImports = `import { db } from "../kv/db.ts";`;
    }

    let loginImports = authImports;
    let registerImports = authImports;

    if (isProd) {
      loginImports += `\nimport { verify } from "@felix/argon2";`;
      registerImports += `\nimport { hash } from "@felix/argon2";`;
    }

    if (isKvdex) {
      loginLogic = dedent(`
        const userRes = await db.users.findByPrimaryIndex("${loginField}", login);
        const user = userRes?.value;

        if (!user) {
          ctx.state.flash("error", "Invalid ${loginLabel} or password");
          return ctx.redirect("${authPrefix || ""}/login");
        }
        ${
        isProd
          ? dedent(`
          const isValid = await verify(user.passwordHash, password);
          if (!isValid) {
            ctx.state.flash("error", "Invalid ${loginLabel} or password");
            return ctx.redirect("${authPrefix || ""}/login");
          }
        `)
          : ""
      }
        await ctx.state.login(userRes.id);
      `);

      registerLogic = dedent(`
        const existing = await db.users.findByPrimaryIndex("${loginField}", ${loginField});
        if (existing) {
          ctx.state.flash("error", "User already exists");
          return ctx.redirect("${authPrefix || ""}/register");
        }

        ${
        isProd
          ? dedent(`
          const passwordHash = await hash(password);
          const result = await db.users.add({ ${
            [
              enableUsername ? "username" : "",
              enableEmail ? "email" : "",
              "passwordHash",
            ].filter(Boolean).join(", ")
          } });
          if (!result.ok) {
            ctx.state.flash("error", "Failed to create user");
            return ctx.redirect("${authPrefix || ""}/register");
          }
          await ctx.state.login(result.id);
        `)
          : dedent(`
          const result = await db.users.add({ ${
            [
              enableUsername ? "username" : "",
              enableEmail ? "email" : "",
            ].filter(Boolean).join(", ")
          } });
          if (!result.ok) {
            ctx.state.flash("error", "Failed to create user");
            return ctx.redirect("${authPrefix || ""}/register");
          }
          await ctx.state.login(result.id);
        `)
      }
      `);
    } else if (needsKv) {
      loginLogic = dedent(`
        const kv = await Deno.openKv();
        const userRes = await kv.get(["users", login]);
        const user = userRes.value as { ${
        [
          enableUsername ? "username: string" : "",
          enableEmail ? "email: string" : "",
          isProd ? "passwordHash: string" : "",
        ].filter(Boolean).join("; ")
      } } | null;

        if (!user) {
          ctx.state.flash("error", "Invalid ${loginLabel} or password");
          return ctx.redirect("${authPrefix || ""}/login");
        }

        ${
        isProd
          ? dedent(`
          const isValid = await verify(user.passwordHash, password);
          if (!isValid) {
            ctx.state.flash("error", "Invalid ${loginLabel} or password");
            return ctx.redirect("${authPrefix || ""}/login");
          }
        `)
          : ""
      }
        await ctx.state.login(login);
      `);

      registerLogic = dedent(`
        const kv = await Deno.openKv();
        const existing = await kv.get(["users", ${loginField}]);
        if (existing.value) {
          ctx.state.flash("error", "User already exists");
          return ctx.redirect("${authPrefix || ""}/register");
        }

        ${
        isProd
          ? dedent(`
          const passwordHash = await hash(password);
          await kv.set(["users", ${loginField}], { ${
            [
              enableUsername ? "username" : "",
              enableEmail ? "email" : "",
              "passwordHash",
            ].filter(Boolean).join(", ")
          } });
        `)
          : dedent(`
          await kv.set(["users", ${loginField}], { ${
            [
              enableUsername ? "username" : "",
              enableEmail ? "email" : "",
            ].filter(Boolean).join(", ")
          } });
        `)
      }
        await ctx.state.login(${loginField});
      `);
    } else {
      // basic memory login
      loginLogic = `await ctx.state.login(login);`;
      registerLogic = `await ctx.state.login(${loginField});`;
    }

    loginContent = replaceWithIndent(
      loginContent,
      "// {{AUTH_IMPORTS}}",
      loginImports,
    );
    loginContent = replaceWithIndent(
      loginContent,
      "// {{AUTH_LOGIC}}",
      loginLogic,
    );
    loginContent = loginContent
      .replace("{{LOGIN_LABEL}}", loginLabel)
      .replace("{{LOGIN_FIELD}}", loginField);
    loginContent = replaceWithIndent(
      loginContent,
      "{/* {{LOGIN_FIELDS}} */}",
      loginFields,
    );
    loginContent = sanitizeImports(loginContent);

    registerContent = replaceWithIndent(
      registerContent,
      "// {{AUTH_IMPORTS}}",
      registerImports,
    );
    registerContent = replaceWithIndent(
      registerContent,
      "// {{AUTH_LOGIC}}",
      registerLogic,
    );
    registerContent = replaceWithIndent(
      registerContent,
      "{/* {{REGISTER_FIELDS}} */}",
      registerFields,
    );
    registerContent = replaceWithIndent(
      registerContent,
      "// {{REGISTER_EXTRACTION}}",
      registerExtraction,
    );
    registerContent = registerContent.replace(
      /\/\* {{REGISTER_VALIDATION}} \*\/ true/m,
      registerValidation,
    );
    registerContent = sanitizeImports(registerContent);

    // Shared logout
    let logoutContent = await readTemplate("routes/logout.ts");
    logoutContent = sanitizeImports(logoutContent);
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
  await patchMainTs(needsKv);

  // 5. Patch _app.tsx
  if (preset !== "none") {
    await patchAppTsx();
  }

  if (shouldResetLock) {
    console.log("Resetting lock file...");
    try {
      await Deno.remove("deno.lock");
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
    const command = new Deno.Command("deno", { args: ["install"] });
    await command.output();
  }

  console.log("\nSetup complete!");
}
