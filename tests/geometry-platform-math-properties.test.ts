import { describe, expect, it } from "vitest";
import {
  composeRigidTransforms, containsPointInBounds, createBoundingBox3, createLine3, createPlane3,
  crossProduct, distanceBetweenPointsMm, dotProduct, invertRigidTransform, normalizeVector,
  projectPointOntoLine, projectPointOntoPlane, transformPoint, validateRigidTransform3
} from "../src/geometry-platform/math.js";

function seededValues(seed: number, count: number): number[] {
  let state = seed >>> 0;
  const values: number[] = [];
  for (let index = 0; index < count; index++) {
    state = (1664525 * state + 1013904223) >>> 0;
    values.push((state / 0xffffffff) * 20 - 10);
  }
  return values;
}
function closeVector(actual: readonly number[], expected: readonly number[], digits = 8): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], digits));
}

describe("G3 deterministic metamorphic and invariant tests", () => {
  it("preserves vector algebra invariants across a seeded sample", () => {
    const values = seededValues(0x6d656368, 300);
    for (let index = 0; index < values.length; index += 6) {
      const a = [values[index], values[index + 1], values[index + 2]] as const;
      const b = [values[index + 3], values[index + 4], values[index + 5]] as const;
      const cross = crossProduct(a, b);
      expect(dotProduct(cross, a)).toBeCloseTo(0, 8);
      expect(dotProduct(cross, b)).toBeCloseTo(0, 8);
      expect(distanceBetweenPointsMm(a, b)).toBeCloseTo(distanceBetweenPointsMm(b, a), 12);
      closeVector(normalizeVector(normalizeVector(a)), normalizeVector(a), 10);
    }
  });

  it("round-trips points through proper rigid transforms", () => {
    const values = seededValues(0x47454f4d, 300);
    for (let index = 0; index < values.length; index += 6) {
      const angle = values[index] * 0.1;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const transform = {
        rotation: [[cosine, -sine, 0], [sine, cosine, 0], [0, 0, 1]] as const,
        translationMm: [values[index + 1], values[index + 2], values[index + 3]] as const
      };
      expect(validateRigidTransform3(transform)).toEqual([]);
      const point = [values[index + 3], values[index + 4], values[index + 5]] as const;
      closeVector(transformPoint(invertRigidTransform(transform), transformPoint(transform, point)), point);
    }
  });

  it("satisfies rigid-transform composition associativity within floating-point tolerance", () => {
    const rotateZ = (angle: number) => ({
      rotation: [[Math.cos(angle), -Math.sin(angle), 0], [Math.sin(angle), Math.cos(angle), 0], [0, 0, 1]] as const,
      translationMm: [angle * 10, angle * -3, angle * 2] as const
    });
    const a = rotateZ(0.37);
    const b = rotateZ(-0.82);
    const c = rotateZ(1.14);
    const left = composeRigidTransforms(composeRigidTransforms(a, b), c);
    const right = composeRigidTransforms(a, composeRigidTransforms(b, c));
    closeVector(transformPoint(left, [3, -7, 11]), transformPoint(right, [3, -7, 11]), 10);
  });

  it("produces orthogonal residuals for line and plane projections", () => {
    const values = seededValues(0x50524f4a, 180);
    for (let index = 0; index < values.length; index += 6) {
      const point = [values[index], values[index + 1], values[index + 2]] as const;
      const line = createLine3([values[index + 3], 0, 0], [1, values[index + 4], values[index + 5]]);
      const lineProjection = projectPointOntoLine(point, line);
      const lineResidual = [point[0] - lineProjection[0], point[1] - lineProjection[1], point[2] - lineProjection[2]] as const;
      expect(dotProduct(lineResidual, line.direction)).toBeCloseTo(0, 8);

      const plane = createPlane3([0, 0, values[index + 3]], [values[index + 4], values[index + 5], 1]);
      const planeProjection = projectPointOntoPlane(point, plane);
      const planeResidual = [point[0] - planeProjection[0], point[1] - planeProjection[1], point[2] - planeProjection[2]] as const;
      closeVector(crossProduct(planeResidual, plane.normal), [0, 0, 0], 8);
    }
  });

  it("constructs bounds that contain every source point and rejects points outside tolerance", () => {
    const values = seededValues(0x424f554e, 300);
    const points = Array.from({ length: 100 }, (_, index) => [
      values[index * 3], values[index * 3 + 1], values[index * 3 + 2]
    ] as const);
    const bounds = createBoundingBox3(points);
    points.forEach(point => expect(containsPointInBounds(bounds, point)).toBe(true));
    expect(bounds.max[0]).toBeGreaterThanOrEqual(bounds.min[0]);
    const outside = [bounds.max[0] + 1, (bounds.min[1] + bounds.max[1]) / 2, (bounds.min[2] + bounds.max[2]) / 2] as const;
    expect(containsPointInBounds(bounds, outside)).toBe(false);
  });
});
