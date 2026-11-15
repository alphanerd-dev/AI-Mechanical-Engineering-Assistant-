import type {
  FEABenchmarkReference,
  FEACantileverBoxBenchmarkRequest,
  FEAStaticStructuralResult
} from "./types.js";
import { validateFEAExecution, type FEAExecutionValidation, type FEAValidationCheck } from "./validation.js";

const SHA256 = /^[a-f0-9]{64}$/;
const MAX_ESTIMATED_ELEMENTS = 200_000;
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function check(name: string, pass: boolean, message: string): FEAValidationCheck {
  return { name, pass, message };
}
export function validateFEACantileverBoxRequest(value: unknown): string[] {
  if (!isRecord(value)) return ["FEA benchmark inputs must be an object."];
  const errors: string[] = [];
  if (value.analysis !== "STATIC_STRUCTURAL") errors.push("Only STATIC_STRUCTURAL analysis is supported.");
  if (value.benchmark !== "cantilever_box") errors.push("Only the cantilever_box reference benchmark is supported.");
  const dimensions = isRecord(value.dimensionsMm) ? value.dimensionsMm : {};
  const material = isRecord(value.material) ? value.material : {};
  const length = dimensions.length;
  const width = dimensions.width;
  const height = dimensions.height;
  if (!finitePositive(length) || length < 10 || length > 2000) errors.push("length must be between 10 and 2000 mm.");
  if (!finitePositive(width) || width < 1 || width > 500) errors.push("width must be between 1 and 500 mm.");
  if (!finitePositive(height) || height < 1 || height > 500) errors.push("height must be between 1 and 500 mm.");
  if (finitePositive(length) && finitePositive(width) && finitePositive(height) && length < 5 * Math.max(width, height)) {
    errors.push("Cantilever benchmark length must be at least five times its largest cross-section dimension.");
  }
  if (!finitePositive(material.youngsModulusMpa) || material.youngsModulusMpa > 1e9) {
    errors.push("Young's modulus must be between 1 and 1e9 MPa.");
  }
  if (typeof material.poissonRatio !== "number" || !Number.isFinite(material.poissonRatio) ||
      material.poissonRatio <= -1 || material.poissonRatio >= 0.5) {
    errors.push("Poisson ratio must be finite and between -1 and 0.5.");
  }
  if (!finitePositive(value.totalForceN) || value.totalForceN > 1e9) errors.push("totalForceN must be between 0 and 1e9 N.");
  if (!finitePositive(value.elementSizeMm) || value.elementSizeMm < 1 || value.elementSizeMm > 100) {
    errors.push("elementSizeMm must be between 1 and 100 mm.");
  }
  if (finitePositive(length) && finitePositive(width) && finitePositive(height) && finitePositive(value.elementSizeMm)) {
    const estimatedElements = Math.ceil(length / value.elementSizeMm) *
      Math.ceil(width / value.elementSizeMm) * Math.ceil(height / value.elementSizeMm) * 6;
    if (!Number.isSafeInteger(estimatedElements) || estimatedElements > MAX_ESTIMATED_ELEMENTS) {
      errors.push("Estimated tetrahedral mesh exceeds the 200000-element worker limit.");
    }
  }
  return errors;
}
function validReference(reference: unknown): reference is FEABenchmarkReference {
  if (!isRecord(reference)) return false;
  if (reference.referenceId !== "cantilever-box-euler-bernoulli-plus-timoshenko-v1") return false;
  if (!isRecord(reference.units)) return false;
  if (reference.units.length !== "mm" || reference.units.force !== "N" ||
      reference.units.modulus !== "MPa" || reference.units.deflection !== "mm") return false;
  if (!finitePositive(reference.sectionSecondMomentMm4)) return false;
  if (!finitePositive(reference.expectedTipDeflectionMm)) return false;
  if (!finitePositive(reference.displacementRelativeTolerance) || reference.displacementRelativeTolerance > 0.3) return false;
  if (!finiteNonNegative(reference.displacementRelativeError)) return false;
  if (!finitePositive(reference.reactionRelativeTolerance) || reference.reactionRelativeTolerance > 0.01) return false;
  if (!finiteNonNegative(reference.reactionRelativeError)) return false;
  if (!isRecord(reference.expectedSupportReactionN) || !isRecord(reference.measuredSupportReactionN)) return false;
  for (const axis of ["x", "y", "z"]) {
    if (!finiteNonNegative(reference.expectedSupportReactionN[axis])) return false;
    if (typeof reference.measuredSupportReactionN[axis] !== "number" ||
        !Number.isFinite(reference.measuredSupportReactionN[axis])) return false;
  }
  if (!finiteNonNegative(reference.measuredMaximumDisplacementMm)) return false;
  if (!finiteNonNegative(reference.bendingDeflectionMm)) return false;
  if (!finiteNonNegative(reference.firstOrderShearDeflectionMm)) return false;
  return reference.displacementPassed === true && reference.reactionPassed === true && reference.passed === true;
}
function validateReferenceAgainstIndependentCalculation(
  request: FEACantileverBoxBenchmarkRequest,
  result: FEAStaticStructuralResult,
  reference: FEABenchmarkReference
): string[] {
  const { length, width, height } = request.dimensionsMm;
  const modulus = request.material.youngsModulusMpa;
  const poisson = request.material.poissonRatio;
  const force = request.totalForceN;
  const inertia = height * Math.pow(width, 3) / 12;
  const area = width * height;
  const shearModulus = modulus / (2 * (1 + poisson));
  const bending = force * Math.pow(length, 3) / (3 * modulus * inertia);
  const shear = 6 * force * length / (5 * shearModulus * area);
  const expectedDeflection = bending + shear;
  const measuredReaction = reference.measuredSupportReactionN;
  const reactionError = Math.hypot(
    (measuredReaction.x as number),
    (measuredReaction.y as number) - force,
    (measuredReaction.z as number)
  ) / force;
  const expectedReaction = reference.expectedSupportReactionN;
  const displacementError = Math.abs(reference.measuredMaximumDisplacementMm - expectedDeflection) / expectedDeflection;
  const errors: string[] = [];
  if (Math.abs(reference.sectionSecondMomentMm4 - inertia) > inertia * 1e-9) errors.push("Section second moment does not match the independent reference calculation.");
  if (Math.abs(reference.bendingDeflectionMm - bending) > bending * 1e-9) errors.push("Bending deflection does not match the independent reference calculation.");
  if (Math.abs(reference.firstOrderShearDeflectionMm - shear) > shear * 1e-9) errors.push("Shear deflection does not match the independent reference calculation.");
  if (Math.abs(reference.expectedTipDeflectionMm - expectedDeflection) > expectedDeflection * 1e-9) errors.push("Expected tip deflection does not match the independent reference calculation.");
  if (Math.abs(expectedReaction.x as number) > 1e-9 ||
      Math.abs((expectedReaction.y as number) - force) > Math.max(1e-9, force * 1e-9) ||
      Math.abs(expectedReaction.z as number) > 1e-9) {
    errors.push("Expected support reaction does not match the applied benchmark load.");
  }
  if (!finiteNonNegative(result.maxDisplacementMm) ||
      Math.abs(reference.measuredMaximumDisplacementMm - result.maxDisplacementMm) > Math.max(1e-12, result.maxDisplacementMm * 1e-9)) {
    errors.push("Benchmark displacement does not match the normalized solver result.");
  }
  if (!result.reactionForcesN ||
      Math.abs(result.reactionForcesN.x - (measuredReaction.x as number)) > 1e-9 ||
      Math.abs(result.reactionForcesN.y - (measuredReaction.y as number)) > 1e-9 ||
      Math.abs(result.reactionForcesN.z - (measuredReaction.z as number)) > 1e-9) {
    errors.push("Benchmark support reaction does not match the normalized solver result.");
  }
  if (Math.abs(reference.displacementRelativeError - displacementError) > 1e-9) errors.push("Displacement relative error is inconsistent.");
  if (Math.abs(reference.reactionRelativeError - reactionError) > 1e-9) errors.push("Reaction relative error is inconsistent.");
  if (displacementError > reference.displacementRelativeTolerance) errors.push("Independent displacement acceptance failed.");
  if (reactionError > reference.reactionRelativeTolerance) errors.push("Independent reaction equilibrium acceptance failed.");
  return errors;
}
function validateArtifactManifest(result: FEAStaticStructuralResult): string[] {
  if (!Array.isArray(result.artifacts) || result.artifacts.length < 4) return ["The FEA worker did not return the complete solver artifact manifest."];
  const errors: string[] = [];
  const kinds = new Set<string>();
  for (const artifact of result.artifacts) {
    if (!isRecord(artifact)) { errors.push("An FEA artifact record is malformed."); continue; }
    if (artifact.kind !== "FEA_MODEL" && artifact.kind !== "FEA_RESULT") errors.push("An FEA artifact has an unsupported kind.");
    if (typeof artifact.path !== "string" || !artifact.path.trim() || artifact.path.startsWith("/") || artifact.path.split(/[\\/]/).includes("..")) {
      errors.push("An FEA artifact path is unsafe.");
    }
    if (typeof artifact.mediaType !== "string" || !artifact.mediaType.trim()) errors.push("An FEA artifact media type is missing.");
    if (typeof artifact.sha256 !== "string" || !SHA256.test(artifact.sha256)) errors.push("An FEA artifact SHA-256 digest is invalid.");
    if (typeof artifact.kind === "string") kinds.add(artifact.kind);
  }
  if (!kinds.has("FEA_MODEL")) errors.push("The FEA model artifact is missing.");
  if (!kinds.has("FEA_RESULT")) errors.push("The FEA result artifact is missing.");
  return errors;
}
export function validateFEACantileverBoxResult(
  request: FEACantileverBoxBenchmarkRequest,
  result: FEAStaticStructuralResult
): FEAExecutionValidation {
  const base = validateFEAExecution(result, ["DISPLACEMENT", "STRESS", "REACTION_FORCE"]);
  const checks = [...base.checks];
  const blockingReasons = [...base.blockingReasons];
  const solverValid = result.analysis === "STATIC_STRUCTURAL" && result.solver === "calculix" &&
    typeof result.solverVersion === "string" && result.solverVersion.length > 0 &&
    result.mesh.elementType === "C3D4";
  checks.push(check("pinned_solver_contract", solverValid,
    solverValid ? "The result identifies the supported CalculiX/C3D4 contract." : "The result does not match the supported CalculiX/C3D4 contract."));
  if (!solverValid) blockingReasons.push("The result does not match the supported CalculiX/C3D4 contract.");
  const reference = result.benchmarkReference;
  const referenceValid = validReference(reference);
  checks.push(check("analytical_benchmark_reference", referenceValid,
    referenceValid ? "The independent cantilever analytical reference passed." : "The independent cantilever analytical reference is missing or failed."));
  if (!referenceValid) blockingReasons.push("The independent cantilever analytical reference is missing or failed.");
  if (referenceValid) {
    const errors = validateReferenceAgainstIndependentCalculation(request, result, reference);
    checks.push(check("independent_reference_recalculation", errors.length === 0,
      errors.length === 0 ? "The host independently reproduced the analytical reference and equilibrium checks." : errors.join(" ")));
    blockingReasons.push(...errors);
  }
  const artifacts = validateArtifactManifest(result);
  checks.push(check("solver_artifact_manifest", artifacts.length === 0,
    artifacts.length === 0 ? "The solver returned a complete hashed artifact manifest." : artifacts.join(" ")));
  blockingReasons.push(...artifacts);
  const success = result.success === true;
  checks.push(check("worker_success", success, success ? "The isolated worker accepted the benchmark." : "The isolated worker reported benchmark failure."));
  if (!success) blockingReasons.push("The isolated worker did not accept the benchmark.");
  return {
    status: blockingReasons.length ? "FAIL" : "PASS",
    checks,
    blockingReasons: [...new Set(blockingReasons)],
    warnings: base.warnings
  };
}
