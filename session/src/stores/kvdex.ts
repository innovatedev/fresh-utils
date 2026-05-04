/**
 * @module
 *
 * This module provides a Persistent Session Storage using `kvdex`.
 *
 * `kvdex` allows for strongly typed schemas and secondary indexing, which this
 * storage implementation leverages for structured data and efficient user lookups.
 *
 * @example
 * ```ts
 * import { KvDexSessionStorage } from "@innovatedev/fresh-session/kvdex-store";
 * // ... setup ...
 * ```
 */
import type { SessionStorage, StoredSession } from "../session.ts";
import {
  SessionConfigError,
  SessionConflictError,
  SessionValidationError,
} from "../errors.ts";
import {
  type Collection,
  type KvValue,
  model,
  type ParseId,
} from "@olli/kvdex";

// Re-export types that are part of the public API surface
export type { Collection, KvValue };
export type { SessionStorage } from "../session.ts";

/**
 * Factory for creating the base Zod schema for a stored session document in kvdex.
 *
 * Use this to extend your session models to ensure they include all
 * internal fields required by `fresh-session`.
 *
 * @param z The Zod instance to use (usually imported from kvdex).
 * @returns A Zod schema object.
 *
 * @example
 * ```ts
 * import { z } from "@olli/kvdex";
 * import { sessionSchemaFactory } from "@innovatedev/fresh-session/kvdex-store";
 *
 * export const MySessionSchema = sessionSchemaFactory(z).extend({
 *   theme: z.enum(["light", "dark"]).default("light"),
 * });
 * ```
 *
 * @deprecated Use {@link sessionModel} instead for a library-agnostic approach.
 */
// deno-lint-ignore no-explicit-any
export function sessionSchemaFactory(z: any): any {
  return z
    .object({
      /** Timestamp of creation. */
      createdAt: z.date(),
      /** Timestamp of last update. */
      updatedAt: z.date(),
      /** Timestamp of the last user interaction. */
      lastSeenAt: z.date(),
      /** Timestamp of expiration. */
      expiresAt: z.date(),
      /** User-defined session data. */
      data: z.any(),
      /** The unique user identifier (if logged in). */
      userId: z.string().optional(),
      /** Internal flash message storage. */
      flash: z.record(z.any()).default({}),
      /** Captured User-Agent string for validation. */
      ua: z.string().optional(),
      /** Captured Client IP address for validation. */
      ip: z.string().optional(),
      /** Schema version of the session record. */
      __v: z.number().default(1),
    }).passthrough();
}

/**
 * Minimal Standard Schema V1 interface for type inference.
 * @see https://jsr.io/@standard-schema/spec
 */
export interface StandardSchemaV1<I = unknown, O = I> {
  /** The standard schema metadata. */
  readonly "~standard": {
    /** The version of the standard schema. */
    readonly version: 1;
    /** The vendor name of the schema library. */
    readonly vendor: string;
    /** Validates the input value. */
    readonly validate: (
      value: unknown,
    ) => StandardSchemaV1.Result<O> | Promise<StandardSchemaV1.Result<O>>;
    /** Optional types for inference. */
    readonly types?: {
      /** The input type. */
      readonly input?: I;
      /** The output type. */
      readonly output?: O;
    };
  };
}

/**
 * Standard Schema V1 namespace for result types.
 */
// deno-lint-ignore no-namespace
export namespace StandardSchemaV1 {
  /** The result of a validation. */
  export type Result<O> = SuccessResult<O> | FailureResult;
  /** Success result containing the validated value. */
  export interface SuccessResult<O> {
    /** The validated value. */
    readonly value: O;
    /** No issues. */
    readonly issues?: undefined;
  }
  /** Failure result containing validation issues. */
  export interface FailureResult {
    /** No value. */
    readonly value?: undefined;
    /** The list of validation issues. */
    readonly issues: ReadonlyArray<Issue>;
  }
  /** A single validation issue. */
  export interface Issue {
    /** The error message. */
    readonly message: string;
    /** The path to the failing property. */
    readonly path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>;
  }
}

