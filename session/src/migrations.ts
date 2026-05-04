import type { StoredSession } from "./session.ts";

/**
 * The current version of the session record schema.
 *
 * Increment this whenever the internal structure of StoredSession changes
 * in a way that requires data transformation.
 */
export const MIDDLEWARE_SCHEMA_VERSION = 1;

/**
 * Map of migration functions.
 * Each function upgrades a record from version (N-1) to N.
 */
export const migrations: Record<number, (record: unknown) => unknown> = {
  // Version 1 is the baseline for versioned records.
  1: (raw: unknown) => {
    const data = raw as Record<string, unknown>;
    return {
      ...data,
      __v: 1,
      flash: data.flash ?? {},
      createdAt: data.createdAt ?? Date.now(),
    };
  },
};

/**
 * Migrates a session record to the current middleware version.
 *
 * This function sequentially applies migration functions until the
 * record reaches MIDDLEWARE_SCHEMA_VERSION.
 *
 * Missing __v field is treated as version 0 and migrated forward.
 *
 * @param record The raw session record from the store.
 * @returns The migrated session record and a flag indicating if migration occurred.
 */
export function migrate(
  record: unknown,
): { record: StoredSession; migrated: boolean } {
  if (!record || typeof record !== "object") {
    // This case should be handled by the caller (returning a fresh session)
    // but we provide a baseline to avoid crashes if called incorrectly.
    return {
      record: {
        __v: MIDDLEWARE_SCHEMA_VERSION,
        __appV: 0,
        data: {},
        flash: {},
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
      } as StoredSession,
      migrated: false,
    };
  }

  let currentRecord = record as Record<string, unknown>;
  let v = (currentRecord.__v as number) ?? 0;
  const initialV = v;

  if (v > MIDDLEWARE_SCHEMA_VERSION) {
    throw new Error(
      `Middleware session version ${v} is newer than current supported version ${MIDDLEWARE_SCHEMA_VERSION}`,
    );
  }

  while (v < MIDDLEWARE_SCHEMA_VERSION) {
    const nextV = v + 1;
    const migrator = migrations[nextV];
    if (!migrator) {
      throw new Error(
        `Missing middleware migration for session version ${nextV}`,
      );
    }
    currentRecord = migrator(currentRecord) as Record<string, unknown>;
    v = nextV;
  }

  return {
    record: {
      ...currentRecord,
      __v: MIDDLEWARE_SCHEMA_VERSION,
    } as unknown as StoredSession,
    migrated: v !== initialV,
  };
}
