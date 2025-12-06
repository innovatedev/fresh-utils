import type { SessionData, SessionStorage } from "../session.ts";

export class DenoKvSessionStorage implements SessionStorage {
  constructor(private kv: Deno.Kv, private prefix: Deno.KvKey = ["session"]) {}

  async get(sessionId: string): Promise<SessionData | undefined> {
    const res = await this.kv.get<SessionData>([...this.prefix, sessionId]);
    return res.value || undefined;
  }

  async set(sessionId: string, data: SessionData): Promise<void> {
    await this.kv.set([...this.prefix, sessionId], data);
  }

  async delete(sessionId: string): Promise<void> {
    await this.kv.delete([...this.prefix, sessionId]);
  }
}
