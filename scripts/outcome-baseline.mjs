#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const COST_COMPONENTS = ["compute", "provider", "infrastructure", "license"];

function fail(message) {
  throw new TypeError(message);
}

function finiteNonNegative(value, label, nullable = true) {
  if (nullable && value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(label + " must be a finite non-negative number" + (nullable ? " or null." : "."));
  }
}

function parseTimestamp(value, label, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !value.trim()) fail(label + " must be an ISO timestamp" + (nullable ? " or null." : "."));
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail(label + " must be a valid ISO timestamp.");
  return parsed;
}

function validateCost(cost, index) {
  if (cost === null) return null;
  if (!cost || typeof cost !== "object" || Array.isArray(cost)) fail("tasks[" + index + "].cost must be an object or null.");
  if (typeof cost.currency !== "string" || !/^[A-Z]{3}$/.test(cost.currency)) fail("tasks[" + index + "].cost.currency must be a three-letter uppercase currency code.");
  for (const component of COST_COMPONENTS) {
    if (!(component in cost)) fail("tasks[" + index + "].cost." + component + " must be present; use null when unmeasured.");
    finiteNonNegative(cost[component], "tasks[" + index + "].cost." + component);
  }
  return {
    currency: cost.currency,
    components: Object.fromEntries(COST_COMPONENTS.map((component) => [component, cost[component]])),
    complete: COST_COMPONENTS.every((component) => cost[component] !== null),
    total: COST_COMPONENTS.every((component) => cost[component] !== null)
      ? COST_COMPONENTS.reduce((total, component) => total + cost[component], 0)
      : null,
  };
}

