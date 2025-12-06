import { expect } from "./deps.ts";
import { DenoKvSessionStorage } from "../src/stores/kv.ts";

Deno.test("DenoKvSessionStorage", async (t) => {
  const kv = await Deno.openKv(":memory:");
  const store = new DenoKvSessionStorage(kv);

  await t.step("set and get", async () => {
    const sessionId = "test-id";
    const data = { name: "test-user" };
    await store.set(sessionId, data);

    const retrieved = await store.get(sessionId);
    expect(retrieved).toEqual(data);
  });

  await t.step("delete", async () => {
    const sessionId = "test-id";
    await store.delete(sessionId);

    const retrieved = await store.get(sessionId);
    expect(retrieved).toBeUndefined();
  });

  kv.close();
});
