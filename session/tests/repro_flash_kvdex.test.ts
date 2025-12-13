import { expect } from "./deps.ts";
import { collection, kvdex, type KvValue, model } from "@olli/kvdex";
import { KvDexSessionStorage } from "../src/stores/kvdex.ts";

Deno.test("KvDexSessionStorage - Flash Message Persistence", async (t) => {
  const kv = await Deno.openKv(":memory:");
  const db = kvdex({
    kv,
    schema: {
      sessions: collection(model<any>()),
      users: collection(model<any>()),
    },
  });

  const store = new KvDexSessionStorage({
    collection: db.sessions,
    userCollection: db.users,
  });

  const sessionId = "session_flash_1";
  const flashKey = "alert";
  const flashMsg = "Self Destructing Message";

  // 1. Set initial session with flash message
  await store.set(sessionId, {
    data: {},
    flash: { [flashKey]: flashMsg },
    lastSeenAt: Date.now(),
  });

  // Verify it exists in store
  const initial = await store.get(sessionId);
  expect((initial as any).flash[flashKey]).toBe(flashMsg);

  // 2. Update session WITHOUT flash message (simulating consumption cleanup)
  // The middleware calls set() with the cleaned state.
  await store.set(sessionId, {
    data: {},
    flash: {}, // Empty flash
    lastSeenAt: Date.now(),
  });

  // 3. Verify it is GONE
  const updated = await store.get(sessionId);

  if ((updated as any).flash[flashKey]) {
    console.error("Flash key persisted:", (updated as any).flash);
    throw new Error("Flash message persisted after cleanup update!");
  } else {
    console.log("Flash message successfully removed.");
  }

  kv.close();
});
