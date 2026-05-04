import type { StoredSession } from "./session.ts";

/**
 * The current version of the session record schema.
 *
 * Increment this whenever the internal structure of StoredSession changes
 * in a way that requires data transformation.
 */
export const CURRENT_SESSION_FORMAT_VERSION = 1;

/**
 * Map of migration functions.
 * Each function upgrades a record from version (N-1) to N.
 */
// deno-lint-ignore no-explicit-any
export const migrations: Record<number, (record: any) => any> = {
  // Version 1 is the baseline for versioned records.
  // Future migrations will be added here (e.g., 2: (record) => { ... }).
};

/**
 * Migrates a session record to the current version.
 *
 * This function sequentially applies migration functions until the
 * record reaches CURRENT_SESSION_FORMAT_VERSION.
 *
 * If the record is missing a version field, it is treated as legacy/unknown
 * and a fresh session is returned.
 *
 * @param record The raw session record from the store.
 * @returns The migrated session record.
 */
// deno-lint-ignore no-explicit-any
export function migrate(record: any): StoredSession {
  // If no record or no version field, treat as invalid/legacy and start fresh
  if (!record || typeof record.__v !== "number") {
    return {
      __v: CURRENT_SESSION_FORMAT_VERSION,
      data: {},
      flash: {},
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    };
  }

  let v = record.__v;

  if (v > CURRENT_SESSION_FORMAT_VERSION) {
    throw new Error(
      `Session version ${v} is newer than current supported version ${CURRENT_SESSION_FORMAT_VERSION}`,
    );
  }

  while (v < CURRENT_SESSION_FORMAT_VERSION) {
    const nextV = v + 1;
    const migrator = migrations[nextV];
    if (!migrator) {
      throw new Error(`Missing migration for session version ${nextV}`);
    }
    record = migrator(record);
    v = nextV;
  }

  return {
    ...record,
    __v: CURRENT_SESSION_FORMAT_VERSION,
  } as StoredSession;
}
