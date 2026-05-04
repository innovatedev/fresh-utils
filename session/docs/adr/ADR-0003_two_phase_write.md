# ADR-0003: Two-Phase Write for Indexed KvDex Collections

## Context

Deno KV atomic operations have a hard limit of 10 operations. `kvdex`
collections with multiple indices can easily exceed this limit when updating a
single document, especially if using `AtomicBuilder`.

## Decision

We implement a two-phase write strategy with a Write-Ahead Log (WAL) for
`KvDexSessionStorage`:

1. **Phase 1 (Atomic)**: Update the primary document and write a WAL record in a
   single atomic transaction (2 operations).
2. **Phase 2 (Sequential)**: Update indices sequentially. If successful, delete
   the WAL record.

## Rationale

1. **Bypassing Limits**: This allows us to support any number of indices
   (primary and secondary) without hitting the 10-operation atomic limit.
2. **Consistency**: Read-after-write consistency for the primary document is
   guaranteed by Phase 1. Index consistency is "eventual" but guaranteed by WAL
   recovery.
3. **Resilience**: If the process crashes between Phase 1 and Phase 2, the WAL
   record remains. On the next server startup, the `syncWal()` process recovers
   the pending index updates.

## Consequences

- Indices may be slightly out of sync for a very short window (milliseconds).
- Requires a `walPrefix` in the KV store (defaulted).
- Significantly increases the reliability of session storage under high-index
  load.
