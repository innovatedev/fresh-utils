import { expect } from "./deps.ts";
import { createSessionMiddleware, SessionStorage } from "../src/session.ts";

Deno.test("Session Middleware - Flash Message Persistence", async (t) => {
  const sessionId = "test-session";
  const flashKey = "info";
  const flashMsg = "Flash!";

  const storage: SessionStorage = {
    get: (_id) => ({
      data: {},
      flash: { [flashKey]: flashMsg },
      lastSeenAt: Date.now(),
    }),
    set: (_id, _data) => {},
    delete: (_id) => {},
  };

  let savedData: any = null;
  storage.set = (_id, data) => {
    savedData = data;
  };

  const middleware = createSessionMiddleware({ store: storage });

  const ctx: any = {
    req: { headers: new Headers({ cookie: `sessionId=${sessionId}` }) },
    info: { remoteAddr: { hostname: "127.0.0.1" } },
    state: {},
    next: async () => {
      // Consume the flash message
      const msg = ctx.state.flash(flashKey);
      expect(msg).toBe(flashMsg);
      return new Response("OK");
    },
  };

  await middleware(ctx);

  await t.step("should consume flash message (remove it from storage)", () => {
    // Expect saved session to NOT have the flash key
    expect(savedData.flash).toBeDefined();
    if (savedData.flash[flashKey]) {
      throw new Error("Flash message persisted after consumption!");
    }
  });
});