function validateTask(row, index) {
  if (!row || typeof row !== "object" || Array.isArray(row)) fail("tasks[" + index + "] must be an object.");
  if (typeof row.taskRef !== "string" || !row.taskRef.trim() || row.taskRef.length > 120 || row.taskRef.includes("@")) {
    fail("tasks[" + index + "].taskRef must be a non-identifying reference (do not use names or emails).");
  }
  if (!["baseline", "workspace"].includes(row.cohort)) fail("tasks[" + index + "].cohort must be baseline or workspace.");
  if (typeof row.accepted !== "boolean") fail("tasks[" + index + "].accepted must be a boolean.");
  const startedAt = parseTimestamp(row.startedAt, "tasks[" + index + "].startedAt");
  const acceptedAt = parseTimestamp(row.acceptedAt ?? null, "tasks[" + index + "].acceptedAt", true);
  if (row.accepted && acceptedAt === null) fail("Accepted tasks require acceptedAt; do not infer it.");
  if (!row.accepted && acceptedAt !== null) fail("Non-accepted tasks must use acceptedAt: null.");
  if (acceptedAt !== null && acceptedAt < startedAt) fail("tasks[" + index + "] acceptedAt must not precede startedAt.");

  finiteNonNegative(row.engineerActiveMinutes, "tasks[" + index + "].engineerActiveMinutes");
  if (!Number.isSafeInteger(row.failedAttempts) || row.failedAttempts < 0) fail("tasks[" + index + "].failedAttempts must be a non-negative integer.");
  if (![true, false, null].includes(row.recoveredAfterFailure ?? null)) fail("tasks[" + index + "].recoveredAfterFailure must be boolean or null.");
  if (![true, false, null].includes(row.repeatUseWithin7Days ?? null)) fail("tasks[" + index + "].repeatUseWithin7Days must be boolean or null.");
  if (typeof row.validationRequired !== "boolean") fail("tasks[" + index + "].validationRequired must be a boolean.");
  const evidenceComplete = row.evidenceComplete ?? null;
  if (![true, false, null].includes(evidenceComplete)) fail("tasks[" + index + "].evidenceComplete must be boolean or null.");
  if (row.validationRequired && row.accepted && evidenceComplete === null) {
    // Preserve the row, but leave evidence completeness explicitly unmeasured.
  }
  return {
    taskRef: row.taskRef,
    cohort: row.cohort,
    accepted: row.accepted,
    startedAt,
    acceptedAt,
    timeToAcceptedMinutes: acceptedAt === null ? null : (acceptedAt - startedAt) / 60_000,
    engineerActiveMinutes: row.engineerActiveMinutes,
    cost: validateCost(row.cost ?? null, index),
    failedAttempts: row.failedAttempts,
    recoveredAfterFailure: row.recoveredAfterFailure ?? null,
    repeatUseWithin7Days: row.repeatUseWithin7Days ?? null,
    validationRequired: row.validationRequired,
    evidenceComplete,
  };
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function rate(successes, observed) {
  return observed.length ? successes / observed.length : null;
}

export function summarizeOutcomeBaseline(input) {
  if (!Array.isArray(input) || input.length === 0) fail("Input must be a non-empty JSON array of task records.");
  const tasks = input.map(validateTask);
  const accepted = tasks.filter((task) => task.accepted);
  const times = accepted.map((task) => task.timeToAcceptedMinutes).filter((value) => value !== null);
  const engineerMinutes = tasks.map((task) => task.engineerActiveMinutes).filter((value) => value !== null);
  const knownCosts = accepted.map((task) => task.cost);
  const completeCosts = knownCosts.filter((cost) => cost?.complete);
  const sameCurrency = completeCosts.length === knownCosts.length && completeCosts.length > 0 &&
    completeCosts.every((cost) => cost.currency === completeCosts[0].currency);
  const currencyMixed = completeCosts.length > 1 &&
    completeCosts.some((cost) => cost.currency !== completeCosts[0].currency);
  const requiredValidation = accepted.filter((task) => task.validationRequired);
  const observedEvidence = requiredValidation.filter((task) => task.evidenceComplete !== null);
  const failedTasks = tasks.filter((task) => task.failedAttempts > 0);
  const observedRecovery = failedTasks.filter((task) => task.recoveredAfterFailure !== null);
  const observedRepeat = tasks.filter((task) => task.repeatUseWithin7Days !== null);

  const groups = {};
  for (const cohort of ["baseline", "workspace"]) {
    const rows = tasks.filter((task) => task.cohort === cohort);
    const rowsAccepted = rows.filter((task) => task.accepted);
    const rowsTimes = rowsAccepted.map((task) => task.timeToAcceptedMinutes).filter((value) => value !== null);
    const rowsMinutes = rows.map((task) => task.engineerActiveMinutes).filter((value) => value !== null);
    groups[cohort] = {
      taskCount: rows.length,
      acceptedCount: rowsAccepted.length,
      acceptanceRate: rows.length ? rowsAccepted.length / rows.length : null,
      timeToAcceptedResultMinutes: { median: median(rowsTimes), mean: mean(rowsTimes), observedCount: rowsTimes.length },
      activeEngineerMinutes: { median: median(rowsMinutes), mean: mean(rowsMinutes), observedCount: rowsMinutes.length },
    };
  }

  return {
    method: "OUTCOME_BASELINE_V1",
    taskCount: tasks.length,
    acceptedCount: accepted.length,
    acceptanceRate: accepted.length / tasks.length,
    cohorts: groups,
    timeToAcceptedResultMinutes: {
      median: median(times),
      mean: mean(times),
      observedAcceptedCount: times.length,
      acceptedCountWithoutTime: accepted.length - times.length,
    },
    activeEngineerMinutes: {
      median: median(engineerMinutes),
      mean: mean(engineerMinutes),
      observedCount: engineerMinutes.length,
      unmeasuredCount: tasks.length - engineerMinutes.length,
    },
    observedCost: {
      currency: sameCurrency ? completeCosts[0].currency : null,
      costPerAcceptedOutcome: sameCurrency ? completeCosts.reduce((sum, cost) => sum + cost.total, 0) / accepted.length : null,
      fullyObservedAcceptedCostCount: completeCosts.length,
      acceptedCostCoverage: accepted.length ? completeCosts.length / accepted.length : null,
      status: sameCurrency ? "MEASURED" : currencyMixed ? "NOT_AGGREGATED_MIXED_CURRENCY" : "INCOMPLETE_COST_COMPONENTS",
      note: "Only explicitly observed compute/provider/infrastructure/license cost is included. Unknown components are never estimated.",
    },
    applicableValidationEvidence: {
      requiredAcceptedCount: requiredValidation.length,
      observedCount: observedEvidence.length,
      measurementCoverage: requiredValidation.length ? observedEvidence.length / requiredValidation.length : null,
      completeRateAmongObserved: observedEvidence.length
        ? observedEvidence.filter((task) => task.evidenceComplete === true).length / observedEvidence.length
        : null,
    },
    recoveryAfterFailure: {
      failedTaskCount: failedTasks.length,
      observedCount: observedRecovery.length,
      measurementCoverage: failedTasks.length ? observedRecovery.length / failedTasks.length : null,
      recoveryRateAmongObserved: rate(observedRecovery.filter((task) => task.recoveredAfterFailure === true).length, observedRecovery),
    },
    repeatUseWithin7Days: {
      observedCount: observedRepeat.length,
      measurementCoverage: tasks.length ? observedRepeat.length / tasks.length : null,
      repeatRateAmongObserved: rate(observedRepeat.filter((task) => task.repeatUseWithin7Days === true).length, observedRepeat),
    },
    caveats: [
      "This is a descriptive baseline, not proof of causal productivity improvement.",
      "Compare representative tasks with the same acceptance criteria and report baseline/workspace cohorts separately.",
      "Do not mix currencies. Unobserved cost, engineer time, outcome or evidence fields stay unmeasured.",
      "Use pseudonymous task references only; do not store credentials, customer data or personal identifiers in the input file.",
    ],
  };
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath || process.argv.length !== 3) {
    process.stderr.write("Usage: node scripts/outcome-baseline.mjs <anonymized-task-records.json>\n");
    process.exitCode = 2;
    return;
  }
  try {
    const data = JSON.parse(await readFile(resolve(inputPath), "utf8"));
    process.stdout.write(JSON.stringify(summarizeOutcomeBaseline(data), null, 2) + "\n");
  } catch (error) {
    process.stderr.write("Outcome baseline failed: " + (error instanceof Error ? error.message : "invalid input") + "\n");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
