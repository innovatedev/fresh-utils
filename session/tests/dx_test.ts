import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createSessionMiddleware, State } from "../src/session.ts";
import { DenoKvSessionStorage } from "../src/stores/kv.ts";

Deno.test("DX: instantiation without arguments", async () => {
  const store = new DenoKvSessionStorage();
  // Should work (uses default Deno.openKv())

  // Clean up - accessing private kv promise to close it
  const kv = await (store as any).kv;
  await kv.close();
});

Deno.test("DX: instantiation with promise", async () => {
  const kvPromise = Deno.openKv();
  const store = new DenoKvSessionStorage(kvPromise);
  // Clean up
  const kv = await kvPromise;
  await kv.close();
});

Deno.test("DX: user resolution from store", async () => {
  const kv = await Deno.openKv();
  // Setup user
  await kv.set(["users", "u1"], { id: "u1", name: "Alice" });

  const store = new DenoKvSessionStorage(kv, {
    userKeyPrefix: ["users"],
  });

  const sessionMiddleware = createSessionMiddleware({
    store,
    // No resolveUser here, should use store's
  });

  // Mock checking resolveUser logic indirectly or directly via store
  if (store.resolveUser) {
    const user = await store.resolveUser("u1");
    assertEquals(user, { id: "u1", name: "Alice" });
  } else {
    throw new Error("resolveUser should be defined");
  }

  await kv.close();
});

// Mock Type Check (Runtime simulation)
Deno.test("DX: Generic State Types", async () => {
  interface AppState extends State {
    user: { name: string };
  }

  const store = new DenoKvSessionStorage();
  const sessionMiddleware = createSessionMiddleware<AppState, { name: string }>(
    {
      store,
    },
  );

  assertExists(sessionMiddleware);

  // Cleanup
  const kv = await (store as any).kv;
  await kv.close();
});
