# M0 engineering-outcome baseline collection protocol

**Status:** collection protocol prepared; **no real product/user trial measurements are recorded in this document**. Do not treat fixture tests, CI durations, browser timings, or illustrative values as engineering productivity evidence.

## Objective

Measure whether the bounded pump hydraulic/shaft-power workflow reaches an accepted, traceable result with less elapsed time or engineer effort than the current process. Report descriptive observations, not causal claims.

## Task and acceptance contract

Use the same predeclared pump-power cases in both cohorts. Each case must have the same input values, units, known assumptions, and independently reviewed reference result.

A task is **accepted** only when:
1. Input/unit validation succeeds and assumptions are visible.
2. The deterministic result agrees with the independently reviewed reference within a tolerance set before the trial.
3. The application has persisted the result and its revision-bound evidence/provenance, where the workspace cohort is used.
4. The reviewer has explicitly recorded acceptance or rejection.

A successful HTTP response, rendered result, or `VALIDATED` state alone is not acceptance or engineering approval.

## Trial design

- **Cohorts:** `baseline` = current/manual process; `workspace` = Engineering Workspace pump-power pilot.
- **Pair tasks:** run identical cases in both cohorts; alternate order where practical to reduce order/learning effects.
- **Initial feasibility:** 5 matched pairs. Target at least 10 matched pairs before comparing medians; small samples remain descriptive and are not statistical proof.
- **Environment:** use a dedicated non-production app/database and disposable test project/account. Never run acceptance automation against production or copy trial data into production.
- **Timing:** record `startedAt` when work on the case begins and `acceptedAt` only when acceptance criteria are met. If not accepted, `acceptedAt` must be `null`.
- **Active engineer time:** record only observed hands-on input, review, correction and troubleshooting minutes. Do not count unattended compute/wait time as active effort.
- **Retries/recovery:** count actual failed attempts. Record recovery as `true` or `false` only when observed; otherwise `null`.
- **Evidence:** mark complete only after checking the result, revision lineage, digest/provenance and required validation receipt. Otherwise record `false` or `null` if not observed.
- **Cost:** capture actual compute, provider/API, infrastructure and license components in one currency. Use `null` for any unknown component; never substitute zero for unknown. The helper intentionally withholds cost-per-accepted-outcome when components are incomplete.
- **Follow-up:** record repeat use within seven days only after that window has elapsed; otherwise use `null`.

## Record format

Store anonymized records in a private trial workspace, not in committed source files. Use a pseudonymous `taskRef` such as `pump-case-001-baseline`; never use names, emails, customer data, credentials or other identifying details.

Each record uses these fields, matching `scripts/outcome-baseline.mjs`:

| Field | Meaning |
|---|---|
| `taskRef` | Non-identifying task reference |
| `cohort` | `baseline` or `workspace` |
| `accepted` | Whether all predeclared acceptance criteria passed |
| `startedAt`, `acceptedAt` | Observed ISO timestamps; `acceptedAt` is null if not accepted |
| `engineerActiveMinutes` | Observed hands-on minutes, or null if not measured |
| `cost` | Currency plus `compute`, `provider`, `infrastructure`, `license`; unknown components are null, or the whole cost is null |
| `failedAttempts` | Observed non-negative integer |
| `recoveredAfterFailure` | true/false if applicable and observed; otherwise null |
| `repeatUseWithin7Days` | true/false after the observation window; otherwise null |
| `validationRequired` | Whether independent validation is required for this task |
| `evidenceComplete` | true/false after review; null if not observed |

Run the summary against the anonymized JSON file with:

```sh
node scripts/outcome-baseline.mjs /path/to/anonymized-task-records.json
```

The helper validates records and reports acceptance rate, time to accepted result, active engineer time, evidence coverage, failure recovery, repeat-use coverage and observed cost coverage. Keep its output with the trial's method/version and acceptance criteria. Do not commit raw task-level records unless they have been reviewed for privacy and approved for repository storage.

## Reporting rules

- Report baseline and workspace cohorts separately, including task counts and measurement coverage.
- Report medians and observed counts; do not hide rejected or incomplete tasks.
- Cost per accepted outcome is reportable only when all accepted-task cost components are observed in the same currency.
- Label missing measurements **NOT MEASURED**, not zero.
- Do not claim time saved, ROI, causal productivity improvement, broad engineering correctness, or engineering approval from this pilot alone.
- Preserve failed trials and deviations in the notes; do not silently discard them.

## M0 closure status

The codebase has fixture-based tests for the summary helper, but fixture values are not real trial observations. M0 remains open until the responsive-auth/workspace acceptance gates and a real, documented baseline trial are complete, or the milestone decision explicitly records why a required gate is blocked.