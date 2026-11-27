import { describe, expect, it } from "vitest";
import {
  createDefaultCADViewportTransform,
  fitCADViewport,
  panCADViewport,
  resetCADViewport,
  rotateCADViewport,
  zoomCADViewport
} from "../src/cad/viewport-transform.js";

describe("CAD viewport navigation transforms", () => {
  it("starts from a centered, bounded default camera transform", () => {
    expect(createDefaultCADViewportTransform()).toEqual({
      rotationX: -0.42,
      rotationY: 0.62,
      zoom: 0.78,
      panX: 0,
      panY: 0
    });
  });

  it("normalizes pan movement to viewport dimensions and bounds translation", () => {
    const initial = createDefaultCADViewportTransform();
    const panned = panCADViewport(initial, 50, 25, 500, 250);
    expect(panned.panX).toBeCloseTo(0.2);
    expect(panned.panY).toBeCloseTo(-0.2);
    expect(panCADViewport(panned, 5000, -5000, 500, 250)).toMatchObject({
      panX: 1.5,
      panY: 1.5
    });
    expect(panCADViewport(panned, 1, 1, 0, 250)).toBe(panned);
  });

  it("clamps wheel and button zoom to the supported range", () => {
    const initial = createDefaultCADViewportTransform();
    expect(zoomCADViewport(initial, 1.2).zoom).toBeCloseTo(0.936);
    expect(zoomCADViewport(initial, 100).zoom).toBe(2);
    expect(zoomCADViewport(initial, 0.0001).zoom).toBe(0.35);
    expect(zoomCADViewport(initial, Number.NaN)).toBe(initial);
  });

  it("rotates horizontally without bounds and clamps vertical orbit", () => {
    const initial = createDefaultCADViewportTransform();
    expect(rotateCADViewport(initial, 10, 10).rotationY).toBeCloseTo(0.71);
    expect(rotateCADViewport(initial, 0, 10000).rotationX).toBe(1.48);
    expect(rotateCADViewport(initial, 0, -10000).rotationX).toBe(-1.48);
  });

  it("fits the normalized model in the viewport without changing its orientation", () => {
    const initial = createDefaultCADViewportTransform();
    const moved = panCADViewport(zoomCADViewport(initial, 1.5), 80, -40, 400, 400);
    const fitted = fitCADViewport(moved);
    expect(fitted).toMatchObject({ zoom: 0.78, panX: 0, panY: 0 });
    expect(fitted.rotationX).toBe(moved.rotationX);
    expect(fitted.rotationY).toBe(moved.rotationY);
  });

  it("resets orientation, zoom and pan together", () => {
    const initial = createDefaultCADViewportTransform();
    const changed = rotateCADViewport(
      panCADViewport(zoomCADViewport(initial, 1.5), 40, 20, 400, 400),
      10,
      20
    );
    expect(resetCADViewport()).toEqual(createDefaultCADViewportTransform());
    expect(changed).not.toEqual(resetCADViewport());
  });
});
