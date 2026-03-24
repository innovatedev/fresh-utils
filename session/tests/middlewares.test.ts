import { expect } from "./deps.ts";
import { authOnlyMiddleware, guestOnlyMiddleware } from "../src/session.ts";

Deno.test("guestOnlyMiddleware", async (t) => {
  await t.step("should redirect if user is logged in", async () => {
    const middleware = guestOnlyMiddleware("/home");
    const ctx: any = {
      state: { user: { username: "alice" } },
      redirect: (path: string) =>
        new Response(null, { status: 302, headers: { Location: path } }),
      next: () => {
        throw new Error("next() should not be called");
      },
    };

    const resp = await middleware(ctx);
    expect(resp.status).toBe(302);
    expect(resp.headers.get("Location")).toBe("/home");
  });

  await t.step("should call next() if user is not logged in", async () => {
    const middleware = guestOnlyMiddleware("/");
    let nextCalled = false;
    const ctx: any = {
      state: {},
      next: () => {
        nextCalled = true;
        return Promise.resolve(new Response("OK"));
      },
    };

    const resp = await middleware(ctx);
    expect(nextCalled).toBe(true);
    expect(await resp.text()).toBe("OK");
  });
});

Deno.test("authOnlyMiddleware", async (t) => {
  await t.step("should redirect if user is not logged in", async () => {
    const middleware = authOnlyMiddleware("/login");
    const ctx: any = {
      state: {},
      redirect: (path: string) =>
        new Response(null, { status: 302, headers: { Location: path } }),
      next: () => {
        throw new Error("next() should not be called");
      },
    };

    const resp = await middleware(ctx);
    expect(resp.status).toBe(302);
    expect(resp.headers.get("Location")).toBe("/login");
  });

  await t.step("should call next() if user is logged in", async () => {
    const middleware = authOnlyMiddleware("/login");
    let nextCalled = false;
    const ctx: any = {
      state: { user: { username: "alice" } },
      next: () => {
        nextCalled = true;
        return Promise.resolve(new Response("OK"));
      },
    };

    const resp = await middleware(ctx);
    expect(nextCalled).toBe(true);
    expect(await resp.text()).toBe("OK");
  });
});
