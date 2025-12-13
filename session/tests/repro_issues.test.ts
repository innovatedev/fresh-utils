import { expect } from "./deps.ts";
import { collection, kvdex, type KvValue, model } from "@olli/kvdex";
import { KvDexSessionStorage } from "../src/stores/kvdex.ts";

Deno.test("KvDexSessionStorage - Issues Reproduction", async (t) => {
  const kv = await Deno.openKv(":memory:");

  // Issue 1: Primary Index on ID
  await t.step("Issue 1: set fails with primary index on id", async () => {
    // Model with id as primary index
    const SessionModelPrimary = model<{
      id: string;
      createdAt: Date;
      updatedAt: Date;
      expiresAt: Date;
      data: KvValue;
    }>();

    const db = kvdex({
      kv,
      schema: {
        sessions: collection(SessionModelPrimary, {
          indices: {
            id: "primary",
          },
        }),
        users: collection(model<{ username: string }>()),
      },
    });

    const store = new KvDexSessionStorage({
      collection: db.sessions,
      userCollection: db.users,
    });

    const sessionId = "session_primary_1";
    try {
      await store.set(sessionId, { foo: "bar" });
      // Update
      await store.set(sessionId, { foo: "baz" });

      const res = await store.get(sessionId);
      expect(res).toEqual({ foo: "baz" });
    } catch (e) {
      console.log("Issue 1 reproduced:", (e as Error).message);
      throw e;
    }
  });

  await t.step("Issue 1 Workaround: check if update works", async () => {
    // Re-setup db for this step to ensure clean state or reuse
    // We reuse the same model/schema concepts
    const SessionModelPrimary = model<{
      id: string;
      createdAt: Date;
      updatedAt: Date;
      expiresAt: Date;
      data: KvValue;
    }>();

    const db = kvdex({
      kv,
      schema: {
        sessions: collection(SessionModelPrimary, {
          indices: {
            id: "primary",
          },
        }),
      },
    });

    const sessionId = "session_param_update_1";
    await db.sessions.set(sessionId, {
      id: sessionId,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(),
      data: { a: 1 },
    });

    // Try update
    try {
      await db.sessions.update(sessionId, { data: { a: 2 } });
      const res = await db.sessions.find(sessionId);
      expect(res?.value.data).toEqual({ a: 2 });
    } catch (e) {
      console.log("Update workaround failed:", (e as Error).message);
      throw e;
    }
  });

  // Issue 2: resolveUser mismatch
  await t.step("Issue 2: resolveUser fails for non-key ID", async () => {
    const UserModel = model<{
      realId: string;
      username: string;
    }>();

    const db = kvdex({
      kv,
      schema: {
        sessions: collection(model<any>()),
        // Assume users are indexed by realId mostly, but KV key is something else
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
      userIndex: "realId",
    });

    // Create user with KV Key "user_ulid_1" but semantic ID "user_uuid_1"
    const kvKey = "user_ulid_1";
    const semanticId = "user_uuid_1";

    await db.users.set(kvKey, { realId: semanticId, username: "alice" });

    // Session claims user is "user_uuid_1"
    const resolved = await store.resolveUser(semanticId);

    if (!resolved) {
      console.log("Issue 2 reproduced: User not found via semantic ID");
      throw new Error("Should have found user via userIndex");
    } else {
      console.log("Issue 2 Resolved:", resolved);
      expect(resolved.username).toBe("alice");
      expect((resolved as any).__id__).toBe(kvKey);
    }
  });

  kv.close();
});
