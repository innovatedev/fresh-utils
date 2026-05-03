import { expect } from "./deps.ts";
import { collection, kvdex, model } from "@olli/kvdex";
import { KvDexSessionStorage, sessionModel } from "../src/stores/kvdex.ts";

Deno.test("KvDexSessionStorage", async (t) => {
  const kv = await Deno.openKv(":memory:");

  // Use the new library-agnostic model
  // deno-lint-ignore no-explicit-any
  const MySessionModel = sessionModel<any>();
  const UserModel = model<{ username: string; realId?: string }>();

  const db = kvdex({
    kv,
    schema: {
      sessions: collection(MySessionModel),
      users: collection(UserModel, {
        indices: {
          realId: "secondary",
        },
      }),
    },
  });

  const store = new KvDexSessionStorage({
    collection: db.sessions,
    userCollection: db.users,
  });

  await t.step("set and get (flat structure)", async () => {
    const sessionId = "test-session-id-1";
    const payload = {
      data: { foo: "bar", count: 123 },
      flash: {},
      lastSeenAt: Date.now(),
    };

    await store.set(sessionId, payload);

    const retrieved = await store.get(sessionId);
    expect(retrieved?.data).toEqual(payload.data);

    // Directly inspect the document in kvdex to verify flat structure
    const doc = await db.sessions.find(sessionId);
    expect(doc).toBeDefined();
    // deno-lint-ignore no-explicit-any
    const val = doc?.value as any;
    expect(val.createdAt).toBeInstanceOf(Date);
    expect(val.data).toEqual(payload.data);
    expect(val.flash).toEqual({});
    // CRITICAL: Ensure id is NOT in the record (anti-pattern)
    expect(val.id).toBeUndefined();
  });

  await t.step("update preserves createdAt", async () => {
    const sessionId = "test-session-id-2";
    const p1 = { data: { step: 1 }, flash: {}, lastSeenAt: Date.now() };
    // deno-lint-ignore no-explicit-any
    await store.set(sessionId, p1 as any);
    const firstGet = await db.sessions.find(sessionId);
    // deno-lint-ignore no-explicit-any
    const firstCreatedAt = (firstGet?.value as any).createdAt;

    await new Promise((r) => setTimeout(r, 10));

    const p2 = { data: { step: 2 }, flash: {}, lastSeenAt: Date.now() };
    // deno-lint-ignore no-explicit-any
    await store.set(sessionId, p2 as any);
    const secondGet = await db.sessions.find(sessionId);
    // deno-lint-ignore no-explicit-any
    const secondVal = secondGet?.value as any;

    expect(secondVal.data).toEqual({ step: 2 });
    expect(secondVal.createdAt).toEqual(firstCreatedAt);
  });

  await t.step("resolveUser (primary key)", async () => {
    const userId = "user123";
    await db.users.set(userId, { username: "alice" });

    const user = await store.resolveUser(userId);
    expect(user).toMatchObject({ username: "alice" });
  });

  await t.step("resolveUser (secondary/primary index mapping)", async () => {
    const storeWithIndex = new KvDexSessionStorage({
      collection: db.sessions,
      userCollection: db.users,
      userIndex: "realId",
    });

    const kvKey = "user_ulid_1";
    const semanticId = "user_uuid_1";

    await db.users.set(kvKey, { realId: semanticId, username: "bob" });

    const user = await storeWithIndex.resolveUser(semanticId);
    expect(user).toBeDefined();
    // deno-lint-ignore no-explicit-any
    expect((user as any).username).toBe("bob");
    // Ensure no internal ID leakage
    // deno-lint-ignore no-explicit-any
    expect((user as any).__id__).toBeUndefined();
  });

  await t.step("delete", async () => {
    const sessionId = "del-test-id";
    await store.set(
      sessionId,
      // deno-lint-ignore no-explicit-any
      { data: { a: 1 }, flash: {}, lastSeenAt: Date.now() } as any,
    );

    await store.delete(sessionId);
    const retrieved = await store.get(sessionId);
    expect(retrieved).toBeUndefined();
  });

  kv.close();
});
