import { expect } from "./deps.ts";
import { getSetCookies } from "@std/http/cookie";
import { createSessionMiddleware } from "../src/mod.ts";
import { MemorySessionStorage } from "../src/stores/memory.ts";

const sessionStore = new MemorySessionStorage();
const sessionMiddleware = createSessionMiddleware({ store: sessionStore });

Deno.test("Integration: Session persistence real flow", async (t) => {
  let savedSessionId: string | undefined;

  await t.step("Step 1: Set Session Data", async () => {
    const ctx1: any = {
      req: new Request("http://localhost/"),
      state: {},
      next: () => {
        // Simulate handler setting data
        ctx1.state.session.name = "Alice";
        return Promise.resolve(new Response("Body 1"));
      },
    };

    const res1 = await sessionMiddleware(ctx1);
    const cookies = getSetCookies(res1.headers);
    const sessionCookie = cookies.find((c) => c.name === "sessionId");

    expect(sessionCookie).toBeDefined();
    savedSessionId = sessionCookie!.value;
  });

  await t.step("Step 2: Read Session Data", async () => {
    expect(savedSessionId).toBeDefined();

    const ctx2: any = {
      req: new Request("http://localhost/", {
        headers: { Cookie: `sessionId=${savedSessionId}` },
      }),
      state: {},
      next: () => {
        // Simulate handler reading data
        return Promise.resolve(
          new Response(`Hello, ${ctx2.state.session.name}`),
        );
      },
    };

    const res2 = await sessionMiddleware(ctx2);
    const text = await res2.text();

    expect(text).toEqual("Hello, Alice");
  });

  await t.step("Step 3: Rotate Session", async () => {
    const ctx3: any = {
      req: new Request("http://localhost/", {
        headers: { Cookie: `sessionId=${savedSessionId}` },
      }),
      state: {}, // Initial state will be hydrated by middleware
      next: () => {
        // Simulate handler requesting rotation by changing ID
        // Note: The middleware overwrites this value with a secure one.
        ctx3.state.sessionId = "unsafe-login-id";
        return Promise.resolve(new Response("Rotated"));
      },
    };

    const res3 = await sessionMiddleware(ctx3);
    const cookies = getSetCookies(res3.headers);
    const sessionCookie = cookies.find((c) => c.name === "sessionId");

    expect(sessionCookie).toBeDefined();
    const newSessionId = sessionCookie!.value;

    // Verify rotation logic:
    // 1. New ID is NOT the unsafe one set by handler
    expect(newSessionId).not.toEqual("unsafe-login-id");
    // 2. New ID is different from old ID
    expect(newSessionId).not.toEqual(savedSessionId);

    // 3. Old session ID should arguably be invalid now.
    // Ideally we'd check the store, but we can't access it here.
    // We can verify by making a request with the old ID and seeing empty session.

    const ctxOld: any = {
      req: new Request("http://localhost/", {
        headers: { Cookie: `sessionId=${savedSessionId}` },
      }),
      state: {},
      next: () => Promise.resolve(new Response("Check")),
    };
    await sessionMiddleware(ctxOld);
    // Should be empty/new session because old key was deleted
    expect(ctxOld.state.session.name).toBeUndefined();
    expect(ctxOld.state.sessionId).not.toEqual(savedSessionId);
  });

  await t.step("Step 4: Recover from Invalid Session", async () => {
    const bogusId = "non-existent-session-id";
    const ctx4: any = {
      req: new Request("http://localhost/", {
        headers: { Cookie: `sessionId=${bogusId}` },
      }),
      state: {},
      next: () => Promise.resolve(new Response("Recovery")),
    };

    const res4 = await sessionMiddleware(ctx4);
    const cookies = getSetCookies(res4.headers);
    const sessionCookie = cookies.find((c) => c.name === "sessionId");

    expect(sessionCookie).toBeDefined();
    const newSessionId = sessionCookie!.value;

    // Verify:
    // 1. We got a new ID
    expect(newSessionId).not.toEqual(bogusId);
    // 2. State should be empty (new session)
    expect(ctx4.state.session).toEqual({});
  });
});
