import { collection, kvdex } from "@olli/kvdex";
import { MemorySessionStorage } from "../src/stores/memory.ts";
import { DenoKvSessionStorage } from "../src/stores/kv.ts";
import { KvDexSessionStorage, sessionModel } from "../src/stores/kvdex.ts";
import type { SessionData, StoredSession } from "../src/session.ts";
import type { KvValue } from "../src/stores/kvdex.ts";

const kv = await Deno.openKv(":memory:");

type TData = SessionData & KvValue;

// Setup kvdex
const db = kvdex({
  kv,
  schema: {
    sessions: collection(sessionModel<TData>()),
  },
});

const memoryStore = new MemorySessionStorage();
const kvStore = new DenoKvSessionStorage(kv);
const kvdexStore = new KvDexSessionStorage<TData, KvValue>({
  db,
  collection: db.sessions,
});

const stores = [
  { name: "Memory", store: memoryStore },
  { name: "Deno KV", store: kvStore },
  { name: "KvDex (with WAL)", store: kvdexStore },
];

const payload: StoredSession<TData> = {
  __v: 1,
  data: { foo: "bar", count: 123, roles: ["admin", "editor"] } as TData,
  flash: {},
  createdAt: Date.now(),
  lastSeenAt: Date.now(),
};

const sessionId = "bench-session-id";

for (const { name, store } of stores) {
  Deno.bench(`Store: ${name} - set`, async () => {
    await store.set(sessionId, payload);
  });

  Deno.bench(`Store: ${name} - get`, async () => {
    await store.get(sessionId);
  });
}
