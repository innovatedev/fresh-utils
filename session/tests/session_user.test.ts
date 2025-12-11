import { expect } from "./deps.ts";
import { createSessionMiddleware, State } from "../src/mod.ts";
import { MemorySessionStorage } from "../src/stores/memory.ts";

Deno.test("Integration: Session User Resolution", async (t) => {
  type User = { id: string; name: string; role: "admin" | "user" };

  // A mock "database"
  const users: Record<string, User> = {
    "u1": { id: "u1", name: "Alice", role: "admin" },
    "u2": { id: "u2", name: "Bob", role: "user" },
  };

  const sessionStore = new MemorySessionStorage();

  const middleware = createSessionMiddleware<State<User>, User>({
    store: sessionStore,
    resolveUser: (userId) => {
      // Logic: if session has userId (system field), look it up
      if (userId && typeof userId === "string") {
        return users[userId];
      }
      return undefined;
    },
  });

  await t.step("Resolves user from session data", async () => {
    // 1. Manually seed a session with a userId (using internal structure)
    const sessionId = "session-123";
    await sessionStore.set(sessionId, {
      data: {},
      flash: {},
      userId: "u1",
      lastSeenAt: Date.now(),
    });

    // 2. Make a request with that session ID
    const ctx: any = {
      req: new Request("http://localhost/", {
        headers: { Cookie: `sessionId=${sessionId}` },
      }),
      state: {},
      next: () => Promise.resolve(new Response("OK")),
    };

    await middleware(ctx);

    // 3. Verify ctx.state.user is populated
    expect(ctx.state.user).toBeDefined();
    expect(ctx.state.user).toEqual(users["u1"]);
    expect(ctx.state.user.role).toBe("admin");
  });

  await t.step("Handles missing user gracefully", async () => {
    // 1. Session exists but no userId
    const sessionId = "session-456";
    await sessionStore.set(sessionId, {
      data: { some: "data" },
      flash: {},
      lastSeenAt: Date.now(),
    });

    const ctx: any = {
      req: new Request("http://localhost/", {
        headers: { Cookie: `sessionId=${sessionId}` },
      }),
      state: {},
      next: () => Promise.resolve(new Response("OK")),
    };

    await middleware(ctx);

    expect(ctx.state.user).toBeUndefined();
  });

  await t.step("Handles non-existent user ID", async () => {
    // 1. Session has invalid userId
    const sessionId = "session-789";
    await sessionStore.set(sessionId, {
      data: {},
      flash: {},
      userId: "unknown_id",
      lastSeenAt: Date.now(),
    });

    const ctx: any = {
      req: new Request("http://localhost/", {
        headers: { Cookie: `sessionId=${sessionId}` },
      }),
      state: {},
      next: () => Promise.resolve(new Response("OK")),
    };

    await middleware(ctx);

    expect(ctx.state.user).toBeUndefined();
  });
});