/**
 * Creates a library-agnostic kvdex model for sessions.
 *
 * If no validator is provided, this returns a model with no runtime validation (only types).
 * If a Standard Schema compliant validator (Arktype, Zod, Valibot, etc.) is provided,
 * it will be used for type inference.
 *
 * @template TData The type of the user-defined session data.
 * @param dataValidator Optional Standard Schema compliant validator for the session data.
 * @returns A kvdex model.
 */
export function sessionModel<TData extends KvValue>(
  // deno-lint-ignore no-explicit-any
  _dataValidator?: StandardSchemaV1<any, TData> | any,
  // deno-lint-ignore no-explicit-any
): any {
  // We return a raw model for the SessionDoc structure.
  // This is the most stable and library-agnostic approach.
  // deno-lint-ignore no-explicit-any
  return model<SessionDoc<TData>>() as any;
}

/**
 * Legacy alias for sessionSchemaFactory.
 *
 * @deprecated Will be removed in v1.0.0. Use {@link sessionSchemaFactory} instead.
 */
// deno-lint-ignore no-explicit-any
export const createBaseSessionSchema: (z: any) => any = sessionSchemaFactory;

/**
 * Minimal shape required for the session document stored in kvdex.
 *
 * Your kvdex schema for the session collection MUST generally conform to this shape,
 * though you can extend `data` with your specific `SessionData` type.
 */
export type SessionDoc<TData extends KvValue> = {
  __v: number;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  data: TData;
  userId?: string;
  flash: Record<string, KvValue>;
  ua?: string;
  ip?: string;
};

/**
 * Configuration options for the `KvDexSessionStorage`.
 */
export interface KvDexSessionStorageOptions<
  TSessionData extends KvValue,
  TUser extends KvValue,
