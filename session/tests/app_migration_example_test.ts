import { expect } from "./deps.ts";
import {
  type Context,
  createSessionMiddleware,
  type State,
  type StoredSession,
} from "../src/session.ts";
import { MemorySessionStorage } from "../src/stores/memory.ts";
import { MIDDLEWARE_SCHEMA_VERSION } from "../src/migrations.ts";

/**
 * SCENARIO:
 * v0: { username: string }
 * v1: Rename username to email, add preferredTheme
 * v2: Move preferredTheme into a nested 'settings' object
 */

interface SessionV0 extends Record<string, unknown> {
  username: string;
}

interface SessionV1 extends Record<string, unknown> {
  email: string;
  preferredTheme: string;
}

interface SessionV2 extends Record<string, unknown> {
  email: string;
  settings: {
    theme: string;
  };
}

type CurrentSession = SessionV2;

interface AppState extends State<{ id: string }, CurrentSession> {}

Deno.test("Application Migration Scenario: v0 -> v1 -> v2", async () => {
  const store = new MemorySessionStorage();
  const sessionId = "user-session-123";

  // 1. Manually seed a v0-style record
  store.set(sessionId, {
    __v: MIDDLEWARE_SCHEMA_VERSION,
    __appV: 0,
    data: { username: "alice@example.com" },
    flash: {},
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  });

  // 2. Configure middleware with the full migration chain
  const middleware = createSessionMiddleware<AppState>({
    store,
    migrate: {
      version: 2,
      migrations: {
        // v0 -> v1: Rename field and set default theme
        1: (data: unknown) => {
          const old = data as SessionV0;
          return {
            email: old.username,
            preferredTheme: "light",
          };
        },
        // v1 -> v2: Restructure into settings object
        2: (data: unknown) => {
          const old = data as SessionV1;
          return {
            email: old.email,
            settings: {
              theme: old.preferredTheme,
            },
          };
        },
      },
    },
  });

  // 3. Execute middleware
  const ctx = {
    req: {
      headers: new Headers({ "Cookie": `sessionId=${sessionId}` }),
      url: "http://localhost/",
    },
    info: {
      remoteAddr: { hostname: "127.0.0.1", port: 1234, transport: "tcp" },
    },
    state: {} as AppState,
    next: () => Promise.resolve(new Response("OK")),
  } as unknown as Context<AppState>;

  await middleware(ctx);

  // 4. Verify the data is migrated correctly in memory
  expect(ctx.state.session.email, "Email should be migrated from username")
    .toBe("alice@example.com");
  expect(ctx.state.session.settings.theme, "Theme should be nested in settings")
    .toBe("light");

  // 5. Verify the store is NOT updated yet (lazy write-back)
  const storedBeforeSave = store.get(sessionId) as unknown as StoredSession<
    CurrentSession
  >;
  expect(
    storedBeforeSave.__appV,
    "Store should still be v0 due to lazy write-back",
  ).toBe(0);

  // 6. Perform a change within a request to trigger a natural save.
  // We re-use the same session ID. The middleware will read v0, migrate to v2 in-memory,
  // then when we modify it in next(), it will mark it dirty and write back v2 to the store.
  ctx.next = () => {
    ctx.state.session.settings.theme = "dark";
    return Promise.resolve(new Response("OK"));
  };

  await middleware(ctx);

  // 7. Verify the store is now updated to v2
  const storedAfterSave = store.get(sessionId) as unknown as StoredSession<
    CurrentSession
  >;
  expect(
    storedAfterSave.__appV,
    "Store should now be updated to v2 after a natural save",
  ).toBe(2);
  expect(
    storedAfterSave.data.settings.theme,
    "Stored data should match the latest state",
  ).toBe("dark");
  expect(
    storedAfterSave.data.email,
    "Stored data should be preserved across migration and save",
  ).toBe("alice@example.com");
});

Deno.test("Application Migration Scenario: Resilience on Corrupt Data", async () => {
  const store = new MemorySessionStorage();
  const sessionId = "corrupt-session";

  // Seed a record that is missing a required field for migration
  store.set(sessionId, {
    __v: MIDDLEWARE_SCHEMA_VERSION,
    __appV: 0,
    data: { somethingElse: "entirely" },
    flash: {},
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  });

  const middleware = createSessionMiddleware({
    store,
    logger: { error: () => {}, warn: () => {}, debug: () => {} },
    migrate: {
      version: 1,
      migrations: {
        1: (data: unknown) => {
          const d = data as Record<string, unknown>;
          if (!d.username) throw new Error("Missing username!");
          return { email: d.username };
        },
      },
    },
  });

  const ctx = {
    req: {
      headers: new Headers({ "Cookie": `sessionId=${sessionId}` }),
      url: "http://localhost/",
    },
    info: {
      remoteAddr: { hostname: "127.0.0.1", port: 1234, transport: "tcp" },
    },
    state: {} as AppState,
    next: () => Promise.resolve(new Response("OK")),
  } as unknown as Context<AppState>;

  await middleware(ctx);

  // Should result in a new session (old one invalidated)
  expect(ctx.state.sessionId, "A new session ID should have been generated").not
    .toBe(sessionId);
});
