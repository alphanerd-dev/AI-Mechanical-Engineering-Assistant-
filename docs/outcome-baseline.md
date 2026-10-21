# Measuring the first accepted engineering outcome

Use the outcome-baseline CLI with an anonymized JSON array of task trials. The calculator is deliberately offline: it does not upload data, introduce a second analytics service, infer missing values, or claim causal improvements.

## Run

    node scripts/outcome-baseline.mjs ./private-local-trials.json

Keep the input file outside the repository and do not commit it. Use pseudonymous task references only; no email addresses, names, credentials, CAD content or customer identifiers.

Each record includes:

- taskRef and cohort (baseline or workspace);
- startedAt, acceptedAt (null when not accepted), engineerActiveMinutes (null when unmeasured);
- accepted, validationRequired and evidenceComplete (null when evidence measurement is missing);
- failedAttempts and recoveredAfterFailure;
- repeatUseWithin7Days; and
- cost, either null or an explicit currency plus compute/provider/infrastructure/license cost components. Every component must be present; use null when a component is unknown.

Example record shape (illustrative values only):

    [
      {
        "taskRef": "trial-001",
        "cohort": "workspace",
        "startedAt": "2026-10-20T10:00:00Z",
        "acceptedAt": "2026-10-20T10:18:00Z",
        "engineerActiveMinutes": 7,
        "accepted": true,
        "validationRequired": true,
        "evidenceComplete": true,
        "failedAttempts": 0,
        "recoveredAfterFailure": null,
        "repeatUseWithin7Days": null,
        "cost": {
          "currency": "USD",
          "compute": 0.02,
          "provider": 0,
          "infrastructure": null,
          "license": null
        }
      }
    ]

## Interpretation

- Compare representative tasks with identical acceptance criteria and keep baseline and workspace cohorts visible separately.
- Time-to-acceptance is measured only when both timestamps exist and the task reached acceptance.
- Cost per accepted outcome is shown only when all accepted trials have complete component costs in one currency. Unknown infrastructure/license/provider costs are not guessed.
- Validation/evidence completeness, recovery after failure and repeat use each include their own measurement coverage. Do not treat unobserved values as failures or successes.
- The output is descriptive. It does not prove that the workspace caused a productivity improvement. Repeat the study across representative engineering tasks and review differences in task difficulty and operator experience before making product claims.
