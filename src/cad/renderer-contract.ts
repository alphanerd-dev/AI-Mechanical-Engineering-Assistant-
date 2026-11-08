/**
 * Renderer-neutral viewport contract. Babylon.js, Three.js and a future fallback
 * implement this seam; their scene, camera and GPU object types must not leak into
 * canonical CAD/artifact/validation contracts.
 */
export type CADRendererId = "babylon" | "three" | "fallback";

export interface CADRendererCapabilities {
  webgl2: boolean;
  instancing: boolean;
  objectPicking: boolean;
  sectionPlanes: boolean;
  contextRecovery: boolean;
  mobileTouch: boolean;
}

export interface CADDisplayMesh {
  artifactId: string;
  sourceArtifactId: string;
  sourceArtifactSha256: string;
  positions: Float32Array;
  normals?: Float32Array;
  indices?: Uint32Array;
  units: string;
  coordinateFrame: string;
}

export interface CADViewportCamera {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  fieldOfViewRadians: number;
}

export interface CADViewportSession {
  readonly renderer: CADRendererId;
  readonly capabilities: CADRendererCapabilities;
  loadMesh(mesh: CADDisplayMesh): Promise<void>;
  setObjectVisibility(artifactId: string, visible: boolean): void;
  selectObject(artifactId: string | null): void;
  setCamera(camera: CADViewportCamera): void;
  resize(width: number, height: number, pixelRatio: number): void;
  recoverContext(): Promise<boolean>;
  dispose(): void;
}

export interface CADViewportAdapter {
  readonly id: CADRendererId;
  mount(canvas: HTMLCanvasElement): Promise<CADViewportSession>;
}

type UnknownRecord = Record<string, unknown>;

function isNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.length > 0;
}

function isSha256(value: unknown): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function hasRequiredIdentity(mesh: UnknownRecord): boolean {
  const requiredText = [mesh.artifactId, mesh.sourceArtifactId, mesh.units, mesh.coordinateFrame];
  return requiredText.every(isNonEmptyString) && isSha256(mesh.sourceArtifactSha256);
}

function validPositions(value: unknown): value is Float32Array {
  return value instanceof Float32Array && value.length >= 9 &&
    value.length % 3 === 0 && value.every(Number.isFinite);
}

function validNormals(value: unknown, positionCount: number): boolean {
  return value === undefined || (
    value instanceof Float32Array && value.length === positionCount && value.every(Number.isFinite)
  );
}

function validIndices(value: unknown, vertexCount: number): boolean {
  return value === undefined || (
    value instanceof Uint32Array && value.length >= 3 && value.length % 3 === 0 &&
    value.every((index) => Number.isSafeInteger(index) && index < vertexCount)
  );
}

export function isCADDisplayMesh(value: unknown): value is CADDisplayMesh {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const mesh = value as UnknownRecord;
  const positions = mesh.positions;
  if (!hasRequiredIdentity(mesh)) return false;
  if (!validPositions(positions)) return false;
  if (!validNormals(mesh.normals, positions.length)) return false;
  return validIndices(mesh.indices, positions.length / 3);
}
