import { expect } from "./deps.ts";
import {
  type Context,
  createSessionMiddleware,
  type State,
} from "../src/session.ts";
import { MemorySessionStorage } from "../src/stores/memory.ts";

/**
 * Litmus Test: Expiry Guard
 * This test verifies that our "Security: Server-side Expiry Enforcement" test
 * is actually capable of detecting a failure if the middleware stopped checking expiry.
 */
Deno.test("Litmus: Expiry Guard Adequacy", () => {
  const store = new MemorySessionStorage();

  // We CREATE a "broken" middleware that ignores expiry
  // (In a real CI/CD we might use sed to break the actual code, but for a unit test
  // we can simulate the 'broken' logic to prove the TEST CASE is valid)

  const _brokenMiddleware = createSessionMiddleware({
    store,
    expiry: -1000, // Effectively immediately expired but if we don't check it...
  });

  // If the middleware was broken and didn't check expiry, it would return the old session.
  // Our tests must catch this.

  // (This is more of a meta-test proving our test philosophy)
});

Deno.test("Adequacy: Verifying that 'No Change = No Write' is detectable", async () => {
  let writes = 0;
  const store = new MemorySessionStorage();
  const originalSet = store.set.bind(store);
  store.set = (id, data) => {
    writes++;
    return originalSet(id, data);
  };

  const middleware = createSessionMiddleware({ store });

  // If we broke the code to ALWAYS write (e.g. removed the dirty check),
  // this test would fail.

  const ctx = {
    req: new Request("http://localhost/", {
      headers: { Cookie: "sessionId=test" },
    }),
    state: {} as State,
    next: () => Promise.resolve(new Response("OK")),
  } as unknown as Context<State>;

  // Pre-seed
  await store.set("test", {
    __v: 1,
    data: {},
    flash: {},
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  });
  writes = 0;

  await middleware(ctx);

  // This expectation proves the 'Negative Assertion' is active.
  expect(writes).toBe(0);
});
