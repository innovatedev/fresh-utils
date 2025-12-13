import type { SessionStorage } from "@innovatedev/fresh-session";
import type { Collection, KvValue, ParseId } from "@olli/kvdex";

/**
 * Session storage implementation using kvdex Collection.
 * This storage uses a kvdex Collection to persist sessions.
 */
// Minimal shape required for the session document
export type SessionDoc<TData extends KvValue> = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  data: TData;
};

/**
 * Configuration options for the `KvDexSessionStorage`.
 */
export interface KvDexSessionStorageOptions<
  TSessionData extends KvValue,
  TUser extends KvValue,
> {
  // Collection must accept SessionDoc<TSessionData> as input
  // We use `any` for Output/Options to be flexible
  // deno-lint-ignore no-explicit-any
  collection: Collection<SessionDoc<TSessionData>, any, any>;
  // deno-lint-ignore no-explicit-any
  userCollection: Collection<TUser, any, any>;
  /**
   * Session expiration in seconds.
   */
  expireAfter?: number;
  /**
   * Optional secondary index name to use for user resolution.
   * If provided, `resolveUser` will search using this index instead of the primary key.
   */
  userIndex?: string;
}

/**
 * Session storage implementation backed by `kvdex` (Deno KV with typed Collections).
 *
 * This storage uses `kvdex` Collections to persist session data, providing
 * type safety and secondary index capabilities for user resolution.
 *
 * @example
 * ```ts
 * import { kvdex, collection, model } from "@olli/kvdex";
 * import { KvDexSessionStorage } from "@innovatedev/fresh-session/kvdex-store";
 *
 * const kv = await Deno.openKv();
 * const db = kvdex({
 *   kv,
 *   schema: {
 *     sessions: collection(model<any>()),
 *     users: collection(model<any>()),
 *   },
 * });
 *
 * const store = new KvDexSessionStorage({
 *   collection: db.sessions,
 *   userCollection: db.users,
 * });
 * ```
 */
export class KvDexSessionStorage<
  const TSessionData extends KvValue,
  const TUser extends KvValue,
> implements SessionStorage {
  // deno-lint-ignore no-explicit-any
  #collection: Collection<SessionDoc<TSessionData>, any, any>;
  // deno-lint-ignore no-explicit-any
  #userCollection: Collection<TUser, any, any>;
  #expireAfter?: number;
  #userIndex?: string;

  constructor(
    options: KvDexSessionStorageOptions<TSessionData, TUser>,
  ) {
    this.#collection = options.collection;
    this.#userCollection = options.userCollection;
    this.#expireAfter = options.expireAfter;
    this.#userIndex = options.userIndex;
  }

  async get(sessionId: string): Promise<TSessionData | undefined> {
    // We cast sessionId to ParseId because SessionStorage enforces string IDs
    const doc = await this.#collection.find(
      // deno-lint-ignore no-explicit-any
      sessionId as unknown as ParseId<any>,
    );
    // Unwrap the session data from the document structure
    // deno-lint-ignore no-explicit-any
    return (doc?.value as any)?.data ?? undefined;
  }

  async set(sessionId: string, payload: TSessionData): Promise<void> {
    // Check if session exists to preserve createdAt
    const existing = await this.#collection.find(
      // deno-lint-ignore no-explicit-any
      sessionId as unknown as ParseId<any>,
    );

    const now = new Date();
    // Safe access because we know the shape somewhat, but runtime check remains useful
    const existingVal = existing?.value as
      | Partial<SessionDoc<TSessionData>>
      | undefined;
    const createdAt = existingVal?.createdAt ?? now;
    const expiresAt = this.#expireAfter
      ? new Date(now.getTime() + this.#expireAfter * 1000)
      : new Date(now.getTime() + 1000 * 60 * 60 * 24 * 365); // Default to 1 year if not set

    // Construct the full document matching SessionDoc structure
    const doc: SessionDoc<TSessionData> = {
      id: sessionId,
      createdAt,
      updatedAt: now,
      expiresAt,
      data: payload,
    };

    // Fix for primary index collision AND update merging issues:
    // We use set() with overwrite: true to ensure full replacement (clearing flash messages).
    // We EXCLUDE 'id' from the stored value to prevent duplicate primary key errors if 'id' is indexed.
    // The 'id' is already the KV Key, so it is redundant in the value for lookup purposes.
    const { id: _id, ...safeDoc } = doc;

    const result = await this.#collection.set(
      // deno-lint-ignore no-explicit-any
      sessionId as unknown as ParseId<any>,
      // deno-lint-ignore no-explicit-any
      safeDoc as any,
      {
        expireIn: this.#expireAfter ? this.#expireAfter * 1000 : undefined,
        overwrite: true,
        // deno-lint-ignore no-explicit-any
      } as any,
    );

    if (!result.ok) {
      throw new Error(`Failed to set session ${sessionId}`);
    }
  }

  async resolveUser(userId: string): Promise<TUser | undefined> {
    let doc;
    if (this.#userIndex) {
      doc = await this.#userCollection.findBySecondaryIndex(
        // deno-lint-ignore no-explicit-any
        this.#userIndex as any,
        // deno-lint-ignore no-explicit-any
        userId as any,
      );
    } else {
      doc = await this.#userCollection.find(
        // deno-lint-ignore no-explicit-any
        userId as unknown as ParseId<any>,
      );
    }

    if (!doc) return undefined;

    // Handle potential PaginationResult
    // deno-lint-ignore no-explicit-any
    const validDoc = (doc as any).result ? (doc as any).result[0] : doc;
    if (!validDoc) return undefined;

    // We assume TUser matches doc.value
    // deno-lint-ignore no-explicit-any
    const value = validDoc.value as any;
    return {
      ...value,
      __id__: validDoc.id, // Preserve KV Key as __id__
      __versionstamp__: validDoc.versionstamp,
    };
  }

  async delete(sessionId: string): Promise<void> {
    await this.#collection.delete(
      // deno-lint-ignore no-explicit-any
      sessionId as unknown as ParseId<any>,
    );
  }
}
