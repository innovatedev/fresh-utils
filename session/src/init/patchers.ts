import { join } from "./deps.ts";
import { dedent, getCWD } from "./helpers.ts";

export function printStateExample(isKvdex = false) {
  const userImport = isKvdex
    ? '\n  import type { User } from "./kv/models.ts";'
    : "";
  const userDefinition = isKvdex
    ? ""
    : "\n  export interface User { id: string; username: string; email: string; }";
  const defineArgs = isKvdex ? "<User>" : "<User>";

  console.log(
    `\nPlease update your define object in utils.ts to use the session helper:\n\n  import { createDefineSession } from "@innovatedev/fresh-session/define";${userImport}\n${userDefinition}\n\n  export const define = createDefineSession${defineArgs}();\n`,
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

      const sessionImports = isKvdex
        ? 'import { createDefineSession, type Define } from "@innovatedev/fresh-session/define";\nimport type { State } from "@innovatedev/fresh-session";\nexport type { State };\nimport type { User } from "./kv/models.ts";'
        : 'import { createDefineSession, type Define } from "@innovatedev/fresh-session/define";\nimport type { State } from "@innovatedev/fresh-session";\nexport type { State };';

      // 1. Extract existing State properties
      const stateMatch = content.match(/export interface State \{([\s\S]*?)\}/);
      const extraStateBody = stateMatch ? stateMatch[1].trim() : "";

      const extraStateDefinition = extraStateBody
        ? `/** Existing state properties from your project */\nexport interface ExtraState {\n  ${extraStateBody}\n}`
        : "export interface ExtraState extends Record<string, unknown> {}";

      const defineDefinition = isKvdex
        ? dedent(`
          ${extraStateDefinition}

          /** Global application state */
          export type AppState = State<User, {}> & ExtraState;

          // Replace '{}' with your custom SessionData if needed
          export const define = createDefineSession<User, {}, ExtraState>();
          
          /** Strictly typed state for authenticated routes (guarantees user presence) */
          export type AuthState = AppState & { user: User; userId: string };
          /** Authenticated define helper */
          export const defineAuth = define as Define<AuthState>;`)
        : dedent(`
          ${extraStateDefinition}

          /** Global application state */
          export type AppState = State<unknown, {}> & ExtraState;

          // Replace 'unknown' and '{}' with your User and SessionData types
          export const define = createDefineSession<unknown, {}, ExtraState>();
          
          /** Strictly typed state for authenticated routes (guarantees user presence) */
          export type AuthState = AppState & { user: unknown; userId: string };
          /** Authenticated define helper */
          export const defineAuth = define as Define<AuthState>;`);

      const updated = content
        .replace(
          /import\s*\{\s*createDefine\s*\}\s*from\s*"fresh";/,
          sessionImports,
        )
        .replace(
          /export interface State \{[\s\S]*?\}/,
          "",
        )
        .replace(
          /export const define = createDefine<State>\(\);/,
          defineDefinition,
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
            return `export default define.page(function App(${paramStr})`;
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

    const importStmt = 'import { session } from "@/config/session.ts";';
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
