import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import {
  composeRigidTransforms, createBoundingBox3, createLine3, createPlane3, crossProduct,
  distanceBetweenPointsMm, dotProduct, invertRigidTransform, normalizeVector,
  projectPointOntoLine, projectPointOntoPlane, transformPoint, transformVector, vectorMagnitude
} from "../src/geometry-platform/math.js";

type JsonVector = readonly [number, number, number];
function close(actual: number, expected: number, label: string, tolerance = 1e-11): void {
  const allowed = tolerance * Math.max(1, Math.abs(expected));
  assert.ok(Number.isFinite(actual), label + " must be finite.");
  assert.ok(Math.abs(actual - expected) <= allowed, label + " differs: " + actual + " vs " + expected);
}
function closeVector(actual: readonly number[], expected: readonly number[], label: string): void {
  assert.equal(actual.length, expected.length, label + " dimension mismatch.");
  actual.forEach((value, index) => close(value, expected[index], label + "[" + index + "]"));
}

const vectorA: JsonVector = [3, -4, 12];
const vectorB: JsonVector = [-2, 5, 7];
const smallVector: JsonVector = [1e-300, -2e-300, 2e-300];
const largeVector: JsonVector = [1e300, 1e300, 0];
const distancePoints: readonly [JsonVector, JsonVector] = [[1, 2, 3], [4, 6, 3]];
const line = { origin: [1, -2, 3] as JsonVector, point: [5, 4, -1] as JsonVector, direction: [2, 1, -2] as JsonVector };
const plane = { origin: [0, 0, 2] as JsonVector, point: [4, -3, 7] as JsonVector, normal: [1, 2, 2] as JsonVector };
const boundsPoints: readonly JsonVector[] = [[-2, 1, 0], [4, -3, 8], [0, 2, -1], [1, 0, 5]];
const angleA = 0.37;
const angleB = -0.82;
const transformA = {
  rotation: [[Math.cos(angleA), -Math.sin(angleA), 0], [Math.sin(angleA), Math.cos(angleA), 0], [0, 0, 1]] as const,
  translationMm: [10, -3, 2] as const
};
const transformB = {
  rotation: [[1, 0, 0], [0, Math.cos(angleB), -Math.sin(angleB)], [0, Math.sin(angleB), Math.cos(angleB)]] as const,
  translationMm: [-4, 5, 7] as const
};
const point: JsonVector = [3, -7, 11];
const vector: JsonVector = [2, 1, -5];

const payload = {
  vectorA, vectorB, smallVector, largeVector, distancePoints,
  line, plane, boundsPoints, transformA, transformB, transformPoint: point, transformVector: vector
};
const reference = JSON.parse(execFileSync("python3", ["scripts/geometry-math-reference.py"], {
  input: JSON.stringify(payload), encoding: "utf8", stdio: ["pipe", "pipe", "inherit"]
})) as {
  vector: { dot: number; cross: number[]; magnitudeA: number; normalizedSmall: number[]; normalizedLarge: number[] };
  distanceMm: number; lineProjection: number[]; planeProjection: number[];
  bounds: { min: number[]; max: number[] };
  transform: { point: number[]; vector: number[]; composedPoint: number[]; inverseRoundTrip: number[] };
};

close(dotProduct(vectorA, vectorB), reference.vector.dot, "dot product");
closeVector(crossProduct(vectorA, vectorB), reference.vector.cross, "cross product");
close(vectorMagnitude(vectorA), reference.vector.magnitudeA, "vector magnitude");
closeVector(normalizeVector(smallVector), reference.vector.normalizedSmall, "small-vector normalization");
closeVector(normalizeVector(largeVector), reference.vector.normalizedLarge, "large-vector normalization");
close(distanceBetweenPointsMm(distancePoints[0], distancePoints[1]), reference.distanceMm, "point distance");
closeVector(
  projectPointOntoLine(line.point, createLine3(line.origin, line.direction)),
  reference.lineProjection,
  "line projection"
);
closeVector(
  projectPointOntoPlane(plane.point, createPlane3(plane.origin, plane.normal)),
  reference.planeProjection,
  "plane projection"
);
const bounds = createBoundingBox3(boundsPoints);
closeVector(bounds.min, reference.bounds.min, "bounds minimum");
closeVector(bounds.max, reference.bounds.max, "bounds maximum");
closeVector(transformPoint(transformA, point), reference.transform.point, "transformed point");
closeVector(transformVector(transformA, vector), reference.transform.vector, "transformed vector");
const composed = composeRigidTransforms(transformA, transformB);
closeVector(transformPoint(composed, point), reference.transform.composedPoint, "composed transform");
closeVector(
  transformPoint(invertRigidTransform(composed), transformPoint(composed, point)),
  reference.transform.inverseRoundTrip,
  "inverse transform round trip"
);

process.stdout.write("G3 differential reference checks passed (Python standard-library oracle).\n");
