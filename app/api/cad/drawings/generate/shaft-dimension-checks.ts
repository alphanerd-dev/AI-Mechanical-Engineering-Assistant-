import type { Row } from "../../../../../src/cad/geometry-revision-persistence-types";
import { fail } from "./request";
import { isRecord } from "./source-validation";

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function isSupportedAxis(axis: unknown): axis is "x" | "y" | "z" {
  return axis === "x" || axis === "y" || axis === "z";
}
function isValidDimensionCheck(value: unknown): value is Row {
  if (!isRecord(value) || !isSupportedAxis(value.axis)) return false;
  if (value.passed !== true) return false;
  if (!finitePositive(value.actualMm) || !finitePositive(value.expectedMm)) return false;
  return value.toleranceMm === 0.01;
}
function requireCompleteAxisChecks(checks: Map<string, Row>): void {
  for (const axis of ["x", "y", "z"]) {
    if (!checks.has(axis)) {
      fail({ message: "Accepted geometry receipt must validate the " + axis.toUpperCase() + " dimension.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
    }
  }
}
export function collectDimensionChecks(measurements: Row): Map<string, Row> {
  const values = measurements.dimensionChecks;
  if (!Array.isArray(values) || values.length !== 3) {
    fail({ message: "Accepted geometry receipt must contain exactly three axis dimension checks.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  }
  const checks = new Map<string, Row>();
  for (const value of values) {
    if (!isValidDimensionCheck(value)) {
      fail({ message: "Accepted geometry receipt contains an invalid dimension check.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
    }
    const axis = value.axis as string;
    if (checks.has(axis)) {
      fail({ message: "Accepted geometry receipt contains duplicate axis checks.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
    }
    checks.set(axis, value);
  }
  requireCompleteAxisChecks(checks);
  return checks;
}
function validateAxisDimension(input: {
  axis: "x" | "y" | "z"; check: Row; measuredMm: number; expectedMm: number;
}): void {
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
export function validateSpecificationDimensions(input: {
  specification: Row; bounds: Row; checks: Map<string, Row>;
}): void {
  const diameterMm = input.specification.diameterMm as number;
  const lengthMm = input.specification.lengthMm as number;
  validateAxisDimension({ axis: "x", check: input.checks.get("x") as Row, measuredMm: input.bounds.x as number, expectedMm: diameterMm });
  validateAxisDimension({ axis: "y", check: input.checks.get("y") as Row, measuredMm: input.bounds.y as number, expectedMm: diameterMm });
  validateAxisDimension({ axis: "z", check: input.checks.get("z") as Row, measuredMm: input.bounds.z as number, expectedMm: lengthMm });
}
