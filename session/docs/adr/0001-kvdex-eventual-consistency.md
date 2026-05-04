# Architecture Decision Record: Kvdex Eventual Consistency for Secondary Indices

## Context

We use `kvdex` as a storage backend for our `fresh-session` library. `kvdex`
provides typed collections and secondary indices, which are incredibly useful
for querying sessions (e.g., finding all sessions for a specific user, searching
by IP, sweeping expired sessions).

However, Deno KV enforces a strict limit of **10 atomic operations per
transaction**. When updating a document with secondary indices, `kvdex` needs to
delete the old index entries and write the new ones. The operation cost is:
`1 check (versionstamp) + 1 set (main document) + N deletes (old indices) + N sets (new indices) = 2 + 2N operations`

With just 5 secondary indices (e.g., `userId`, `createdAt`, `lastSeenAt`, `ua`,
`ip`), an update requires 12 operations, which immediately throws an error and
crashes the application under Deno KV limits.

Previously, we attempted to bypass kvdex's builder limitations and perform
manual primary and secondary index writes inside a single `kv.atomic()`
transaction. But even then, we were limited to an absolute maximum of 4
secondary indices (4 * 2 + 2 = 10 operations).

## Decision

We have decided to **split the session write into two separate operations**:

1. **Atomic Block (Strongly Consistent):** We perform a `kv.atomic()` block
   containing exactly 2 `set` operations and a `check`:
   - A versionstamp `check` to enforce optimistic concurrency control.
   - A `set` operation for the primary `__id__` session document.
   - A `set` operation for a Write-Ahead Log (WAL) tracking record containing
     the document changes.
2. **Best-Effort Indexing (Eventually Consistent):** Upon a successful commit of
   the primary document, we perform manual `kv.delete()` and `kv.set()`
   operations to update the secondary and primary indices sequentially. We do
   NOT perform these in the main atomic transaction because the user may define
   more than 10 indexed fields. We `await` these index updates inside `set()` to
   ensure read-after-write consistency before the response is sent. However, if
   this step fails, the `set()` operation throws, and the WAL ensures recovery
   on startup. Once the indices are successfully updated, we delete the WAL
   tracking record.

## Tradeoffs

**Pros:**

- Complete removal of the Deno KV 10-operation atomic limit for session models.
  Developers can have as many secondary indices as they need.
- Improved resilience: Startup validation no longer needs to aggressively count
  indices and crash the app if the user defines more than 4 indices.
- The critical path (session auth against the `__id__` record) remains strictly
  atomic, strongly consistent, and safe against race conditions.

**Cons:**

- **Index Lag:** Secondary indices are now eventually consistent. While
  typically only a few milliseconds behind, admin queries (e.g.,
  `find all sessions for userId X`) might miss recent sessions or return ghost
  entries.

## Crash Recovery (Write-Ahead Log)

To solve the "Crash Window" vulnerability (where a process crash after the
atomic commit but before the index update completes leaves indices stale), we
implemented a lightweight Write-Ahead Log (WAL).

By atomically committing a tracking record alongside the primary document, we
guarantee the intent to update indices is recorded. If a crash occurs, the
tracking record remains in KV. Upon startup, the `KvDexSessionStorage`
constructor spawns a background task to scan for orphaned WAL records and
complete their pending index updates, ensuring eventual consistency is always
reached.

## Rationale

For session management, the primary lookups happen via the `sessionId` string
stored in the user's secure cookie. The session logic relies heavily on the
strongly consistent `__id__` records, while the secondary indices are only used
for administrative tasks, expiry sweeps, and external queries. A slight delay in
index consistency is a perfectly acceptable tradeoff for removing hard
scalability limits on the session model.

**Note to Future Contributors:** Do **NOT** attempt to "fix" this eventual
consistency by moving the secondary index writes back into the atomic
transaction block. Doing so will inevitably break the application once the
number of secondary indices grows beyond the hard limit of 4.
