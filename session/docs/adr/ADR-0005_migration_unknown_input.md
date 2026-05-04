# ADR-0005: Migration Input Typed as Unknown

## Context

Migration functions transform data from version `N-1` to `N`. In a chain of
migrations, version `N-1` might have been defined several releases ago.

## Decision

Migration functions are typed as
`(data: unknown) => unknown | Promise<unknown>`.

## Rationale

1. **Type Safety**: Typing the input as `unknown` forces the developer to
   explicitly cast the data to the expected shape of the _previous_ version.
2. **Chain Resilience**: If version `V1` is migrated to `V2`, and later `V2` is
   migrated to `V3`, a developer might skip `V2` and go straight to `V3`. If the
   input were inferred from the "current" type, it would be incorrect for the
   `V1 -> V2` step.
3. **Documentation of Schema History**: Explicit casting in migration functions
   serves as living documentation of how the session schema has evolved over
   time.

## Consequences

- Developers must use `as` or type guards inside migration functions.
- Prevents silent type errors where a migration function tries to access a field
  that doesn't exist in the version it's supposed to handle.
