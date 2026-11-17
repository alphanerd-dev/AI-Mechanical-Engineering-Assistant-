import { describe, expect, it } from "vitest";
import {
  MAX_RIGID_TRANSFORM_TOLERANCE,
  addVectors,
  composeRigidTransforms,
  createLine3,
  createPlane3,
  crossProduct,
  dotProduct,
  invertRigidTransform,
  projectPointOntoLine,
  projectPointOntoPlane,
  transformPoint,
  transformVector,
  validateRigidTransform3
} from "../src/geometry-platform/math.js";
import { G3_REFERENCE_FIXTURES as reference } from "./fixtures/geometry-platform-g3-reference.js";

describe("G3 independent analytic differential fixtures", () => {
  it("matches closed-form vector algebra reference values", () => {
    expect(addVectors(reference.vector.a, reference.vector.b)).toEqual(reference.vector.sum);
    expect(dotProduct(reference.vector.a, reference.vector.b)).toBe(reference.vector.dot);
    expect(crossProduct(reference.vector.a, reference.vector.b)).toEqual(reference.vector.cross);
  });

  it("matches closed-form line and plane projection reference values", () => {
    const line = createLine3(reference.projections.line.point, reference.projections.line.direction);
    const plane = createPlane3(reference.projections.plane.point, reference.projections.plane.normal);
    expect(projectPointOntoLine(reference.projections.linePoint, line)).toEqual(reference.projections.lineProjection);
    expect(projectPointOntoPlane(reference.projections.planePoint, plane)).toEqual(reference.projections.planeProjection);
  });

  it("matches an independently derived right-handed rigid transform and inverse", () => {
    const transform = {
      rotation: reference.transform.rotation,
      translationMm: reference.transform.translationMm
    };
    expect(validateRigidTransform3(transform)).toEqual([]);
    expect(transformPoint(transform, reference.transform.point)).toEqual(reference.transform.transformedPoint);
    expect(transformVector(transform, reference.transform.vector)).toEqual(reference.transform.transformedVector);
    expect(transformPoint(invertRigidTransform(transform), reference.transform.inverseInput))
      .toEqual(reference.transform.inverseOutput);
  });

  it("matches the documented A∘B composition convention", () => {
    const rotation = reference.transform.rotation;
    const a = { rotation, translationMm: [10, 0, 0] as const };
    const b = { rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as const, translationMm: [0, 5, 0] as const };
    expect(transformPoint(composeRigidTransforms(a, b), [1, 0, 0])).toEqual([5, 1, 0]);
  });

  it("rejects caller tolerances that could conceal a reflection or scale", () => {
    const reflection = {
      rotation: [[-1, 0, 0], [0, 1, 0], [0, 0, 1]] as const,
      translationMm: [0, 0, 0] as const
    };
    expect(validateRigidTransform3(reflection, 0.5)).not.toEqual([]);
    expect(validateRigidTransform3(reflection, Number.MAX_VALUE)).not.toEqual([]);
    expect(validateRigidTransform3(reflection, MAX_RIGID_TRANSFORM_TOLERANCE + Number.EPSILON)).not.toEqual([]);
    expect(validateRigidTransform3({
      rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as const,
      translationMm: [0, 0, 0] as const
    }, MAX_RIGID_TRANSFORM_TOLERANCE)).toEqual([]);
  });
});
