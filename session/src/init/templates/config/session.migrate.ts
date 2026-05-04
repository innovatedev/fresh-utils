import type { MigrationFn } from "@innovatedev/fresh-session";

/**
 * Sequential migration chain for application session data.
 * Add functions here for every integer version from 1 up to APP_SESSION_VERSION.
 */
export const appMigrations: Record<number, MigrationFn> = {
  // 1: (data) => ({
  //   ...(data as object),
  //   displayName: (data as any).username ?? null,
  // }),
};

/**
 * Current version of the application session data schema.
 * REQUIRED if migration is enabled.
 */
export const APP_SESSION_VERSION = 0;