> {
  /** The kvdex collection for sessions. */
  // deno-lint-ignore no-explicit-any
  collection: Collection<any, any, any>;

  /**
   * The kvdex database instance.
   * Required for atomic updates and optimistic locking.
   */
  // deno-lint-ignore no-explicit-any
  db: any;

  /** The kvdex collection for users. Optional. */
  // deno-lint-ignore no-explicit-any
  userCollection?: Collection<any, any, any>;
  /**
   * Session expiration in seconds.
   */
  expireAfter?: number;
  /**
   * Optional secondary index name to use for user resolution.
   * If provided, `resolveUser` will search using this index instead of the primary key.
   */
  userIndex?: string;
  /**
   * Optional Standard Schema compliant validator for the session data.
   */
  // deno-lint-ignore no-explicit-any
  dataValidator?: StandardSchemaV1<any, TSessionData> | any;
  /**
   * Optional prefix for Write-Ahead Log (WAL) tracking records.
   * Defaults to `["__@innovatedev__", "fresh-session", "kvdex", "write-ahead-logging"]`.
   */
  walPrefix?: Deno.KvKey;
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
  #collection: Collection<any, any, any>;
  // deno-lint-ignore no-explicit-any
  #db?: any;
  // deno-lint-ignore no-explicit-any
  #userCollection?: Collection<any, any, any>;
  #expireAfter?: number;
  #userIndex?: string;
  // deno-lint-ignore no-explicit-any
  #dataValidator?: StandardSchemaV1<any, TSessionData>;
  #idKeyPrefix: Deno.KvKey = [];
  #primaryIndexedProperties: string[] = [];
  #secondaryIndexedProperties: string[] = [];
  #primaryIndexPrefix: Deno.KvKey = [];
  #secondaryIndexPrefix: Deno.KvKey = [];
  #walPrefix: Deno.KvKey;

  /**
   * Create a new Kvdex session storage instance.
   *
   * @param options Configuration for the storage, including kvdex collections.
   */
  constructor(
    options: KvDexSessionStorageOptions<TSessionData, TUser>,
  ) {
    if (!options.db) {
      throw new SessionConfigError(
        "KvDexSessionStorage requires 'db' option to be provided for atomic operations and optimistic locking.",
      );
    }
    this.#collection = options.collection;
    this.#db = options.db;
    this.#userCollection = options.userCollection;
    this.#expireAfter = options.expireAfter;
    this.#userIndex = options.userIndex;
    this.#dataValidator = options.dataValidator;
    this.#walPrefix = options.walPrefix ??
      ["__@innovatedev__", "fresh-session", "kvdex", "write-ahead-logging"];

    // Proactively validate that the collection belongs to the provided db schema
    // We do this by attempting to create an atomic builder (no commit needed)
    try {
      // deno-lint-ignore no-explicit-any
      this.#db.atomic((schema: any) => {
        let found = false;
        for (const col of Object.values(schema)) {
          if (col === this.#collection) {
            found = true;
            break;
          }
        }
        if (!found) {
          throw new SessionConfigError(
            "KvDexSessionStorage: The provided collection instance was not found in the kvdex database schema. " +
              "Ensure you are passing the same 'db' that contains the 'collection'.",
          );
        }
      });
    } catch (e) {
      if (e instanceof SessionConfigError) throw e;
      // Ignore other potential errors during dry-run validation
    }

    // Discover internal kvdex key structure for atomic operations
    // This allows us to perform the initial atomic check/set on the primary document
    // while letting kvdex handle index maintenance in a secondary operation.
    // deno-lint-ignore no-explicit-any
    const col = this.#collection as any;
    if (col.keys) {
      this.#idKeyPrefix = col.keys.id || [];
      this.#primaryIndexPrefix = col.keys.primaryIndex || [];
      this.#secondaryIndexPrefix = col.keys.secondaryIndex || [];
    }
    this.#primaryIndexedProperties = col.primaryIndexList || [];
    this.#secondaryIndexedProperties = col.secondaryIndexList || [];

    // Trigger WAL sync in the background to clean up any stale indices from previous crashes
    // If this fails, it will result in an unhandled promise rejection, which is the correct
    // behavior for a critical database initialization failure.
    this.#syncWal();
  }

  /**
   * Retrieves session data from the kvdex collection with version tracking.
   */
  async get(
    sessionId: string,
  ): Promise<StoredSession<TSessionData> & { version: string } | undefined> {
    // We cast sessionId to ParseId because SessionStorage enforces string IDs
    const doc = await this.#collection.find(
      // deno-lint-ignore no-explicit-any
      sessionId as unknown as ParseId<any>,
    );

    if (!doc) return undefined;

    const val = doc.value as SessionDoc<TSessionData>;

    // Reconstruct StoredSession format for the middleware
    // We add guard rails here to prevent crashing on corrupted data
    const stored: StoredSession<TSessionData> = {
      __v: val.__v ?? 0,
      data: val.data,
      flash: (val.flash || {}) as Record<string, unknown>,
      userId: val.userId,
      lastSeenAt: val.lastSeenAt instanceof Date
        ? val.lastSeenAt.getTime()
        : (typeof val.lastSeenAt === "number" ? val.lastSeenAt : Date.now()),
      createdAt: val.createdAt instanceof Date
        ? val.createdAt.getTime()
        : (typeof val.createdAt === "number" ? val.createdAt : Date.now()),
      ua: val.ua,
      ip: val.ip,
    };

    // Runtime validation if a validator is provided
    if (this.#dataValidator) {
      const result = this.#dataValidator["~standard"].validate(stored.data);
      if (result instanceof Promise) {
        const resolved = await result;
        if (resolved.issues) return undefined; // Invalid data, treat as no session
        stored.data = resolved.value;
      } else if (result.issues) {
        return undefined; // Invalid data
      } else {
        stored.data = result.value;
      }
    }

    return {
      ...stored,
      version: doc.versionstamp,
    };
  }

  /**
   * Stores session data in the kvdex collection with optimistic locking.
   *
   * @param sessionId The unique session identifier.
   * @param payload The wrapped session payload from the middleware.
   * @param version The versionstamp of the session being updated.
   */
  async set(
    id: string,
    payload: StoredSession<TSessionData>,
    version?: string,
  ): Promise<void> {
    // Check if session exists to preserve createdAt and manage indices
    // deno-lint-ignore no-explicit-any
    const sessionId = id as unknown as ParseId<any>;
    const existing = await this.#collection.find(sessionId);

    const now = new Date();
    // Safe access because we know the shape somewhat, but runtime check remains useful
    const existingVal = existing?.value as
      | Partial<SessionDoc<TSessionData>>
      | undefined;

    const createdAt = existingVal?.createdAt ?? now;
    const expiresAt = this.#expireAfter
      ? new Date(now.getTime() + this.#expireAfter * 1000)
      : new Date(now.getTime() + 1000 * 60 * 60 * 24 * 365); // Default to 1 year if not set

    // Extract fields from StoredSession payload (which middleware passes as payload)
    // deno-lint-ignore no-explicit-any
    const p = payload as any;

    // Runtime validation before set
    if (this.#dataValidator) {
      const result = this.#dataValidator["~standard"].validate(p.data);
      if (result instanceof Promise) {
        const resolved = await result;
        if (resolved.issues) {
          throw new SessionValidationError(
            `Session data validation failed: ${
              resolved.issues.map((i) => i.message).join(", ")
            }`,
          );
        }
      } else if (result.issues) {
        throw new SessionValidationError(
          `Session data validation failed: ${
            result.issues.map((i) => i.message).join(", ")
          }`,
        );
      }
    }

    // Construct the full document matching SessionDoc structure
    const doc: SessionDoc<TSessionData> = {
      __v: p.__v ?? 1,
      createdAt,
      updatedAt: now,
      expiresAt,
      data: p.data,
      flash: p.flash ?? {},
      userId: p.userId,
      lastSeenAt: p.lastSeenAt ? new Date(p.lastSeenAt) : now,
      ua: p.ua,
      ip: p.ip,
    };

    const expireIn = this.#expireAfter ? this.#expireAfter * 1000 : undefined;

    // Prepare common variables
    const idKey = [...this.#idKeyPrefix, sessionId];
    const walKey = [...this.#walPrefix, sessionId];

    // Attempt 1: Full atomic update using raw Deno KV (bypassing kvdex builder limits)
    const atomic = this.#db.kv.atomic();

    if (version) {
      atomic.check({ key: idKey, versionstamp: version });
    }

    // Main document write
    atomic.set(idKey, doc, { expireIn });
    // WAL tracking record write
    atomic.set(walKey, { oldDoc: existingVal, newDoc: doc, expireIn });

    const res = await atomic.commit();

    if (res.ok) {
      // Success!
      // Update indices sequentially to ensure read-after-write consistency.
      // If this fails, it will throw directly to the caller, allowing the application
      // to handle the error properly.
      await this.#updateIndices(sessionId, existingVal, doc, expireIn);
      return;
    }

    // If we got here, the check failed (optimistic locking conflict)
    if (version) {
      throw new SessionConflictError();
    }
  }

  /**
   * Manually updates kvdex indices without triggering an atomic transaction limits or primary record overwrites.
   */
  async #updateIndices(
    sessionId: string,
    // deno-lint-ignore no-explicit-any
    oldDoc: any | undefined,
    // deno-lint-ignore no-explicit-any
    newDoc: any,
    expireIn?: number,
  ) {
    const encoder = new TextEncoder();
    const promises: Promise<void>[] = [];
    const primaryIndexDoc = { ...newDoc, __id__: sessionId };

    // 1. Delete old secondary indices
    for (const prop of this.#secondaryIndexedProperties) {
      const oldVal = oldDoc?.[prop];
      const newVal = newDoc?.[prop];
      if (oldVal !== undefined && oldVal !== null && oldVal !== newVal) {
        const indexKey = [
          ...this.#secondaryIndexPrefix,
          prop,
          encoder.encode(JSON.stringify(oldVal)),
          sessionId,
        ];
        promises.push(this.#db.kv.delete(indexKey));
      }
    }

    // 2. Set new secondary indices
    for (const prop of this.#secondaryIndexedProperties) {
      const newVal = newDoc?.[prop];
      if (newVal !== undefined && newVal !== null) {
        const indexKey = [
          ...this.#secondaryIndexPrefix,
          prop,
          encoder.encode(JSON.stringify(newVal)),
          sessionId,
        ];
        promises.push(this.#db.kv.set(indexKey, newDoc, { expireIn }));
      }
    }

    // 3. Delete old primary indices
    for (const prop of this.#primaryIndexedProperties) {
      const oldVal = oldDoc?.[prop];
      const newVal = newDoc?.[prop];
      if (oldVal !== undefined && oldVal !== null && oldVal !== newVal) {
        const indexKey = [
          ...this.#primaryIndexPrefix,
          prop,
          encoder.encode(JSON.stringify(oldVal)),
        ];
        promises.push(this.#db.kv.delete(indexKey));
      }
    }

    // 4. Set new primary indices
    for (const prop of this.#primaryIndexedProperties) {
      const newVal = newDoc?.[prop];
      if (newVal !== undefined && newVal !== null) {
        const indexKey = [
          ...this.#primaryIndexPrefix,
          prop,
          encoder.encode(JSON.stringify(newVal)),
        ];
        promises.push(this.#db.kv.set(indexKey, primaryIndexDoc, { expireIn }));
      }
    }

    // Execute all index updates concurrently.
    // We use Promise.all to ensure that if any update fails, the WAL record is NOT deleted,
    // allowing for a retry during the next startup or sync.
    await Promise.all(promises);

    // Clear the WAL tracking record since index updates are complete
    await this.#db.kv.delete([...this.#walPrefix, sessionId]);
  }

  /**
   * Recovers any pending index updates that were interrupted by a process crash.
   */
  async #syncWal() {
    for await (const entry of this.#db.kv.list({ prefix: this.#walPrefix })) {
      const sessionId = entry.key[entry.key.length - 1] as string;
      // deno-lint-ignore no-explicit-any
      const { oldDoc, newDoc, expireIn } = entry.value as any;
      try {
        await this.#updateIndices(sessionId, oldDoc, newDoc, expireIn);
      } catch (error) {
        console.error(
          `[session] WAL sync failed for session ${sessionId}:`,
          error,
        );
      }
    }
  }

  /**
   * Resolves a user from the user collection, optionally using a secondary index.
   */
  async resolveUser(userId: string): Promise<TUser | undefined> {
    if (!this.#userCollection) return undefined;

    let doc;
    if (this.#userIndex) {
      const result = await this.#userCollection.findBySecondaryIndex(
        // deno-lint-ignore no-explicit-any
        this.#userIndex as any,
        // deno-lint-ignore no-explicit-any
        userId as any,
      );
      doc = result.result[0];
    } else {
      doc = await this.#userCollection.find(
        // deno-lint-ignore no-explicit-any
        userId as unknown as ParseId<any>,
      );
    }

    if (!doc) return undefined;

    // We assume TUser matches doc.value
    // deno-lint-ignore no-explicit-any
    const value = doc.value as any;
    return value as TUser;
  }

  /**
   * Deletes session data from the kvdex collection.
   */
  async delete(sessionId: string): Promise<void> {
    await this.#collection.delete(
      // deno-lint-ignore no-explicit-any
      sessionId as unknown as ParseId<any>,
    );
  }
}
