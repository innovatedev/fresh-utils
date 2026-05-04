import { expect } from "./deps.ts";
import { getSetCookies } from "@std/http/cookie";
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

Deno.test("Integration: Flash Messages Across HTTP Redirect", async (t) => {
  const store = new MemorySessionStorage();
  const middleware = createSessionMiddleware({ store });
  let sid: string;

  await t.step("POST handler: sets flash and returns 302", async () => {
    const ctx: any = {
      req: new Request("http://localhost/action", { method: "POST" }),
      state: {},
      next: () => {
        ctx.state.flash("notice", "Changes saved");
        return Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { Location: "/dashboard" },
          }),
        );
      },
    };
    const res = await middleware(ctx);
    expect(res.status).toBe(302);
    const cookie = getSetCookies(res.headers).find((c) =>
      c.name === "sessionId"
    );
    expect(cookie).toBeDefined();
    sid = cookie!.value;
  });

  await t.step(
    "GET redirect target: flash available exactly once",
    async () => {
      const ctx: any = {
        req: new Request("http://localhost/dashboard", {
          headers: { Cookie: `sessionId=${sid}` },
        }),
        state: {},
        next: () => {
          const msg = ctx.state.flash("notice");
          return Promise.resolve(new Response(JSON.stringify({ msg })));
        },
      };
      const res = await middleware(ctx);
      const body = await res.json();
      expect(body.msg).toBe("Changes saved");
    },
  );

  await t.step("GET redirect target again: flash is gone", async () => {
    const ctx: any = {
      req: new Request("http://localhost/dashboard", {
        headers: { Cookie: `sessionId=${sid}` },
      }),
      state: {},
      next: () => {
        const msg = ctx.state.flash("notice");
        return Promise.resolve(new Response(JSON.stringify({ msg })));
      },
    };
    const res = await middleware(ctx);
    const body = await res.json();
    expect(body.msg).toBeUndefined();
  });
});
