import { describe, expect, it } from "vitest";
import {
  DEFAULT_GEOMETRY_TOLERANCE_POLICY, IDENTITY_RIGID_TRANSFORM,
  MAX_RIGID_TRANSFORM_VALIDATION_TOLERANCE, addVectors, composeRigidTransforms,
  containsPointInBounds, createBoundingBox3, createCircle3, createLine3, createPlane3,
  crossProduct, distanceBetweenPointsMm, dotProduct, invertRigidTransform,
  isWithinLinearTolerance, normalizeVector, projectPointOntoLine, projectPointOntoPlane,
  scaleVector, transformPoint, transformVector, validateRigidTransform3, vectorMagnitude
} from "../src/geometry-platform/math.js";

describe("Geometry Platform G3 mathematical foundation", () => {
  it("provides deterministic vector arithmetic and millimetre distance", () => {
    expect(addVectors([1, 2, 3], [4, -2, 1])).toEqual([5, 0, 4]);
    expect(dotProduct([1, 2, 3], [4, -2, 1])).toBe(3);
    expect(crossProduct([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    expect(distanceBetweenPointsMm([0, 0, 0], [2, 3, 6])).toBe(7);
    expect(normalizeVector([0, 3, 4])).toEqual([0, 0.6, 0.8]);
  });

  it("normalizes very small and very large finite vectors without absolute-epsilon failure", () => {
    expect(normalizeVector([1e-300, 0, 0])).toEqual([1, 0, 0]);
    expect(normalizeVector([1e300, 1e300, 0])[0]).toBeCloseTo(Math.SQRT1_2, 14);
    expect(vectorMagnitude([1e150, 1e150, 0])).toBeCloseTo(Math.sqrt(2) * 1e150, 14);
    expect(() => normalizeVector([1e-300, 0, 0], 1e-200)).toThrow(/zero or near-zero/);
    expect(() => normalizeVector([1, 0, 0], -1)).toThrow(/non-negative/);
  });

  it("rejects degenerate directions, non-finite values, empty bounds and arithmetic overflow", () => {
    expect(() => normalizeVector([0, 0, 0])).toThrow(/zero or near-zero/);
    expect(() => createLine3([0, 0, 0], [0, 0, 0])).toThrow();
    expect(() => createCircle3([0, 0, 0], [0, 0, 1], 0)).toThrow(/radiusMm/);
    expect(() => createBoundingBox3([])).toThrow(/At least one point/);
    expect(() => addVectors([0, 0, Number.NaN], [1, 1, 1])).toThrow(/finite/);
    expect(() => addVectors([Number.MAX_VALUE, 0, 0], [Number.MAX_VALUE, 0, 0])).toThrow(/numeric range/);
    expect(() => distanceBetweenPointsMm([Number.MAX_VALUE, 0, 0], [-Number.MAX_VALUE, 0, 0])).toThrow(/numeric range/);
    expect(() => scaleVector([Number.MAX_VALUE, 0, 0], 2)).toThrow(/numeric range/);
  });

  it("normalizes lines, planes and circles and projects points", () => {
    const line = createLine3([0, 0, 0], [2, 0, 0]);
    const plane = createPlane3([0, 0, 5], [0, 0, 4]);
    const circle = createCircle3([1, 2, 3], [0, 0, 2], 25);
    expect(line.direction).toEqual([1, 0, 0]);
    expect(plane.normal).toEqual([0, 0, 1]);
    expect(circle.normal).toEqual([0, 0, 1]);
    expect(projectPointOntoLine([4, 3, 2], line)).toEqual([4, 0, 0]);
    expect(projectPointOntoPlane([4, 3, 9], plane)).toEqual([4, 3, 5]);
  });

  it("computes axis-aligned bounds and exact tolerance boundaries", () => {
    const bounds = createBoundingBox3([[-2, 1, 0], [4, -3, 8], [0, 2, -1]]);
    expect(bounds).toEqual({ min: [-2, -3, -1], max: [4, 2, 8] });
    expect(containsPointInBounds(bounds, [4.000001, 0, 0])).toBe(true);
    expect(containsPointInBounds(bounds, [4.0000011, 0, 0])).toBe(false);
    expect(isWithinLinearTolerance(1e-6)).toBe(true);
    expect(isWithinLinearTolerance(1.000001e-6)).toBe(false);
    expect(isWithinLinearTolerance(Number.NaN)).toBe(false);
    expect(DEFAULT_GEOMETRY_TOLERANCE_POLICY.linearMm).toBe(1e-6);
  });

  it("accepts proper rigid transforms and rejects scale, reflection, shear and excessive tolerance", () => {
    const valid = { rotation: [[0, -1, 0], [1, 0, 0], [0, 0, 1]] as const, translationMm: [10, 20, 30] as const };
    expect(validateRigidTransform3(valid)).toEqual([]);
    expect(validateRigidTransform3({ rotation: [[2, 0, 0], [0, 1, 0], [0, 0, 1]], translationMm: [0, 0, 0] })).not.toEqual([]);
    expect(validateRigidTransform3({ rotation: [[-1, 0, 0], [0, 1, 0], [0, 0, 1]], translationMm: [0, 0, 0] })).not.toEqual([]);
    expect(validateRigidTransform3({ rotation: [[1, 0.1, 0], [0, 1, 0], [0, 0, 1]], translationMm: [0, 0, 0] })).not.toEqual([]);
    expect(validateRigidTransform3({ rotation: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], translationMm: [0, 0, 0] }, 100)).not.toEqual([]);
    expect(validateRigidTransform3(valid, MAX_RIGID_TRANSFORM_VALIDATION_TOLERANCE + 1e-6)).not.toEqual([]);
  });

  it("transforms points and vectors without translating directions", () => {
    const transform = { rotation: [[0, -1, 0], [1, 0, 0], [0, 0, 1]] as const, translationMm: [10, 20, 30] as const };
    expect(transformPoint(transform, [1, 0, 0])).toEqual([10, 21, 30]);
    expect(transformVector(transform, [1, 0, 0])).toEqual([0, 1, 0]);
  });

  it("composes and inverts rigid transforms consistently", () => {
    const a = { rotation: [[0, -1, 0], [1, 0, 0], [0, 0, 1]] as const, translationMm: [10, 0, 0] as const };
    const b = { rotation: IDENTITY_RIGID_TRANSFORM.rotation, translationMm: [0, 5, 0] as const };
    const combined = composeRigidTransforms(a, b);
    expect(transformPoint(combined, [1, 0, 0])).toEqual([5, 1, 0]);
    const inverse = invertRigidTransform(combined);
    const original = transformPoint(inverse, transformPoint(combined, [7, -2, 3]));
    expect(original[0]).toBeCloseTo(7, 12);
    expect(original[1]).toBeCloseTo(-2, 12);
    expect(original[2]).toBeCloseTo(3, 12);
  });
});
