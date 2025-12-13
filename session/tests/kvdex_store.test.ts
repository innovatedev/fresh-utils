import { expect } from "./deps.ts";
import { collection, kvdex, type KvValue, model } from "@olli/kvdex";
import { KvDexSessionStorage } from "../src/stores/kvdex.ts";

Deno.test("KvDexSessionStorage", async (t) => {
  const kv = await Deno.openKv(":memory:");

  // Define models to match what the store expects/produces
  // The store internally constructs a doc with { id, createdAt, updatedAt, expiresAt, data }
  // So our collection needs to match that structure.

  // Note: kvdex collections are typed by Input/Output.
  // The store treats 'data' as TSessionInput.

  const SessionModel = model<{
    id: string;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date;
    data: KvValue;
  }>();

  const UserModel = model<{
    username: string;
  }>();

  const db = kvdex({
    kv,
    schema: {
      sessions: collection(SessionModel),
      users: collection(UserModel),
    },
  });

  const store = new KvDexSessionStorage({
    collection: db.sessions,
    userCollection: db.users,
  });

  await t.step("set and get", async () => {
    const sessionId = "test-session-id-1";
    const data = { foo: "bar", count: 123 };

    await store.set(sessionId, data);

    const retrieved = await store.get(sessionId);
    expect(retrieved).toEqual(data);
  });

  await t.step("update preserves createdAt", async () => {
    const sessionId = "test-session-id-2";
    // First set
    await store.set(sessionId, { step: 1 });
    const firstGet = await db.sessions.find(sessionId);
    const firstCreatedAt = firstGet?.value.createdAt;

    // Wait a bit to ensure time difference if any (though mock time might be needed for strictness, assume fast enough or check equality)
    await new Promise((r) => setTimeout(r, 10));

    // Update
    await store.set(sessionId, { step: 2 });
    const secondGet = await db.sessions.find(sessionId);

    // Debug logging
    console.log("First:", firstGet?.value);
    console.log("Second:", secondGet?.value);

    expect(secondGet?.value.data).toEqual({ step: 2 });
    expect(secondGet?.value.createdAt).toEqual(firstCreatedAt);
    expect(secondGet?.value.updatedAt.getTime()).toBeGreaterThanOrEqual(
      firstCreatedAt!.getTime(),
    );
  });

  await t.step("resolveUser", async () => {
    const userId = "user123";
    await db.users.set(userId, { username: "alice" });

    const user = await store.resolveUser(userId);
    expect(user).toMatchObject({ username: "alice" });
  });

  await t.step("delete", async () => {
    const sessionId = "del-test-id";
    await store.set(sessionId, { a: 1 });

    await store.delete(sessionId);
    const retrieved = await store.get(sessionId);
    expect(retrieved).toBeUndefined();
  });

  kv.close();
});
