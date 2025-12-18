import { expect } from "./deps.ts";
import { getSetCookies } from "@std/http/cookie";
import { createSessionMiddleware, type SessionData } from "../src/mod.ts";
import { MemorySessionStorage } from "../src/stores/memory.ts";

const sessionStore = new MemorySessionStorage();

// Define a test state to avoid 'any'
interface TestState {
  session: SessionData;
  sessionId: string;
  user?: { id: string; name?: string };
  flash: (key: string, val?: unknown) => unknown;
  hasFlash: (key: string) => boolean;
  login: (uid: string) => Promise<void>;
  logout: () => Promise<void>;
}

const options = {
  store: sessionStore,
  verifyToken: (token: string) => {
    if (token === "valid-secret-token") {
      return { id: "api-user-1", name: "API User" };
    }
    return undefined;
  },
};
const sessionMiddleware = createSessionMiddleware<TestState>(options);

const customOptions = {
  store: sessionStore,
  verifyToken: (
    token: string,
  ) => (token === "mybox" ? { id: "box" } : undefined),
  tokenPrefix: "Box ", // Custom prefix
};
const customMiddleware = createSessionMiddleware<TestState>(customOptions);

const noPrefixOptions = {
  store: sessionStore,
  verifyToken: (
    token: string,
  ) => (token === "key123" ? { id: "key" } : undefined),
  tokenPrefix: null, // No prefix
};
const noPrefixMiddleware = createSessionMiddleware<TestState>(noPrefixOptions);

Deno.test("Integration: Stateless API Token", async (t) => {
  await t.step("Step 1: Valid Token Login (Default Bearer)", async () => {
    const ctx: any = {
      req: new Request("http://localhost/api/protected", {
        headers: {
          "Authorization": "Bearer valid-secret-token",
        },
      }),
      state: {},
      next: () => Promise.resolve(new Response(`User: ${ctx.state.user.name}`)),
    };

    const res = await sessionMiddleware(ctx);
    const text = await res.text();
    expect(text).toEqual("User: API User");
    expect(ctx.state.session).toEqual({});
  });

  await t.step("Step 2: Custom Prefix", async () => {
    const ctx: any = {
      req: new Request("http://localhost/api/box", {
        headers: {
          "Authorization": "Box mybox",
        },
      }),
      state: {},
      next: () => Promise.resolve(new Response(`ID: ${ctx.state.user.id}`)),
    };

    const res = await customMiddleware(ctx);
    expect(await res.text()).toEqual("ID: box");
  });

  await t.step("Step 3: No Prefix", async () => {
    const ctx: any = {
      req: new Request("http://localhost/api/key", {
        headers: {
          "Authorization": "key123",
        },
      }),
      state: {},
      next: () => Promise.resolve(new Response(`ID: ${ctx.state.user.id}`)),
    };

    const res = await noPrefixMiddleware(ctx);
    expect(await res.text()).toEqual("ID: key");
  });
});
