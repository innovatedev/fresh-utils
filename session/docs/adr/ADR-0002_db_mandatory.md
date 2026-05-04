# ADR-0002: Mandatory DB Instance for KvDexSessionStorage

## Context

In version 0.7.0, we introduced `session.update()` for atomic mutations. This
requires the storage backend to perform atomic operations (transactions)
spanning multiple keys or checking versions.

`kvdex` provides a high-level API, but its `AtomicBuilder` has limitations
(e.g., 10 operation limit) that we bypass using raw `db.kv` access for certain
operations.

## Decision

We require the `db` (kvdex database) instance to be passed to the
`KvDexSessionStorage` constructor.

## Rationale

1. **Atomic Integrity**: To perform manual atomic checks and sets that bypass
   `kvdex` high-level limits while remaining consistent with the `kvdex` schema,
   we need access to the underlying `kv` instance and the ability to validate
   that the collection belongs to the database.
2. **Fail-Fast Configuration**: Proactively validating that the `collection`
   belongs to the `db` at construction prevents runtime "silent failures" where
   updates might happen but indices aren't maintained correctly because they
   belong to different `kv` instances.
3. **Future Proofing**: As we add features like session introspection (searching
   by user ID), having the database context allows us to safely interact with
   other collections or indices if needed.

## Consequences

- Developers must pass both the `collection` and the `db` instance.
- Increased type safety and configuration reliability.
- Enables the Write-Ahead Log (WAL) implementation for index recovery.
