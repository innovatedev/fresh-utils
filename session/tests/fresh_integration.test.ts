import { expect } from "./deps.ts";
import { createSessionMiddleware } from "../src/mod.ts";
import { collection, kvdex } from "@olli/kvdex";
import { KvDexSessionStorage, sessionModel } from "../src/stores/kvdex.ts";
import { MemorySessionStorage } from "../src/stores/memory.ts";
import { DenoKvSessionStorage } from "../src/stores/kv.ts";
import { getSetCookies } from "@std/http/cookie";
import { type SessionStorage } from "../src/session.ts";

const kv = await Deno.openKv(":memory:");
const db = kvdex({
  kv,
  schema: {
    sessions: collection(sessionModel<any>()),
  },
});
const kvdexStore = new KvDexSessionStorage({ db, collection: db.sessions });
const memoryStore = new MemorySessionStorage();
const denoKvStore = new DenoKvSessionStorage(kv);

/**
 * Generic lifecycle test runner for any SessionStorage implementation.
 * Flow: Set -> Login -> Check -> Update -> Verify -> Logout -> Final
 */
async function runLifecycleTest(t: Deno.TestContext, store: SessionStorage) {
  // Provide a simple resolveUser to the middleware so it can hydrate the user object
  const middleware = createSessionMiddleware({
    store,
    resolveUser: (id) => id === "user-1" ? { name: "Alice" } : undefined,
  });

  let cookie: string | undefined;

  await t.step(
    "Flow: Set -> Login -> Check -> Update -> Verify -> Logout -> Final",
    async () => {
      // 1. SET: Set initial data
      const ctxSet: any = {
        req: new Request("http://localhost/set"),
        state: {},
        next: () => {
          ctxSet.state.session.val = 1;
          return Promise.resolve(new Response("Set"));
        },
      };
      const resSet = await middleware(ctxSet);
      cookie = getSetCookies(resSet.headers).find((c) => c.name === "sessionId")
        ?.value;
      expect(cookie).toBeDefined();

      // 2. LOGIN: Rotate and set user
      const ctxLogin: any = {
        req: new Request("http://localhost/login", {
          headers: { Cookie: `sessionId=${cookie}` },
        }),
        state: {},
        next: async () => {
          await ctxLogin.state.login("user-1", {
            ...ctxLogin.state.session,
            name: "Alice",
          });
          return new Response("Login");
        },
      };
      const resLogin = await middleware(ctxLogin);
      const newCookie = getSetCookies(resLogin.headers).find((c) =>
        c.name === "sessionId"
      )?.value;
      expect(newCookie).toBeDefined();
      expect(newCookie).not.toEqual(cookie);
      cookie = newCookie;

      // 3. CHECK: Verify persistence
      const ctxCheck: any = {
        req: new Request("http://localhost/check", {
          headers: { Cookie: `sessionId=${cookie}` },
        }),
        state: {},
        next: () => {
          expect(ctxCheck.state.user?.name).toEqual("Alice");
          expect(ctxCheck.state.session.val).toEqual(1);
          return Promise.resolve(new Response("Check"));
        },
      };
      await middleware(ctxCheck);

      // 4. UPDATE: Modify session var
      const ctxUpdate: any = {
        req: new Request("http://localhost/update", {
          headers: { Cookie: `sessionId=${cookie}` },
        }),
        state: {},
        next: () => {
          ctxUpdate.state.session.val = 2;
          return Promise.resolve(new Response("Update"));
        },
      };
      await middleware(ctxUpdate);

      // 5. VERIFY: Confirm update persisted
      const ctxVerify: any = {
        req: new Request("http://localhost/verify", {
          headers: { Cookie: `sessionId=${cookie}` },
        }),
        state: {},
        next: () => {
          expect(ctxVerify.state.session.val).toEqual(2);
          return Promise.resolve(new Response("Verify"));
        },
      };
      await middleware(ctxVerify);

      // 6. LOGOUT: Clear session
      const ctxLogout: any = {
        req: new Request("http://localhost/logout", {
          headers: { Cookie: `sessionId=${cookie}` },
        }),
        state: {},
        next: async () => {
          await ctxLogout.state.logout();
          return new Response("Logout");
        },
      };
      const resLogout = await middleware(ctxLogout);
      const finalCookie = getSetCookies(resLogout.headers).find((c) =>
        c.name === "sessionId"
      )?.value;
      expect(finalCookie).toBeDefined();
      expect(finalCookie).not.toEqual(cookie);
      cookie = finalCookie;

      // 7. FINAL: Verify empty state
      const ctxFinal: any = {
        req: new Request("http://localhost/final", {
          headers: { Cookie: `sessionId=${cookie}` },
        }),
        state: {},
        next: () => {
          expect(ctxFinal.state.user).toBeUndefined();
          expect(ctxFinal.state.session).toEqual({});
          return Promise.resolve(new Response("Final"));
        },
      };
      await middleware(ctxFinal);
    },
  );
}

