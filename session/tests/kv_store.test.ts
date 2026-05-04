import { expect } from "./deps.ts";
import { DenoKvSessionStorage } from "../src/stores/kv.ts";
import { SessionConflictError } from "../src/errors.ts";
import type { StoredSession } from "../src/session.ts";

Deno.test("DenoKvSessionStorage", async (t) => {
  const kv = await Deno.openKv(":memory:");
  const store = new DenoKvSessionStorage(kv);

  await t.step("set and get", async () => {
    const sessionId = "test-id";
    const data = {
      __v: 1,
      data: { name: "test-user" },
      flash: {},
      lastSeenAt: Date.now(),
      createdAt: Date.now(),
    };
    await store.set(sessionId, data);

    const retrieved = await store.get(sessionId);
    expect(retrieved?.data).toEqual(data.data);
  });

  await t.step("delete", async () => {
    const sessionId = "test-id";
    await store.delete(sessionId);

    const retrieved = await store.get(sessionId);
    expect(retrieved).toBeUndefined();
  });

  await t.step("should throw on version mismatch", async () => {
    const sessionId = "conflict-test";
    await store.set(sessionId, {
      __v: 1,
      data: { val: 1 },
      flash: {},
      lastSeenAt: Date.now(),
      createdAt: Date.now(),
    } as StoredSession);

    const res = await store.get(sessionId);
    const version = res?.version;

    // Concurrent update (simulated by manual set)
    await store.set(sessionId, {
      __v: 1,
      data: { val: 2 },
      flash: {},
      lastSeenAt: Date.now(),
      createdAt: Date.now(),
    } as StoredSession);

    // Attempt update with old version should throw SessionConflictError
    await expect(store.set(sessionId, {
      __v: 1,
      data: { val: 3 },
      flash: {},
      lastSeenAt: Date.now(),
      createdAt: Date.now(),
    } as StoredSession, version)).rejects.toThrow(SessionConflictError);
  });

  kv.close();
});
