# V2.0 — Engineering benchmark suite

The V2.0 benchmark suite is a deterministic cross-boundary conformance suite for the bounded autonomous engineering workspace.

It is deliberately not a performance benchmark and it does not claim engineering safety. Each case checks one architecture invariant and records a small set of metrics plus evidence describing what was verified.

## Cases

| Case | Boundary under test |
| --- | --- |
| v2-0-readiness-gate | Task readiness, dependencies, requirements |
| v2-0-bounded-execution | Agent proposal -> task graph -> deterministic execution |
| v2-0-hard-risk-ceiling | Bounded autonomy risk ceiling |
| v2-0-specialist-scope | Explicit specialist/domain authorization |
| v2-0-memory-fail-closed | VERIFIED evidence boundary |
| v2-0-authorization-deny | Role permissions and project scoping |
| v2-0-audit-integrity | Append-only audit hash-chain integrity |

## Running

Run the suite directly with:

    npm run benchmark

The command prints a structured JSON report. It exits non-zero when any case fails.

The same suite also runs under Vitest as a regression test.

## Evidence rules

A passing case must provide at least one evidence statement. The benchmark suite never converts a PASS into engineering approval or VERIFIED project state.

## Scope

This milestone adds the V2.0 benchmark suite. Performance benchmarking, solver accuracy benchmarks, cross-provider scorecards, real hardware cases, and durable benchmark-result storage belong to the later engineering benchmark system.
