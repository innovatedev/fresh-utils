import { expect } from "./deps.ts";
import { collection, kvdex, model } from "@olli/kvdex";
import { KvDexSessionStorage } from "../src/stores/kvdex.ts";

Deno.test("Write-Ahead Log (WAL) Crash Recovery", async (t) => {
  const kv = await Deno.openKv(":memory:");
  // Create a strongly typed model so that kvdex typing works
  type TestSession = { userId: string; foo: string; createdAt: Date };
  const TestModel = model<TestSession>();

  const db = kvdex({
    kv,
    schema: {
      sessions: collection(TestModel, {
        indices: {
          userId: "secondary",
        },
      }),
    },
  });

  const sessionId = "wal-test-session";
  const walPrefix = [
    "__@innovatedev__",
    "fresh-session",
    "kvdex",
    "write-ahead-logging",
  ];

  await t.step("should recover orphaned WAL records on startup", async () => {
    // 1. Simulate a crashed state: A primary document was written, and a WAL record exists,
    // but the secondary index (kvdex internal structure) was never updated.

    const oldDoc = {
      data: { foo: "bar" },
      flash: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSeenAt: new Date(),
      userId: "old-user-id", // Old index value
    };

    const newDoc = {
      ...oldDoc,
      userId: "new-user-id", // New index value we want to sync
    };

    // Insert the primary document (bypassing kvdex builder limits just like set() does)
    // deno-lint-ignore no-explicit-any
    const idKey = [...(db.sessions as any).keys.id, sessionId];
    await kv.set(idKey, newDoc);

    // Insert the WAL record that indicates the index update is pending
    await kv.set([...walPrefix, sessionId], {
      oldDoc,
      newDoc,
    });

    // 2. Instantiate the store, which fires the background #syncWal task in the constructor
    new KvDexSessionStorage({
      db: db,
      collection: db.sessions,
    });

    // Wait a brief moment for the background microtask to complete
    await new Promise((r) => setTimeout(r, 100));

    // 3. Verify the WAL record was deleted
    const walEntry = await kv.get([...walPrefix, sessionId]);
    expect(walEntry.value).toBeNull();

    // 4. Verify the old secondary index was deleted
    // deno-lint-ignore no-explicit-any
    const oldIndexSearch = await (db.sessions as any).findBySecondaryIndex(
      "userId",
      "old-user-id",
    );
    expect(oldIndexSearch.result.length).toBe(0);

    // 5. Verify the new secondary index was successfully created
    // deno-lint-ignore no-explicit-any
    const newIndexSearch = await (db.sessions as any).findBySecondaryIndex(
      "userId",
      "new-user-id",
    );
    expect(newIndexSearch.result.length).toBe(1);
    // deno-lint-ignore no-explicit-any
    expect((newIndexSearch.result[0].value as any).userId).toBe("new-user-id");
  });

  kv.close();
});
