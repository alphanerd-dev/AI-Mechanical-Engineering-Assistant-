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

export function isCADDisplayMesh(value: unknown): value is CADDisplayMesh {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const mesh = value as Record<string, unknown>;
  const positions = mesh.positions;
  const normals = mesh.normals;
  const indices = mesh.indices;
  if (typeof mesh.artifactId !== "string" || !mesh.artifactId ||
      typeof mesh.sourceArtifactId !== "string" || !mesh.sourceArtifactId ||
      typeof mesh.sourceArtifactSha256 !== "string" || !/^[a-f0-9]{64}$/.test(mesh.sourceArtifactSha256) ||
      !(positions instanceof Float32Array) || positions.length < 9 || positions.length % 3 !== 0 ||
      !positions.every(Number.isFinite) ||
      (normals !== undefined &&
        (!(normals instanceof Float32Array) || normals.length !== positions.length ||
         !normals.every(Number.isFinite))) ||
      (indices !== undefined &&
        (!(indices instanceof Uint32Array) || indices.length < 3 || indices.length % 3 !== 0 ||
         !indices.every((index) => Number.isSafeInteger(index) && index < positions.length / 3))) ||
      typeof mesh.units !== "string" || !mesh.units ||
      typeof mesh.coordinateFrame !== "string" || !mesh.coordinateFrame) {
    return false;
  }
  return true;
}
