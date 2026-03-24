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

  if (!options.yes) {
    const useDefaults = await Confirm.prompt({
      message: "Run with defaults? (Kvdex Production, Argon2, Prefix: none)",
      default: true,
    });

    if (useDefaults) {
      preset = "kvdex-prod";
      shouldUpdateUtils = true;
      authPrefix = "";
      shouldResetLock = true;
      shouldAddUnstableKv = true;
      enableUsername = true;
      enableEmail = true;
      loginField = "email";
    } else {
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
          message:
            "Add 'kv' to 'unstable' in deno.json? (Required for Deno KV)",
          default: true,
        });
      }
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
    shouldResetLock = true;
    shouldAddUnstableKv = true;
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

  // Prepare dynamic field data
  const userFields = [
    enableUsername ? "  username: string;" : "",
    enableEmail ? "  email: string;" : "",
    isProd ? "  passwordHash: string;" : "",
  ].filter(Boolean).join("\n");

  const registerFields = [
    enableUsername
      ? (useDaisy
        ? `        <div class="form-control w-full">
          <label class="label">
            <span class="label-text font-semibold">Username</span>
          </label>
          <input type="text" name="username" placeholder="Username" class="input input-bordered w-full focus:input-primary transition-all" required />
        </div>`
        : `        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">Username</label>
          <input type="text" name="username" placeholder="Username" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" required />
        </div>`)
      : "",
    enableEmail
      ? (useDaisy
        ? `        <div class="form-control w-full">
          <label class="label">
            <span class="label-text font-semibold">Email</span>
          </label>
          <input type="email" name="email" placeholder="email@example.com" class="input input-bordered w-full focus:input-primary transition-all" required />
        </div>`
        : `        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">Email</label>
          <input type="email" name="email" placeholder="email@example.com" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" required />
        </div>`)
      : "",
  ].filter(Boolean).join("\n");

  const loginLabel = loginField === "username" ? "Username" : "Email";
  const loginPlaceholder = loginField === "username"
    ? "Username"
    : "email@example.com";
  const loginType = loginField === "username" ? "text" : "email";

  const loginFields = useDaisy
    ? `        <div class="form-control w-full">
          <label class="label">
            <span class="label-text font-semibold">${loginLabel}</span>
          </label>
          <input type="${loginType}" name="login" placeholder="${loginPlaceholder}" class="input input-bordered w-full focus:input-primary transition-all" required />
        </div>`
    : `        <div class="space-y-1">
          <label class="block text-sm font-medium text-gray-700">${loginLabel}</label>
          <input type="${loginType}" name="login" placeholder="${loginPlaceholder}" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" required />
        </div>`;

  const registerExtraction = [
    enableUsername
      ? '    const username = form.get("username")?.toString();'
      : "",
    enableEmail ? '    const email = form.get("email")?.toString();' : "",
  ].filter(Boolean).join("\n");

  const registerValidation = [
    enableUsername ? "username" : "",
    enableEmail ? "email" : "",
  ].filter(Boolean).join(" && ");

  // Define templates based on store
  let configTemplate = "config/memory.ts";
  if (isKvdex) configTemplate = "config/kvdex.ts";
  else if (isKv) configTemplate = "config/kv.ts";

  const configContent = sanitizeImports(await readTemplate(configTemplate));

  // 1. Deno JSON Dependency Injection
  await updateDenoJson(options.yes, isProd, isKvdex);
  if (isKv) {
    await ensureUnstableKv(options.yes, shouldAddUnstableKv);
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
      sanitizeImports(
        (await readTemplate("kv/models.ts"))
          .replace("{{USER_FIELDS}}", userFields),
      ),
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

    // Determine Auth Logic and Imports based on store
    let loginLogic = "";
    let registerLogic = "";
    let authImports = "";

    if (isKvdex) {
      authImports = `import { db } from "../kv/db.ts";`;
      if (isProd) {
        authImports += `\nimport { verify, hash } from "@felix/argon2";`;
      }
      loginLogic = `
      const userRes = await db.users.findByPrimaryIndex("${loginField}", login);
      const user = userRes?.value;

      if (!user) {
        ctx.state.flash("error", "Invalid ${loginLabel} or password");
        return ctx.redirect("${authPrefix || ""}/login");
      }
${
        isProd
          ? `
      const isValid = await verify(user.passwordHash, password);
      if (!isValid) {
        ctx.state.flash("error", "Invalid ${loginLabel} or password");
        return ctx.redirect("${authPrefix || ""}/login");
      }
`
          : ""
      }
      await ctx.state.login(userRes.id);
        `.trim();

      registerLogic = `
    const existing = await db.users.findByPrimaryIndex("${loginField}", ${loginField});
    if (existing) {
      ctx.state.flash("error", "User already exists");
      return ctx.redirect("${authPrefix || ""}/register");
    }

${
        isProd
          ? `
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
`
          : `
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
`
      }
        `.trim();
    } else if (isKv) {
      if (isProd) {
        authImports = `import { verify, hash } from "@felix/argon2";`;
      }
      loginLogic = `
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
          ? `
      const isValid = await verify(user.passwordHash, password);
      if (!isValid) {
        ctx.state.flash("error", "Invalid ${loginLabel} or password");
        return ctx.redirect("${authPrefix || ""}/login");
      }
`
          : ""
      }
      await ctx.state.login(login);
        `.trim();

      registerLogic = `
    const kv = await Deno.openKv();
    const existing = await kv.get(["users", ${loginField}]);
    if (existing.value) {
      ctx.state.flash("error", "User already exists");
      return ctx.redirect("${authPrefix || ""}/register");
    }

${
        isProd
          ? `
    const passwordHash = await hash(password);
    await kv.set(["users", ${loginField}], { ${
            [
              enableUsername ? "username" : "",
              enableEmail ? "email" : "",
              "passwordHash",
            ].filter(Boolean).join(", ")
          } });
`
          : `    await kv.set(["users", ${loginField}], { ${
            [
              enableUsername ? "username" : "",
              enableEmail ? "email" : "",
            ].filter(Boolean).join(", ")
          } });`
      }
    await ctx.state.login(${loginField});
        `.trim();
    } else {
      // basic memory login
      loginLogic = `await ctx.state.login(login);`;
      registerLogic = `await ctx.state.login(${loginField});`;
    }

    loginContent = sanitizeImports(
      loginContent
        .replace("// {{AUTH_IMPORTS}}", authImports)
        .replace("// {{AUTH_LOGIC}}", loginLogic)
        .replace("{{LOGIN_LABEL}}", loginLabel)
        .replace("{{LOGIN_FIELD}}", loginField)
        .replace("{{LOGIN_FIELDS}}", loginFields),
    );
    registerContent = sanitizeImports(
      registerContent
        .replace("// {{AUTH_IMPORTS}}", authImports)
        .replace("// {{AUTH_LOGIC}}", registerLogic)
        .replace("{{REGISTER_FIELDS}}", registerFields)
        .replace("{{REGISTER_EXTRACTION}}", registerExtraction)
        .replace("{{REGISTER_VALIDATION}}", registerValidation),
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
  await patchMainTs(isKv);

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
