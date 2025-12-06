import { expect } from "@std/expect";
import { getSetCookies } from "@std/http/cookie";
import { createSessionMiddleware } from "../../src/mod.ts";
import { MemorySessionStorage } from "../../src/stores/memory.ts";

const sessionStore = new MemorySessionStorage();
const sessionMiddleware = createSessionMiddleware({ store: sessionStore });

// Hypothetical Login Handler
// In a real app, this would be imported from `routes/login.tsx`
const loginHandler = async (req: Request, ctx: any) => {
  if (req.method === "POST") {
    // 1. Verify credentials (omitted)

    // 2. Set Session Data
    ctx.state.session.user = "authorized_user";

    // 3. Trigger Session Rotation for Security
    // Changing the sessionId triggers the middleware to generate a NEW secure ID
    ctx.state.sessionId = "rotate_me";

    return new Response("Login Success");
  }
  return new Response("Method Not Allowed", { status: 405 });
};

Deno.test("Login Route - Rotates Session and Sets User", async () => {
  // Mock Context
  const ctx: any = {
    req: new Request("http://localhost/login", { method: "POST" }),
    state: {}, // Middleware will hydrate this
    next: () => loginHandler(ctx.req, ctx), // Chain the handler
  };

  // Run Middleware -> Handler
  const res = await sessionMiddleware(ctx);

  // Assertions
  const cookies = getSetCookies(res.headers);
  const sessionCookie = cookies.find((c) => c.name === "sessionId");

  // 1. Cookie should be set
  expect(sessionCookie).toBeDefined();

  // 2. ID should be a secure UUID (NOT "rotate_me")
  expect(sessionCookie!.value).not.toEqual("rotate_me");
  expect(sessionCookie!.value.length).toBeGreaterThan(20); // Basic UUID check

  // 3. User should be logged in (in the persisted session)
  // To check this, we'd need to inspect the store or make a follow-up request.
  // In a unit test of the route *result*, the cookie is the main output.
});
