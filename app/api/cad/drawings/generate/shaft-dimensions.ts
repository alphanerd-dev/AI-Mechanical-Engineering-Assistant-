import type { Completion, Row } from "../../../../../src/cad/geometry-revision-persistence-types";
import { fail } from "./request";
import { isRecord, isValidGeometryReceipt } from "./source-validation";

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function requireShaftSpecification(completion: Completion): Row {
  const specification = completion.specification;
  if (!isRecord(specification)) fail({ message: "Accepted CAD specification is missing.", status: 422, code: "INVALID_SHAFT_SPECIFICATION" });
  if (specification.kind !== "CYLINDER") {
    fail({ message: "Drawing generator currently supports cylindrical shaft geometry only.", status: 422, code: "UNSUPPORTED_SHAFT_SPECIFICATION" });
  }
  if (specification.name !== "shaft") {
    fail({ message: "Drawing generator currently supports accepted shaft specifications only.", status: 422, code: "UNSUPPORTED_SHAFT_SPECIFICATION" });
  }
  if (!finitePositive(specification.diameterMm)) fail({ message: "Accepted shaft diameter is invalid.", status: 422, code: "INVALID_SHAFT_SPECIFICATION" });
  if (!finitePositive(specification.lengthMm)) fail({ message: "Accepted shaft length is invalid.", status: 422, code: "INVALID_SHAFT_SPECIFICATION" });
  return specification;
}
function requireShaftBounds(receipt: Row): Row {
  const measurements = receipt.geometryMeasurements;
  const bounds = isRecord(measurements) ? measurements.boundingBoxMm : undefined;
  if (!isRecord(bounds)) fail({ message: "Accepted geometry receipt has no bounding box measurements.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  if (!finitePositive(bounds.x)) fail({ message: "Accepted shaft X extent is invalid.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  if (!finitePositive(bounds.y)) fail({ message: "Accepted shaft Y extent is invalid.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  if (!finitePositive(bounds.z)) fail({ message: "Accepted shaft Z extent is invalid.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  return bounds;
}
function isSupportedAxis(axis: unknown): boolean {
  if (axis === "x") return true;
  if (axis === "y") return true;
  return axis === "z";
}
function isValidDimensionCheck(value: unknown): value is Row {
  if (!isRecord(value)) return false;
  if (!isSupportedAxis(value.axis)) return false;
  if (value.passed !== true) return false;
  if (!finitePositive(value.actualMm)) return false;
  if (!finitePositive(value.expectedMm)) return false;
  return finitePositive(value.toleranceMm);
}
function collectDimensionChecks(measurements: Row): Map<string, Row> {
  const values = measurements.dimensionChecks;
  if (!Array.isArray(values)) fail({ message: "Accepted geometry receipt has no axis dimension checks.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  if (values.length !== 3) fail({ message: "Accepted geometry receipt must contain exactly three axis dimension checks.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  const checks = new Map<string, Row>();
  for (const value of values) {
    if (!isValidDimensionCheck(value)) fail({ message: "Accepted geometry receipt contains an invalid dimension check.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
    const axis = value.axis as string;
    if (checks.has(axis)) fail({ message: "Accepted geometry receipt contains duplicate axis checks.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
    checks.set(axis, value);
  }
  if (!checks.has("x")) fail({ message: "Accepted geometry receipt must validate the X dimension.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  if (!checks.has("y")) fail({ message: "Accepted geometry receipt must validate the Y dimension.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  if (!checks.has("z")) fail({ message: "Accepted geometry receipt must validate the Z dimension.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  return checks;
}
function validateAxisDimension(input: { axis: string; check: Row; measuredMm: number; expectedMm: number }): void {
  const tolerance = input.check.toleranceMm as number;
  if (Math.abs((input.check.expectedMm as number) - input.expectedMm) > tolerance) {
    fail({ message: "Accepted " + input.axis.toUpperCase() + " dimension check does not match the CAD specification.", status: 422, code: "SHAFT_DIMENSION_MISMATCH" });
  }
  if (Math.abs((input.check.actualMm as number) - input.measuredMm) > tolerance) {
    fail({ message: "Accepted " + input.axis.toUpperCase() + " dimension check does not match measured geometry.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  }
  if (Math.abs(input.measuredMm - input.expectedMm) > tolerance) {
    fail({ message: "Measured " + input.axis.toUpperCase() + " dimension does not match the accepted CAD specification.", status: 422, code: "SHAFT_DIMENSION_MISMATCH" });
  }
}
function validateSpecificationDimensions(input: { specification: Row; bounds: Row; checks: Map<string, Row> }): void {
  const diameterMm = input.specification.diameterMm as number;
  const lengthMm = input.specification.lengthMm as number;
  validateAxisDimension({ axis: "x", check: input.checks.get("x") as Row, measuredMm: input.bounds.x as number, expectedMm: diameterMm });
  validateAxisDimension({ axis: "y", check: input.checks.get("y") as Row, measuredMm: input.bounds.y as number, expectedMm: diameterMm });
  validateAxisDimension({ axis: "z", check: input.checks.get("z") as Row, measuredMm: input.bounds.z as number, expectedMm: lengthMm });
}
export function extractCylinderDimensions(input: {
  completion: Completion; revision: Row; projectId: string; modelIdentityId: string; solidId: string;
}): { diameterMm: number; lengthMm: number } {
  const receipt = input.completion.validation_receipt;
  const receiptContext = {
    receipt, revision: input.revision, projectId: input.projectId,
    modelIdentityId: input.modelIdentityId, solidId: input.solidId
  };
  if (!isValidGeometryReceipt(receiptContext)) {
    fail({ message: "Accepted geometry receipt identity or validation status is invalid.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  }
  const receiptRecord = receipt as Row;
  const specification = requireShaftSpecification(input.completion);
  const bounds = requireShaftBounds(receiptRecord);
  const measurements = receiptRecord.geometryMeasurements;
  if (!isRecord(measurements)) fail({ message: "Accepted geometry measurements are missing.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  const checks = collectDimensionChecks(measurements);
  validateSpecificationDimensions({ specification, bounds, checks });
  return { diameterMm: ((bounds.x as number) + (bounds.y as number)) / 2, lengthMm: bounds.z as number };
}
