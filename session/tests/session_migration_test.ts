import { expect } from "./deps.ts";
import {
  type Context,
  createSessionMiddleware,
  type State,
  type StoredSession,
} from "../src/session.ts";
import { MemorySessionStorage } from "../src/stores/memory.ts";
import { MIDDLEWARE_SCHEMA_VERSION } from "../src/migrations.ts";
import { SessionConfigError } from "../src/errors.ts";

interface AppSession {
  username?: string;
  displayName?: string;
  theme?: string;
  count?: number;
  secret?: string;
  foo?: string;
  data?: Record<string, unknown>;
}

interface MockState extends State<{ id: string }, AppSession> {
  sessionId: string;
  userId?: string;
  user?: { id: string };
  login: (userId: string, data?: AppSession) => Promise<void>;
  logout: () => Promise<void>;
  flash: (key: string) => unknown;
  hasFlash: (key: string) => boolean;
}

function createMockContext(sessionId?: string): Context<MockState> {
  const headers = new Headers();
  if (sessionId) {
    headers.set("Cookie", `sessionId=${sessionId}`);
  }
  return {
    req: {
      headers,
      url: "http://localhost/",
    },
    info: {
      remoteAddr: { hostname: "127.0.0.1", port: 1234, transport: "tcp" },
    },
    state: {
      login: () => Promise.resolve(),
      logout: () => Promise.resolve(),
      flash: () => undefined,
      hasFlash: () => false,
    } as unknown as MockState,
    next: () => Promise.resolve(new Response("OK")),
  } as unknown as Context<MockState>;
}

Deno.test("Session Migration: Middleware Schema Version (__v)", async (t) => {
  await t.step(
    "should migrate record missing __v (v0) to current version",
    async () => {
      const store = new MemorySessionStorage();
      const sessionId = "session-v0";
      const legacyRecord = {
        data: { foo: "bar" },
        flash: { msg: "hello" },
        createdAt: 1000,
        lastSeenAt: 2000,
      };
      // Manually insert into store (simulating v0)
      store.set(sessionId, legacyRecord);

      const middleware = createSessionMiddleware({ store });
      const ctx = createMockContext(sessionId);
      await middleware(ctx);

      // Verify migrated state in ctx.state.session
      expect(ctx.state.session.foo).toBe("bar");

      // Verify stored record after middleware (should still be v1 because it wasn't modified yet, or was it?)
      // Actually, migration happens on READ. It's written back ONLY if natural store.set occurs.
      // In our middleware, shouldUpdateLastSeen will likely be true if it was last seen at 2000.
      const stored = store.get(sessionId);
      expect(stored?.__v).toBe(MIDDLEWARE_SCHEMA_VERSION);
      expect(stored?.data).toEqual({ foo: "bar" });
    },
  );
});

