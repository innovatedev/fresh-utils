import { join } from "./deps.ts";
import { getCWD } from "./helpers.ts";

export function printStateExample(isKvdex = false) {
  const userImport = isKvdex
    ? '\n  import type { User } from "./kv/models.ts";'
    : "";
  const stateExtends = isKvdex ? "SessionState<User>" : "SessionState";
  console.log(
    `\nPlease update your State interface in utils.ts to extend the session State:\n\n  import type { State as SessionState } from "@innovatedev/fresh-session";${userImport}\n\n  export interface State extends ${stateExtends} {\n    // your existing properties...\n  }\n`,
  );
}

const DEFAULT_STATE_MARKER = "shared: string";

export async function patchUtilsState(
  shouldUpdateUtils: boolean,
  isKvdex = false,
) {
  const utilsPath = join(getCWD(), "utils.ts");
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
      if (!shouldUpdateUtils) {
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
      console.log("Updated utils.ts with session State properties.");
    } else {
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

export async function patchAppTsx() {
  const appPath = join(getCWD(), "routes/_app.tsx");
  try {
    let content = await Deno.readTextFile(appPath);
    if (
      content.includes("<body>\n        <Component />\n      </body>")
    ) {
      if (!content.includes("import Header")) {
        content = content.replace(
          /^(import .*?;)/m,
          `$1\nimport Header from "../islands/layout/Header.tsx";`,
        );
      }

      content = content.replace(
        /export default (?:define\.page\()?(?:function(?:\s+App)?\s*)\(\{\s*([\w\s,]+?)\s*\}\s*(?::\s*PageProps\s*)?\)\s*(?::\s*PageProps\s*)?/,
        (match, inner) => {
          const params = inner.split(",").map((s: string) => s.trim()).filter(
            Boolean,
          );
          if (!params.includes("Component")) params.push("Component");
          if (!params.includes("state")) params.push("state");
          if (!params.includes("url")) params.push("url");

          const paramStr = `{ ${params.join(", ")} }`;
          if (match.includes("define.page(")) {
            return `export default define.page(function App(${paramStr}: PageProps)`;
          }
          return `export default function App(${paramStr}: PageProps)`;
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

export async function patchMainTs(isKv = false) {
  const mainTsPath = join(getCWD(), "main.ts");
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
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) {
      console.error("Error patching main.ts:", e);
    }
  }
}
