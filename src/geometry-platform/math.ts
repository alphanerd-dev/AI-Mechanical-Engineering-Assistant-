/**
 * Provider-neutral 3D mathematics for the Geometry Platform.
 * Point coordinates and translations are millimetres; directions are
 * dimensionless; angles are radians. Matrices are row-major. A∘B applies B first.
 */
export type Vector3 = readonly [number, number, number];
export type Point3 = readonly [number, number, number];
export type Matrix3 = readonly [Vector3, Vector3, Vector3];

export const GEOMETRY_LENGTH_UNIT = "mm" as const;
export const GEOMETRY_ANGLE_UNIT = "rad" as const;

export interface GeometryTolerancePolicy { id: string; linearMm: number; angularRad: number; }
export const DEFAULT_GEOMETRY_TOLERANCE_POLICY: GeometryTolerancePolicy = Object.freeze({
  id: "GEOMETRY_DEFAULT_MM_1E-6", linearMm: 1e-6, angularRad: 1e-9
});
export interface Line3 { point: Point3; direction: Vector3; }
export interface Plane3 { point: Point3; normal: Vector3; }
export interface Circle3 { center: Point3; normal: Vector3; radiusMm: number; }
export interface BoundingBox3 { min: Point3; max: Point3; }
export interface RigidTransform3 { rotation: Matrix3; translationMm: Vector3; }

const IDENTITY_MATRIX: Matrix3 = [[1,0,0],[0,1,0],[0,0,1]];
export const IDENTITY_RIGID_TRANSFORM: RigidTransform3 = Object.freeze({
  rotation: IDENTITY_MATRIX, translationMm: [0,0,0] as const
});