Deno.test("Session Migration: Application Data Version (__appV)", async (t) => {
  await t.step("should migrate forward sequentially", async () => {
    const store = new MemorySessionStorage();
    const sessionId = "session-app-v0";
    store.set(sessionId, {
      __v: MIDDLEWARE_SCHEMA_VERSION,
      __appV: 0,
      data: { username: "alice" },
      flash: {},
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    const middleware = createSessionMiddleware({
      store,
      migrate: {
        version: 2,
        migrations: {
          1: (data: unknown) => {
            const d = data as AppSession;
            return { ...d, displayName: d.username };
          },
          2: (data: unknown) => {
            const d = data as AppSession;
            return { ...d, theme: "dark" };
          },
        },
      },
    });

    const ctx = createMockContext(sessionId);
    await middleware(ctx);

    expect(
      ctx.state.session.displayName,
      "Migration 1 (displayName) should have run",
    ).toBe("alice");
    expect(ctx.state.session.theme, "Migration 2 (theme) should have run").toBe(
      "dark",
    );
    expect(
      (ctx.state.session as unknown as AppSession).username,
      "Original data should be preserved",
    ).toBe("alice");
  });

  await t.step("should support async migrations", async () => {
    const store = new MemorySessionStorage();
    const sessionId = "session-async";
    store.set(sessionId, {
      __v: MIDDLEWARE_SCHEMA_VERSION,
      __appV: 0,
      data: { count: 1 },
      flash: {},
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    const middleware = createSessionMiddleware({
      store,
      migrate: {
        version: 1,
        migrations: {
          1: async (data: unknown) => {
            const d = data as AppSession;
            await new Promise((r) => setTimeout(r, 10));
            return { ...d, count: (d.count ?? 0) + 1 };
          },
        },
      },
    });

    const ctx = createMockContext(sessionId);
    await middleware(ctx);

    expect(ctx.state.session.count).toBe(2);
  });

  await t.step("onUnknownVersion: invalidate (default)", async () => {
    const store = new MemorySessionStorage();
    const sessionId = "session-future";
    store.set(sessionId, {
      __v: MIDDLEWARE_SCHEMA_VERSION,
      __appV: 5,
      data: { secret: "from-future" },
      flash: {},
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    const middleware = createSessionMiddleware({
      store,
      migrate: {
        version: 2,
        migrations: { 1: (d) => d, 2: (d) => d },
      },
    });

    const ctx = createMockContext(sessionId);
    await middleware(ctx);

    // Should be a new session
    expect(ctx.state.sessionId).not.toBe(sessionId);
    expect(ctx.state.session.secret).toBeUndefined();
  });

  await t.step("onUnknownVersion: reset", async () => {
    const store = new MemorySessionStorage();
    const sessionId = "session-future-reset";
    store.set(sessionId, {
      __v: MIDDLEWARE_SCHEMA_VERSION,
      __appV: 5,
      userId: "user-123",
      data: { secret: "from-future" },
      flash: {},
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    const middleware = createSessionMiddleware({
      store,
      resolveUser: (id) => id ? { id } : undefined,
      migrate: {
        version: 2,
        onUnknownVersion: "reset",
        migrations: { 1: (d) => d, 2: (d) => d },
      },
    });

    const ctx = createMockContext(sessionId);
    ctx.next = () => {
      ctx.state.session.foo = "bar";
      return Promise.resolve(new Response("OK"));
    };

    await middleware(ctx);

    // Should keep same session ID and userId, but clear data
    expect(ctx.state.sessionId, "Session ID should be preserved on reset").toBe(
      sessionId,
    );
    expect(ctx.state.userId, "User ID should be preserved on reset").toBe(
      "user-123",
    );
    expect(ctx.state.session.secret, "Session data should be cleared on reset")
      .toBeUndefined();

    // Verify stored record has updated __appV but empty data (except our new change)
    const stored = store.get(sessionId) as StoredSession<AppSession>;
    expect(
      stored?.__appV,
      "Application version should be updated in store after save",
    ).toBe(2);
    expect(stored?.data, "New data should be saved after reset").toEqual({
      foo: "bar",
    });
  });

  await t.step("onUnknownVersion: keep", async () => {
    const store = new MemorySessionStorage();
    const sessionId = "session-future-keep";
    store.set(sessionId, {
      __v: MIDDLEWARE_SCHEMA_VERSION,
      __appV: 5,
      data: { secret: "from-future" },
      flash: {},
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    const middleware = createSessionMiddleware({
      store,
      migrate: {
        version: 2,
        onUnknownVersion: "keep",
        migrations: { 1: (d) => d, 2: (d) => d },
      },
    });

    const ctx = createMockContext(sessionId);
    await middleware(ctx);

    expect(ctx.state.sessionId).toBe(sessionId);
    expect(ctx.state.session.secret).toBe("from-future");
  });

  await t.step("should fail-closed if migration function throws", async () => {
    const store = new MemorySessionStorage();
    const sessionId = "session-throwing";
    store.set(sessionId, {
      __v: MIDDLEWARE_SCHEMA_VERSION,
      __appV: 0,
      data: { count: 1 },
      flash: {},
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    let logErrorCalled = false;
    const middleware = createSessionMiddleware({
      store,
      logger: {
        error: (msg, err) => {
          logErrorCalled = true;
          expect(msg).toContain("Application migration failed");
          expect(err).toBeDefined();
        },
        warn: () => {},
      },
      migrate: {
        version: 1,
        migrations: {
          1: () => {
            throw new Error("Migration failed!");
          },
        },
      },
    });

    const ctx = createMockContext(sessionId);
    await middleware(ctx);

    // Should be logged out (new session)
    expect(ctx.state.sessionId).not.toBe(sessionId);
    expect(ctx.state.session.count).toBeUndefined();
    expect(logErrorCalled, "Migration error should have been logged").toBe(true);
  });
});

Deno.test("Session Migration: forceWriteOnMigration", async (t) => {
  await t.step("should force write if true", async () => {
    const store = new MemorySessionStorage();
    const sessionId = "session-force-write";
    store.set(sessionId, {
      __v: MIDDLEWARE_SCHEMA_VERSION,
      __appV: 0,
      data: { foo: "bar" },
      flash: {},
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    const middleware = createSessionMiddleware({
      store,
      migrate: {
        version: 1,
        forceWriteOnMigration: true,
        migrations: { 1: (d) => d },
      },
    });

    const ctx = createMockContext(sessionId);
    const setSpy = store.set.bind(store);
    let setCalled = false;
    store.set = (sid, data, version) => {
      setCalled = true;
      return setSpy(sid, data, version);
    };

    await middleware(ctx);
    expect(setCalled).toBe(true);
    const stored = store.get(sessionId);
    expect(stored?.__appV).toBe(1);
  });

  await t.step(
    "should NOT force write if false (default) on read-only request",
    async () => {
      const store = new MemorySessionStorage();
      const sessionId = "session-no-force";
      const now = Date.now();
      store.set(sessionId, {
        __v: MIDDLEWARE_SCHEMA_VERSION,
        __appV: 0,
        data: { foo: "bar" },
        flash: {},
        createdAt: now,
        lastSeenAt: now, // recent enough to not trigger heartbeat
      });

      const middleware = createSessionMiddleware({
        store,
        migrate: {
          version: 1,
          forceWriteOnMigration: false,
          migrations: { 1: (d) => d },
        },
      });

      const ctx = createMockContext(sessionId);
      let setCalled = false;
      const originalSet = store.set.bind(store);
      store.set = (sid, data, ver) => {
        setCalled = true;
        return originalSet(sid, data, ver);
      };

      await middleware(ctx);
      expect(setCalled).toBe(false);

      // In memory it is migrated
      expect(ctx.state.session.foo).toBe("bar");
      // But in store it is still v0
      const stored = store.get(sessionId) as unknown as Record<string, unknown>;
      expect(stored.__appV).toBe(0);
    },
  );
});

Deno.test("Session Migration: Startup Validation", async (t) => {
  await t.step("should throw on missing migration", () => {
    const store = new MemorySessionStorage();
    expect(() =>
      createSessionMiddleware({
        store,
        migrate: {
          version: 2,
          migrations: { 1: (d) => d }, // Missing 2
        },
      })
    ).toThrow(SessionConfigError);
  });

  await t.step("should throw on migration gap", () => {
    const store = new MemorySessionStorage();
    expect(() =>
      createSessionMiddleware({
        store,
        migrate: {
          version: 3,
          migrations: { 1: (d) => d, 3: (d) => d }, // Missing 2
        },
      })
    ).toThrow(SessionConfigError);
  });

  await t.step("should throw on invalid version", () => {
    const store = new MemorySessionStorage();
    expect(() =>
      createSessionMiddleware({
        store,
        migrate: {
          version: 0,
          migrations: {},
        },
      })
    ).toThrow(SessionConfigError);
  });
});
