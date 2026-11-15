import type { FEACantileverBoxBenchmarkRequest } from "./types.js";

const MAX_ESTIMATED_ELEMENTS = 200_000;
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function inRange(value: unknown, minimum: number, maximum: number): value is number {
  return finitePositive(value) && value >= minimum && value <= maximum;
}
function validateBenchmarkIdentity(value: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (value.analysis !== "STATIC_STRUCTURAL") errors.push("Only STATIC_STRUCTURAL analysis is supported.");
  if (value.benchmark !== "cantilever_box") errors.push("Only the cantilever_box reference benchmark is supported.");
  return errors;
}
function readDimensions(value: Record<string, unknown>): Record<string, unknown> {
  return isRecord(value.dimensionsMm) ? value.dimensionsMm : {};
}
function validateLength(value: unknown): string[] {
  return inRange(value, 10, 2000) ? [] : ["length must be between 10 and 2000 mm."];
}
function validateWidth(value: unknown): string[] {
  return inRange(value, 1, 500) ? [] : ["width must be between 1 and 500 mm."];
}
function validateHeight(value: unknown): string[] {
  return inRange(value, 1, 500) ? [] : ["height must be between 1 and 500 mm."];
}
function validateSlenderness(dimensions: Record<string, unknown>): string[] {
  const { length, width, height } = dimensions;
  const dimensionsAreValid = [length, width, height].every(finitePositive);
  if (!dimensionsAreValid) return [];
  const maximumCrossSection = Math.max(width as number, height as number);
  const slendernessIsValid = (length as number) >= 5 * maximumCrossSection;
  return slendernessIsValid
    ? []
    : ["Cantilever benchmark length must be at least five times its largest cross-section dimension."];
}
function validateDimensions(dimensions: Record<string, unknown>): string[] {
  return [
    ...validateLength(dimensions.length),
    ...validateWidth(dimensions.width),
    ...validateHeight(dimensions.height),
    ...validateSlenderness(dimensions)
  ];
}
function validateYoungsModulus(material: Record<string, unknown>): string[] {
  return inRange(material.youngsModulusMpa, 1, 1e9)
    ? []
    : ["Young's modulus must be between 1 and 1e9 MPa."];
}
function validatePoissonRatio(material: Record<string, unknown>): string[] {
  const value = material.poissonRatio;
  const valid = typeof value === "number" && Number.isFinite(value) && value > -1 && value < 0.5;
  return valid ? [] : ["Poisson ratio must be finite and between -1 and 0.5."];
}
function validateMaterial(value: Record<string, unknown>): string[] {
  const material = isRecord(value.material) ? value.material : {};
  return [...validateYoungsModulus(material), ...validatePoissonRatio(material)];
}
function validateForce(value: unknown): string[] {
  return inRange(value, Number.MIN_VALUE, 1e9) ? [] : ["totalForceN must be between 0 and 1e9 N."];
}
function validateElementSize(value: unknown): string[] {
  return inRange(value, 1, 100) ? [] : ["elementSizeMm must be between 1 and 100 mm."];
}
function hasMeshEstimateInputs(dimensions: Record<string, unknown>, elementSize: unknown): boolean {
  return finitePositive(dimensions.length) &&
    finitePositive(dimensions.width) &&
    finitePositive(dimensions.height) &&
    finitePositive(elementSize);
}
function estimateTetrahedralElementCount(dimensions: Record<string, unknown>, elementSize: number): number {
  const divisions = [dimensions.length, dimensions.width, dimensions.height]
    .map(dimension => Math.ceil((dimension as number) / elementSize));
  return divisions.reduce((count, division) => count * division, 6);
}
function exceedsMeshResourceLimit(estimate: number): boolean {
  if (!Number.isSafeInteger(estimate)) return true;
  return estimate > MAX_ESTIMATED_ELEMENTS;
}
function validateMeshResourceLimit(dimensions: Record<string, unknown>, elementSize: unknown): string[] {
  if (!hasMeshEstimateInputs(dimensions, elementSize)) return [];
  const estimate = estimateTetrahedralElementCount(dimensions, elementSize as number);
  return exceedsMeshResourceLimit(estimate)
    ? ["Estimated tetrahedral mesh exceeds the 200000-element worker limit."]
    : [];
}
function validateMesh(value: Record<string, unknown>, dimensions: Record<string, unknown>): string[] {
  return [
    ...validateElementSize(value.elementSizeMm),
    ...validateMeshResourceLimit(dimensions, value.elementSizeMm)
  ];
}
export function validateFEACantileverBoxRequest(value: unknown): string[] {
  if (!isRecord(value)) return ["FEA benchmark inputs must be an object."];
  const dimensions = readDimensions(value);
  return [
    ...validateBenchmarkIdentity(value),
    ...validateDimensions(dimensions),
    ...validateMaterial(value),
    ...validateForce(value.totalForceN),
    ...validateMesh(value, dimensions)
  ];
}
export function asFEACantileverBoxRequest(value: unknown): FEACantileverBoxBenchmarkRequest | undefined {
  return validateFEACantileverBoxRequest(value).length === 0
    ? value as FEACantileverBoxBenchmarkRequest
    : undefined;
}
