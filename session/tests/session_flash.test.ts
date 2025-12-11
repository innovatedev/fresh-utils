import { expect } from "./deps.ts";
import { createSessionMiddleware } from "../src/mod.ts";
import { MemorySessionStorage } from "../src/stores/memory.ts";

Deno.test("Integration: Session Flash Messages", async (t) => {
  const sessionStore = new MemorySessionStorage();
  const sessionMiddleware = createSessionMiddleware({ store: sessionStore });
  let savedSessionId: string | undefined;

  await t.step("Set Flash Message", async () => {
    const ctx: any = {
      req: new Request("http://localhost/"),
      state: {},
      next: () => {
        ctx.state.flash("success", "Operation successful");
        return Promise.resolve(new Response("Set Flash"));
      },
    };

    const res = await sessionMiddleware(ctx);
    const cookies = res.headers.get("set-cookie");
    expect(cookies).toBeDefined();
    savedSessionId = ctx.state.sessionId;
  });

  await t.step("Consume Flash Message", async () => {
    const ctx: any = {
      req: new Request("http://localhost/", {
        headers: { Cookie: `sessionId=${savedSessionId}` },
      }),
      state: {},
      next: () => {
        // Check existence
        const has = ctx.state.hasFlash("success");
        // Get (consume)
        const msg = ctx.state.flash("success");
        // Get again (should still be there during same request?)
        const msg2 = ctx.state.flash("success");

        return Promise.resolve(
          new Response(JSON.stringify({ has, msg, msg2 })),
        );
      },
    };

    const res = await sessionMiddleware(ctx);
    const body = await res.json();

    expect(body.has).toBe(true);
    expect(body.msg).toBe("Operation successful");
    expect(body.msg2).toBe("Operation successful"); // Should be available throughout the request
  });

  await t.step("Verify Flash Message is Gone", async () => {
    const ctx: any = {
      req: new Request("http://localhost/", {
        headers: { Cookie: `sessionId=${savedSessionId}` },
      }),
      state: {},
      next: () => {
        const has = ctx.state.hasFlash("success");
        const msg = ctx.state.flash("success");
        return Promise.resolve(new Response(JSON.stringify({ has, msg })));
      },
    };

    const res = await sessionMiddleware(ctx);
    const body = await res.json();

    expect(body.has).toBe(false);
    expect(body.msg).toBeUndefined();
  });
});
