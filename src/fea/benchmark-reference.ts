import type { FEABenchmarkReference, FEACantileverBoxBenchmarkRequest, FEAStaticStructuralResult } from "./types.js";
import { finiteNonNegative, finitePositive, isRecord } from "./benchmark-shared.js";

const REFERENCE_ID = "cantilever-box-euler-bernoulli-plus-timoshenko-v2";
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
    value.displacementRelativeTolerance <= 0.1;
}
function hasReactionVectors(value: Record<string, unknown>): boolean {
  const expected = value.expectedSupportReactionN;
  const measured = value.measuredSupportReactionN;
  if (!isRecord(expected) || !isRecord(measured)) return false;
  return AXES.every(axis =>
    finiteNonNegative(expected[axis]) &&
    typeof measured[axis] === "number" &&
    Number.isFinite(measured[axis])
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
function validateDisplacementMeasurement(result: FEAStaticStructuralResult, reference: FEABenchmarkReference): string[] {
  const measuredDisplacement = result.maxDisplacementMm;
  if (!finiteNonNegative(measuredDisplacement)) {
    return ["Benchmark displacement does not match the normalized solver result."];
  }
  return compareScalar(reference.measuredMaximumDisplacementMm, measuredDisplacement, 1e-9)
    ? []
    : ["Benchmark displacement does not match the normalized solver result."];
}
function validateReactionMeasurement(result: FEAStaticStructuralResult, reference: FEABenchmarkReference): string[] {
  const actual = result.reactionForcesN;
  if (!actual) return ["Benchmark support reaction does not match the normalized solver result."];
  const matchesReference = AXES.every(axis => compareScalar(actual[axis], reference.measuredSupportReactionN[axis], 0));
  return matchesReference
    ? []
    : ["Benchmark support reaction does not match the normalized solver result."];
}
function calculateMeasuredRelativeErrors(reference: FEABenchmarkReference, expected: ReturnType<typeof calculateCantileverReference>) {
  const measured = reference.measuredSupportReactionN;
  return {
    displacement: Math.abs(reference.measuredMaximumDisplacementMm - expected.total) / expected.total,
    reaction: Math.hypot(measured.x, measured.y - expected.force, measured.z) / expected.force
  };
}
function validateRecordedDisplacementError(reference: FEABenchmarkReference, error: number): string[] {
  return compareScalar(reference.displacementRelativeError, error, 1e-9)
    ? []
    : ["Displacement relative error is inconsistent."];
}
function validateRecordedReactionError(reference: FEABenchmarkReference, error: number): string[] {
  return compareScalar(reference.reactionRelativeError, error, 1e-9)
    ? []
    : ["Reaction relative error is inconsistent."];
}
function validateDisplacementAcceptance(reference: FEABenchmarkReference, error: number): string[] {
  return error <= reference.displacementRelativeTolerance
    ? []
    : ["Independent displacement acceptance failed."];
}
function validateReactionAcceptance(reference: FEABenchmarkReference, error: number): string[] {
  return error <= reference.reactionRelativeTolerance
    ? []
    : ["Independent reaction equilibrium acceptance failed."];
}
function validateRelativeErrorMeasurements(reference: FEABenchmarkReference, expected: ReturnType<typeof calculateCantileverReference>): string[] {
  const errors = calculateMeasuredRelativeErrors(reference, expected);
  return [
    ...validateRecordedDisplacementError(reference, errors.displacement),
    ...validateRecordedReactionError(reference, errors.reaction),
    ...validateDisplacementAcceptance(reference, errors.displacement),
    ...validateReactionAcceptance(reference, errors.reaction)
  ];
}
function validateSolverMeasurements(result: FEAStaticStructuralResult, reference: FEABenchmarkReference, expected: ReturnType<typeof calculateCantileverReference>): string[] {
  return [
    ...validateDisplacementMeasurement(result, reference),
    ...validateReactionMeasurement(result, reference),
    ...validateRelativeErrorMeasurements(reference, expected)
  ];
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
