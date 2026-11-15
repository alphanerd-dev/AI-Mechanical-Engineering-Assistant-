import type { Completion, Row } from "../../../../../src/cad/geometry-revision-persistence-types";
import { fail } from "./request";
import { collectDimensionChecks, validateSpecificationDimensions } from "./shaft-dimension-checks";
import {
  isRecord, isValidGeometryReceipt, requireShaftBounds, requireShaftSpecification
} from "./source-validation";

export function extractCylinderDimensions(input: {
  completion: Completion;
  revision: Row;
  projectId: string;
  modelIdentityId: string;
  solidId: string;
}): { diameterMm: number; lengthMm: number } {
  const receipt = input.completion.validation_receipt;
  const receiptContext = {
    receipt,
    revision: input.revision,
    projectId: input.projectId,
    modelIdentityId: input.modelIdentityId,
    solidId: input.solidId
  };
  if (!isValidGeometryReceipt(receiptContext)) {
    fail({ message: "Accepted geometry receipt identity or validation status is invalid.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  }
  const receiptRecord = receipt as Row;
  const specification = requireShaftSpecification(input.completion);
  const bounds = requireShaftBounds(receiptRecord);
  const measurements = receiptRecord.geometryMeasurements;
  if (!isRecord(measurements)) {
    fail({ message: "Accepted geometry measurements are missing.", status: 422, code: "GEOMETRY_MEASUREMENTS_UNAVAILABLE" });
  }
  const checks = collectDimensionChecks(measurements);
  validateSpecificationDimensions({ specification, bounds, checks });
  return {
    diameterMm: ((bounds.x as number) + (bounds.y as number)) / 2,
    lengthMm: bounds.z as number
  };
}
