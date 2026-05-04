# ADR-0004: Dual-Layer Session Versioning

## Context

Sessions evolve in two independent ways:

1. **Middleware Schema**: The internal structure used by
   `@innovatedev/fresh-session` (e.g. adding `ip`, `ua`, or changing internal
   field names).
2. **Application Data**: The custom structure defined by the application
   developer (e.g. renaming `username` to `email`).

## Decision

We maintain two separate version fields in every session record:

- `__v`: Middleware schema version (managed by the package).
- `__appV`: Application data version (managed by the developer).

## Rationale

1. **Decoupled Evolution**: A package upgrade that changes internal schema
   should not force a developer to bump their application version, and vice
   versa.
2. **Granular Migration**: Migrations can be applied independently. The
   middleware handles its own internal migration before handing the record to
   the application migration runner.
3. **Rollback Safety**: Separate versions allow for more precise
   `onUnknownVersion` policies. If a middleware version is unknown, it's a
   critical error. If an application version is unknown, it might just be a
   rollback situation the developer can handle (e.g. `invalidate` or `reset`).

## Consequences

- Slightly more metadata in the stored record.
- Clearer separation of concerns in the configuration.
- Enables robust "lazy migration" patterns.
