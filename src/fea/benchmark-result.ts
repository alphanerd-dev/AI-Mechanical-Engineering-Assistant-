import type {
  FEACantileverBoxBenchmarkRequest, FEABenchmarkReference, FEAStaticStructuralResult
} from "./types.js";
import { validateFEAExecution, type FEAExecutionValidation, type FEAValidationCheck } from "./validation.js";
import { isRecord } from "./benchmark-shared.js";
import { isValidFEABenchmarkReference, validateFEABenchmarkReference } from "./benchmark-reference.js";
import { validateFEAArtifactManifest } from "./benchmark-artifacts.js";

function check(name: string, pass: boolean, message: string): FEAValidationCheck {
  return { name, pass, message };
}
function isValidMeshShape(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.nodeCount === "number" && typeof value.elementCount === "number" &&
    typeof value.elementType === "string";
}
function isValidStaticResultShape(value: unknown): value is FEAStaticStructuralResult {
  if (!isRecord(value)) return false;
  if (value.analysis !== "STATIC_STRUCTURAL" || typeof value.solver !== "string") return false;
  if (typeof value.solverVersion !== "string" || typeof value.converged !== "boolean") return false;
  if (typeof value.exitCode !== "number" || typeof value.success !== "boolean") return false;
  if (!isValidMeshShape(value.mesh) || !Array.isArray(value.artifacts) || !Array.isArray(value.warnings)) return false;
  return value.warnings.every(warning => typeof warning === "string");
}
function validateSolverIdentity(result: FEAStaticStructuralResult): string[] {
  const valid = result.solver === "calculix" && result.solverVersion.length > 0 &&
    result.mesh.elementType === "C3D4";
  return valid ? [] : ["The result does not match the supported CalculiX/C3D4 contract."];
}
function evaluateReference(request: FEACantileverBoxBenchmarkRequest, result: FEAStaticStructuralResult) {
  const reference = result.benchmarkReference;
  const valid = isValidFEABenchmarkReference(reference);
  if (!valid) return {
    reference,
    errors: ["The independent cantilever analytical reference is missing or failed."]
  };
  return {
    reference,
    errors: validateFEABenchmarkReference(request, result, reference as FEABenchmarkReference)
  };
}
function appendReferenceChecks(
  reference: unknown,
  errors: string[],
  checks: FEAValidationCheck[],
  blockingReasons: string[]
): void {
  const valid = isValidFEABenchmarkReference(reference);
  const shapeMessage = valid
    ? "The independent cantilever analytical reference passed."
    : "The independent cantilever analytical reference is missing or failed.";
  checks.push(check("analytical_benchmark_reference", valid, shapeMessage));
  if (!valid) blockingReasons.push(...errors);
  if (valid) {
    const passed = errors.length === 0;
    checks.push(check(
      "independent_reference_recalculation",
      passed,
      passed
        ? "The host independently reproduced the analytical reference and equilibrium checks."
        : errors.join(" ")
    ));
    blockingReasons.push(...errors);
  }
}
function appendArtifactChecks(
  result: FEAStaticStructuralResult,
  checks: FEAValidationCheck[],
  blockingReasons: string[]
): void {
  const errors = validateFEAArtifactManifest(result);
  const passed = errors.length === 0;
  checks.push(check(
    "solver_artifact_manifest",
    passed,
    passed ? "The solver returned a complete hashed artifact manifest." : errors.join(" ")
  ));
  blockingReasons.push(...errors);
}
export function validateFEACantileverBoxResult(
  request: FEACantileverBoxBenchmarkRequest,
  candidate: unknown
): FEAExecutionValidation {
  if (!isValidStaticResultShape(candidate)) {
    const message = "The CalculiX worker result does not match the normalized static-structural contract.";
    return { status: "FAIL", checks: [check("normalized_result_shape", false, message)], blockingReasons: [message], warnings: [] };
  }
  const result = candidate;
  const base = validateFEAExecution(result, ["DISPLACEMENT", "STRESS", "REACTION_FORCE"]);
  const checks = [...base.checks];
  const blockingReasons = [...base.blockingReasons];
  const solverErrors = validateSolverIdentity(result);
  checks.push(check("pinned_solver_contract", solverErrors.length === 0,
    solverErrors.length ? solverErrors.join(" ") : "The result identifies the supported CalculiX/C3D4 contract."));
  blockingReasons.push(...solverErrors);
  const evaluated = evaluateReference(request, result);
  appendReferenceChecks(evaluated.reference, evaluated.errors, checks, blockingReasons);
  appendArtifactChecks(result, checks, blockingReasons);
  const success = result.success === true;
  checks.push(check("worker_success", success,
    success ? "The isolated worker accepted the benchmark." : "The isolated worker reported benchmark failure."));
  if (!success) blockingReasons.push("The isolated worker did not accept the benchmark.");
  return {
    status: blockingReasons.length ? "FAIL" : "PASS",
    checks,
    blockingReasons: [...new Set(blockingReasons)],
    warnings: base.warnings
  };
}