Deno.test("Integration (Store): MemorySessionStorage Lifecycle", (t) =>
  runLifecycleTest(t, memoryStore));
Deno.test("Integration (Store): DenoKvSessionStorage Lifecycle", (t) =>
  runLifecycleTest(t, denoKvStore));
Deno.test("Integration (Store): KvDexSessionStorage Lifecycle", (t) =>
  runLifecycleTest(t, kvdexStore));

Deno.test("Integration: Session Rotation on Login (Optimistic Locking Regression)", async () => {
  const middleware = createSessionMiddleware({ store: kvdexStore });

  // 1. Create a session
  const ctx1: any = {
    req: new Request("http://localhost/"),
    state: {},
    next: () => {
      ctx1.state.session.foo = "bar";
      return Promise.resolve(new Response("Created"));
    },
  };
  const res1 = await middleware(ctx1);
  const cookies1 = getSetCookies(res1.headers);
  const sessionCookie1 = cookies1.find((c) => c.name === "sessionId");
  expect(sessionCookie1).toBeDefined();

  // 2. Perform a login to trigger rotation
  const ctx2: any = {
    req: new Request("http://localhost/login", {
      method: "POST",
      headers: { Cookie: `sessionId=${sessionCookie1!.value}` },
    }),
    state: {},
    next: async () => {
      await ctx2.state.login("user-123", { name: "Alice" });
      return new Response("Logged in");
    },
  };

  const res2 = await middleware(ctx2);
  const cookies2 = getSetCookies(res2.headers);
  const sessionCookie2 = cookies2.find((c) => c.name === "sessionId");
  expect(sessionCookie2).toBeDefined();
  expect(sessionCookie2!.value).not.toEqual(sessionCookie1!.value);

  // Verify the new session actually contains the logged in data
  const finalState = await kvdexStore.get(sessionCookie2!.value);
  expect(finalState).toBeDefined();
  expect((finalState?.data as any).name).toEqual("Alice");
});

Deno.test("Integration: Concurrent Updates (Atomic Retry Loop)", async () => {
  const middleware = createSessionMiddleware({ store: kvdexStore });

  // 1. Create a session
  const ctx1: any = {
    req: new Request("http://localhost/"),
    state: {},
    next: () => {
      ctx1.state.session.counter = 0;
      return Promise.resolve(new Response("Created"));
    },
  };
  const res1 = await middleware(ctx1);
  const cookies1 = getSetCookies(res1.headers);
  const sessionId = cookies1.find((c) => c.name === "sessionId")!.value;

  // 2. Perform 5 concurrent increments
  const requests = Array.from({ length: 5 }).map(async () => {
    const ctx: any = {
      req: new Request("http://localhost/increment", {
        method: "POST",
        headers: { Cookie: `sessionId=${sessionId}` },
      }),
      state: {},
      next: async () => {
        const result = await ctx.state.session.update((data: any) => {
          return { ...data, counter: (data.counter || 0) + 1 };
        });
        if (result.ok) {
          return new Response(`Counter is ${result.data.counter}`);
        }
        return new Response("Conflict", { status: 409 });
      },
    };
    return middleware(ctx);
  });

  const responses = await Promise.all(requests);

  for (const res of responses) {
    expect(res.status).toEqual(200);
  }

  // 3. Verify final value is 5
  const finalState = await kvdexStore.get(sessionId);
  expect((finalState?.data as any).counter).toEqual(5);
});
