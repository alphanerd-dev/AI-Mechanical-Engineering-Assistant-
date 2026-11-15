import type { FEABenchmarkReference, FEACantileverBoxBenchmarkRequest, FEAStaticStructuralResult } from "./types.js";
import { finiteNonNegative, finitePositive, isRecord } from "./benchmark-shared.js";

const REFERENCE_ID = "cantilever-box-euler-bernoulli-plus-timoshenko-v1";
const AXES = ["x", "y", "z"] as const;
function hasReferenceId(value: Record<string, unknown>): boolean {
  return value.referenceId === REFERENCE_ID;
}
function hasReferenceUnits(value: Record<string, unknown>): boolean {
  if (!isRecord(value.units)) return false;
  const units = value.units;
  return units.length === "mm" && units.force === "N" &&
    units.modulus === "MPa" && units.deflection === "mm";
}
function hasDisplacementMetrics(value: Record<string, unknown>): boolean {
  return finitePositive(value.sectionSecondMomentMm4) &&
    finitePositive(value.expectedTipDeflectionMm) &&
    finiteNonNegative(value.measuredMaximumDisplacementMm) &&
    finiteNonNegative(value.bendingDeflectionMm) &&
    finiteNonNegative(value.firstOrderShearDeflectionMm) &&
    finiteNonNegative(value.displacementRelativeError) &&
    finitePositive(value.displacementRelativeTolerance) &&
    value.displacementRelativeTolerance <= 0.3;
}
function hasReactionVectors(value: Record<string, unknown>): boolean {
  if (!isRecord(value.expectedSupportReactionN) || !isRecord(value.measuredSupportReactionN)) return false;
  return AXES.every(axis =>
    finiteNonNegative(value.expectedSupportReactionN[axis]) &&
    typeof value.measuredSupportReactionN[axis] === "number" &&
    Number.isFinite(value.measuredSupportReactionN[axis])
  );
}
function hasReactionMetrics(value: Record<string, unknown>): boolean {
  return finiteNonNegative(value.reactionRelativeError) &&
    finitePositive(value.reactionRelativeTolerance) &&
    value.reactionRelativeTolerance <= 0.01 &&
    hasReactionVectors(value);
}
export function isValidFEABenchmarkReference(reference: unknown): reference is FEABenchmarkReference {
  if (!isRecord(reference)) return false;
  return hasReferenceId(reference) &&
    hasReferenceUnits(reference) &&
    hasDisplacementMetrics(reference) &&
    hasReactionMetrics(reference) &&
    reference.displacementPassed === true &&
    reference.reactionPassed === true &&
    reference.passed === true;
}
function calculateCantileverReference(request: FEACantileverBoxBenchmarkRequest) {
  const { length, width, height } = request.dimensionsMm;
  const { youngsModulusMpa, poissonRatio } = request.material;
  const force = request.totalForceN;
  const inertia = height * Math.pow(width, 3) / 12;
  const area = width * height;
  const shearModulus = youngsModulusMpa / (2 * (1 + poissonRatio));
  const bending = force * Math.pow(length, 3) / (3 * youngsModulusMpa * inertia);
  const shear = 6 * force * length / (5 * shearModulus * area);
  return { force, inertia, bending, shear, total: bending + shear };
}
function compareScalar(actual: number, expected: number, relativeTolerance: number): boolean {
  return Math.abs(actual - expected) <= Math.max(1e-12, Math.abs(expected) * relativeTolerance);
}
function validateAnalyticalTerms(reference: FEABenchmarkReference, expected: ReturnType<typeof calculateCantileverReference>): string[] {
  const errors: string[] = [];
  if (!compareScalar(reference.sectionSecondMomentMm4, expected.inertia, 1e-9)) errors.push("Section second moment does not match the independent reference calculation.");
  if (!compareScalar(reference.bendingDeflectionMm, expected.bending, 1e-9)) errors.push("Bending deflection does not match the independent reference calculation.");
  if (!compareScalar(reference.firstOrderShearDeflectionMm, expected.shear, 1e-9)) errors.push("Shear deflection does not match the independent reference calculation.");
  if (!compareScalar(reference.expectedTipDeflectionMm, expected.total, 1e-9)) errors.push("Expected tip deflection does not match the independent reference calculation.");
  return errors;
}
function validateExpectedReaction(reference: FEABenchmarkReference, force: number): string[] {
  const reaction = reference.expectedSupportReactionN;
  const passed = Math.abs(reaction.x) <= 1e-9 &&
    Math.abs(reaction.y - force) <= Math.max(1e-9, force * 1e-9) &&
    Math.abs(reaction.z) <= 1e-9;
  return passed ? [] : ["Expected support reaction does not match the applied benchmark load."];
}
function validateSolverMeasurements(result: FEAStaticStructuralResult, reference: FEABenchmarkReference, expected: ReturnType<typeof calculateCantileverReference>): string[] {
  const errors: string[] = [];
  if (!finiteNonNegative(result.maxDisplacementMm) ||
      !compareScalar(reference.measuredMaximumDisplacementMm, result.maxDisplacementMm, 1e-9)) {
    errors.push("Benchmark displacement does not match the normalized solver result.");
  }
  const actual = result.reactionForcesN;
  const measured = reference.measuredSupportReactionN;
  if (!actual || AXES.some(axis => !compareScalar(actual[axis], measured[axis], 0) )) {
    errors.push("Benchmark support reaction does not match the normalized solver result.");
  }
  const displacementError = Math.abs(reference.measuredMaximumDisplacementMm - expected.total) / expected.total;
  const reactionError = Math.hypot(measured.x, measured.y - expected.force, measured.z) / expected.force;
  if (!compareScalar(reference.displacementRelativeError, displacementError, 1e-9)) errors.push("Displacement relative error is inconsistent.");
  if (!compareScalar(reference.reactionRelativeError, reactionError, 1e-9)) errors.push("Reaction relative error is inconsistent.");
  if (displacementError > reference.displacementRelativeTolerance) errors.push("Independent displacement acceptance failed.");
  if (reactionError > reference.reactionRelativeTolerance) errors.push("Independent reaction equilibrium acceptance failed.");
  return errors;
}
export function validateFEABenchmarkReference(
  request: FEACantileverBoxBenchmarkRequest,
  result: FEAStaticStructuralResult,
  reference: FEABenchmarkReference
): string[] {
  const expected = calculateCantileverReference(request);
  return [
    ...validateAnalyticalTerms(reference, expected),
    ...validateExpectedReaction(reference, expected.force),
    ...validateSolverMeasurements(result, reference, expected)
  ];
}
