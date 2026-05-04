import type { MigrationConfig, MigrationFn } from "@innovatedev/fresh-session";

/**
 * Current version of the application session data schema.
 * When you change your session data shape:
 *   1. Increment this number.
 *   2. Add a migration function below for the new version.
 */
export const APP_SESSION_VERSION = 0;

/**
 * Sequential migration chain — one entry per version from 1 to APP_SESSION_VERSION.
 * Each function receives the previous version's data as `unknown` and returns the next shape.
 */
export const appMigrations: Record<number, MigrationFn> = {
  // 1: (data) => ({
  //   ...(data as object),
  //   displayName: (data as { username?: string }).username ?? null,
  // }),
};

/**
 * Resolved migration config — undefined when APP_SESSION_VERSION is 0 (no migrations yet).
 * Passed directly to createSessionMiddleware as the `migrate` option.
 */
export const migrationConfig: MigrationConfig | undefined =
  APP_SESSION_VERSION > 0
    ? { version: APP_SESSION_VERSION, migrations: appMigrations }
    : undefined;