function finiteVector(value: readonly number[], name: string): void {
  if (!Array.isArray(value)) throw new Error(name + " must be an array.");
  if (value.length !== 3) throw new Error(name + " must contain exactly three numbers.");
  for (const item of value) {
    if (!Number.isFinite(item)) throw new Error(name + " must contain only finite numbers.");
  }
}
function positiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(name + " must be finite and positive.");
}
function validateToleranceId(policy: GeometryTolerancePolicy): string[] {
  return typeof policy?.id === "string" && policy.id.trim()
    ? [] : ["Tolerance policy id is required."];
}
function validateLinearTolerance(value: number): string[] {
  return Number.isFinite(value) && value > 0 ? [] : ["linearMm tolerance must be finite and positive."];
}
function validateAngularTolerance(value: number): string[] {
  return Number.isFinite(value) && value > 0 && value <= Math.PI
    ? [] : ["angularRad tolerance must be finite, positive and no greater than pi."];
}
export function validateTolerancePolicy(policy: GeometryTolerancePolicy): string[] {
  if (!policy) return ["Tolerance policy is required."];
  return [
    ...validateToleranceId(policy),
    ...validateLinearTolerance(policy.linearMm),
    ...validateAngularTolerance(policy.angularRad)
  ];
}
export function addVectors(a: Vector3, b: Vector3): Vector3 {
  finiteVector(a,"a"); finiteVector(b,"b");
  return [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
}
export function subtractPoints(a: Point3, b: Point3): Vector3 {
  finiteVector(a,"a"); finiteVector(b,"b");
  return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
}
export function scaleVector(vector: Vector3, scale: number): Vector3 {
  finiteVector(vector,"vector");
  if (!Number.isFinite(scale)) throw new Error("scale must be finite.");
  return [vector[0]*scale,vector[1]*scale,vector[2]*scale];
}
export function dotProduct(a: Vector3, b: Vector3): number {
  finiteVector(a,"a"); finiteVector(b,"b");
  return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
}
export function crossProduct(a: Vector3, b: Vector3): Vector3 {
  finiteVector(a,"a"); finiteVector(b,"b");
  return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
}
export function vectorMagnitude(vector: Vector3): number {
  finiteVector(vector,"vector");
  return Math.hypot(vector[0],vector[1],vector[2]);
}
export function normalizeVector(vector: Vector3, minimumMagnitude = 1e-12): Vector3 {
  finiteVector(vector,"vector"); positiveFinite(minimumMagnitude,"minimumMagnitude");
  const magnitude=vectorMagnitude(vector);
  if (magnitude<=minimumMagnitude) throw new Error("Cannot normalize a zero or near-zero vector.");
  return scaleVector(vector,1/magnitude);
}
export function distanceBetweenPointsMm(a: Point3,b: Point3): number {
  return vectorMagnitude(subtractPoints(a,b));
}
export function isWithinLinearTolerance(deltaMm:number,policy=DEFAULT_GEOMETRY_TOLERANCE_POLICY):boolean {
  return Number.isFinite(deltaMm) && validateTolerancePolicy(policy).length===0 && Math.abs(deltaMm)<=policy.linearMm;
}
export function createLine3(point:Point3,direction:Vector3):Line3 {
  finiteVector(point,"point");
  return {point:[...point] as Point3,direction:normalizeVector(direction)};
}
export function createPlane3(point:Point3,normal:Vector3):Plane3 {
  finiteVector(point,"point");
  return {point:[...point] as Point3,normal:normalizeVector(normal)};
}
export function createCircle3(center:Point3,normal:Vector3,radiusMm:number):Circle3 {
  finiteVector(center,"center"); positiveFinite(radiusMm,"radiusMm");
  return {center:[...center] as Point3,normal:normalizeVector(normal),radiusMm};
}
export function projectPointOntoLine(point:Point3,line:Line3):Point3 {
  const direction=normalizeVector(line.direction);
  const along=dotProduct(subtractPoints(point,line.point),direction);
  return addVectors(line.point,scaleVector(direction,along));
}
export function projectPointOntoPlane(point:Point3,plane:Plane3):Point3 {
  const normal=normalizeVector(plane.normal);
  const signed=dotProduct(subtractPoints(point,plane.point),normal);
  return subtractPoints(point,scaleVector(normal,signed)) as Point3;
}
export function createBoundingBox3(points:readonly Point3[]):BoundingBox3 {
  if (!Array.isArray(points)||points.length===0) throw new Error("At least one point is required to create bounds.");
  points.forEach((point,index)=>finiteVector(point,"points["+index+"]"));
  const min:[number,number,number]=[Infinity,Infinity,Infinity];
  const max:[number,number,number]=[-Infinity,-Infinity,-Infinity];
  for (const point of points) for(let axis=0;axis<3;axis++) {
    min[axis]=Math.min(min[axis],point[axis]); max[axis]=Math.max(max[axis],point[axis]);
  }
  return {min,max};
}
function pointWithinBoundsAxis(bounds: BoundingBox3, point: Point3, axis: number, toleranceMm: number): boolean {
  const lower = bounds.min[axis];
  const upper = bounds.max[axis];
  const coordinate = point[axis];
  return lower <= upper && coordinate >= lower - toleranceMm && coordinate <= upper + toleranceMm;
}
export function containsPointInBounds(bounds:BoundingBox3,point:Point3,toleranceMm=DEFAULT_GEOMETRY_TOLERANCE_POLICY.linearMm):boolean {
  finiteVector(bounds.min,"bounds.min"); finiteVector(bounds.max,"bounds.max"); finiteVector(point,"point");
  if(!Number.isFinite(toleranceMm)||toleranceMm<0) return false;
  return pointWithinBoundsAxis(bounds,point,0,toleranceMm)
    && pointWithinBoundsAxis(bounds,point,1,toleranceMm)
    && pointWithinBoundsAxis(bounds,point,2,toleranceMm);
}
function multiplyMatrixVector(matrix:Matrix3,vector:Vector3):Vector3 {
  return [dotProduct(matrix[0],vector),dotProduct(matrix[1],vector),dotProduct(matrix[2],vector)];
}
function multiplyMatrices(a:Matrix3,b:Matrix3):Matrix3 {
  const columns:Matrix3=[[b[0][0],b[1][0],b[2][0]],[b[0][1],b[1][1],b[2][1]],[b[0][2],b[1][2],b[2][2]]];
  return [
    columns.map(column=>dotProduct(a[0],column)) as unknown as Vector3,
    columns.map(column=>dotProduct(a[1],column)) as unknown as Vector3,
    columns.map(column=>dotProduct(a[2],column)) as unknown as Vector3
  ];
}
function determinant3(m:Matrix3):number {
  const [a,b,c]=m;
  return a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]);
}
function validateRotationShape(rotation: Matrix3): string[] {
  if (!Array.isArray(rotation) || rotation.length !== 3) return ["rotation must be a 3x3 matrix."];
  for (let row = 0; row < 3; row++) {
    try { finiteVector(rotation[row], "rotation[" + row + "]"); }
    catch (error) { return [error instanceof Error ? error.message : "Rotation contains invalid values."]; }
  }
  return [];
}
function validateTranslation(translation: Vector3): string[] {
  try { finiteVector(translation, "translationMm"); return []; }
  catch (error) { return [error instanceof Error ? error.message : "Translation contains invalid values."]; }
}
function validateRotationOrthonormality(rotation: Matrix3, tolerance: number): string[] {
  for (let row = 0; row < 3; row++) {
    for (let column = row; column < 3; column++) {
      const expected = row === column ? 1 : 0;
      if (Math.abs(dotProduct(rotation[row], rotation[column]) - expected) > tolerance) {
        return ["rotation matrix must be orthonormal."];
      }
    }
  }
  return [];
}
function validateRotationHandedness(rotation: Matrix3, tolerance: number): string[] {
  return Math.abs(determinant3(rotation) - 1) <= tolerance * 4
    ? [] : ["rotation matrix must be right-handed with determinant +1."];
}
export function validateRigidTransform3(transform:RigidTransform3,tolerance=1e-9):string[] {
  if (!transform) return ["Transform is required."];
  const shapeErrors = validateRotationShape(transform.rotation);
  if (shapeErrors.length) return shapeErrors;
  const translationErrors = validateTranslation(transform.translationMm);
  if (translationErrors.length) return translationErrors;
  if (!Number.isFinite(tolerance) || tolerance <= 0) return ["Transform tolerance must be finite and positive."];
  return [
    ...validateRotationOrthonormality(transform.rotation, tolerance),
    ...validateRotationHandedness(transform.rotation, tolerance)
  ];
}
function assertRigidTransform(transform:RigidTransform3):void {
  const errors=validateRigidTransform3(transform);
  if(errors.length) throw new Error(errors.join(" "));
}
export function transformVector(transform:RigidTransform3,vector:Vector3):Vector3 {
  assertRigidTransform(transform); return multiplyMatrixVector(transform.rotation,vector);
}
export function transformPoint(transform:RigidTransform3,point:Point3):Point3 {
  finiteVector(point,"point"); assertRigidTransform(transform);
  return addVectors(multiplyMatrixVector(transform.rotation,point),transform.translationMm);
}
export function composeRigidTransforms(a:RigidTransform3,b:RigidTransform3):RigidTransform3 {
  assertRigidTransform(a); assertRigidTransform(b);
  return {rotation:multiplyMatrices(a.rotation,b.rotation),translationMm:addVectors(multiplyMatrixVector(a.rotation,b.translationMm),a.translationMm)};
}
export function invertRigidTransform(transform:RigidTransform3):RigidTransform3 {
  assertRigidTransform(transform);
  const [r0,r1,r2]=transform.rotation;
  const rotation:Matrix3=[[r0[0],r1[0],r2[0]],[r0[1],r1[1],r2[1]],[r0[2],r1[2],r2[2]]];
  return {rotation,translationMm:scaleVector(multiplyMatrixVector(rotation,transform.translationMm),-1)};
}
