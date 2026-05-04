# Benchmarks

This directory contains the performance benchmark suite for
`@innovatedev/fresh-session`.

## Running Benchmarks

To run the current benchmarks:

```bash
DENO_NO_WORKSPACE=1 deno bench -A session/bench/store_bench.ts
```

## Comparing Results

The `results/` directory contains baseline JSON files for comparison. To compare
the current performance against a baseline, use a tool like `deno_bench_compare`
or similar, or simply inspect the JSON:

```bash
DENO_NO_WORKSPACE=1 deno bench -A --json session/bench/store_bench.ts > current.json
```

## Baseline v0.8.0

The baseline for version 0.8.0 was captured using an in-memory Deno KV instance.
See [v0.8.0_baseline.json](./results/v0.8.0_baseline.json).
