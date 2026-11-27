export interface CADViewportTransform {
  rotationX: number;
  rotationY: number;
  zoom: number;
  panX: number;
  panY: number;
}

export const DEFAULT_CAD_VIEWPORT_TRANSFORM: Readonly<CADViewportTransform> = Object.freeze({
  rotationX: -0.42,
  rotationY: 0.62,
  zoom: 0.78,
  panX: 0,
  panY: 0
});

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2;
const MIN_PAN = -1.5;
const MAX_PAN = 1.5;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function createDefaultCADViewportTransform(): CADViewportTransform {
  return { ...DEFAULT_CAD_VIEWPORT_TRANSFORM };
}

export function rotateCADViewport(
  transform: CADViewportTransform,
  deltaX: number,
  deltaY: number
): CADViewportTransform {
  return {
    ...transform,
    rotationY: transform.rotationY + deltaX * 0.009,
    rotationX: clamp(transform.rotationX + deltaY * 0.009, -1.48, 1.48)
  };
}

export function panCADViewport(
  transform: CADViewportTransform,
  deltaX: number,
  deltaY: number,
  viewportWidth: number,
  viewportHeight: number
): CADViewportTransform {
  if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight) ||
      viewportWidth <= 0 || viewportHeight <= 0) return transform;
  return {
    ...transform,
    panX: clamp(transform.panX + (2 * deltaX) / viewportWidth, MIN_PAN, MAX_PAN),
    panY: clamp(transform.panY - (2 * deltaY) / viewportHeight, MIN_PAN, MAX_PAN)
  };
}

export function zoomCADViewport(
  transform: CADViewportTransform,
  factor: number
): CADViewportTransform {
  if (!Number.isFinite(factor) || factor <= 0) return transform;
  return { ...transform, zoom: clamp(transform.zoom * factor, MIN_ZOOM, MAX_ZOOM) };
}

export function fitCADViewport(transform: CADViewportTransform): CADViewportTransform {
  return { ...transform, zoom: DEFAULT_CAD_VIEWPORT_TRANSFORM.zoom, panX: 0, panY: 0 };
}

export function resetCADViewport(): CADViewportTransform {
  return createDefaultCADViewportTransform();
}
