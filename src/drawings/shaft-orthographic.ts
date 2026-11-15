import { createHash } from "node:crypto";

export const SHAFT_ORTHOGRAPHIC_DRAWING_GENERATOR_ID = "alphanerd.shaft-orthographic-svg";
export const SHAFT_ORTHOGRAPHIC_DRAWING_GENERATOR_VERSION = "1.0.0";
export interface ShaftOrthographicDrawingInput {
  drawingNumber: string;
  title: string;
  diameterMm: number;
  lengthMm: number;
  sourceGeometryRevisionId: string;
  sourceArtifactId: string;
  sourceArtifactSha256: string;
  sourceRevisionNumber: number;
}
export interface GeneratedCADDrawing {
  format: "SVG";
  mediaType: "image/svg+xml";
  parserVersion: string;
  generatorId: string;
  generatorVersion: string;
  units: "mm";
  entityCount: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  warnings: string[];
  parameters: {
    drawingNumber: string;
    title: string;
    diameterMm: number;
    lengthMm: number;
    sourceGeometryRevisionId: string;
    sourceArtifactId: string;
    sourceArtifactSha256: string;
    sourceRevisionNumber: number;
    projection: "ORTHOGRAPHIC";
  };
  svg: string;
  bytes: Uint8Array;
  sha256: string;
}

const PAGE_WIDTH_MM = 297;
const PAGE_HEIGHT_MM = 210;
const MAX_DIMENSION_MM = 100_000;
const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validatePositiveDimension(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_DIMENSION_MM) {
    throw new Error(name + " must be finite, positive and no greater than 100000 mm.");
  }
}
function validateSourceIdentity(input: ShaftOrthographicDrawingInput): void {
  if (!UUID.test(input.sourceGeometryRevisionId)) throw new Error("A valid source geometry revision ID is required.");
  if (!input.sourceArtifactId.trim() || input.sourceArtifactId.length > 160) throw new Error("A valid source artifact ID is required.");
  if (!SHA256.test(input.sourceArtifactSha256)) throw new Error("A valid source artifact SHA-256 digest is required.");
  if (!Number.isSafeInteger(input.sourceRevisionNumber) || input.sourceRevisionNumber < 1) throw new Error("A positive source revision number is required.");
}
function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function validateLabel(value: string, name: string, maximum: number): string {
  const normalized = value.trim();
  const invalidControl = /[\x00-\x1f\x7f]/.test(normalized);
  const invalidDrawingNumber = name === "drawingNumber" && /[\\/]/.test(normalized);
  if (!normalized || normalized.length > maximum || invalidControl || invalidDrawingNumber) {
    throw new Error(name + " is required and must be a safe short label.");
  }
  return escapeXml(normalized);
}
function line(x1: number, y1: number, x2: number, y2: number, stroke = "#172b3a", width = 0.35): string {
  return '<line x1="' + x1.toFixed(2) + '" y1="' + y1.toFixed(2) + '" x2="' + x2.toFixed(2) +
    '" y2="' + y2.toFixed(2) + '" stroke="' + stroke + '" stroke-width="' + width + '"/>';
}
function text(x: number, y: number, value: string, size = 3.4, anchor = "middle", fill = "#172b3a"): string {
  return '<text x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" font-size="' + size.toFixed(2) +
    '" text-anchor="' + anchor + '" fill="' + fill + '">' + value + '</text>';
}
function buildDrawingMarkup(input: ShaftOrthographicDrawingInput, drawingNumber: string, title: string): string {
  const scale = Math.min(170 / input.lengthMm, 42 / input.diameterMm);
  const viewLength = input.lengthMm * scale;
  const viewDiameter = input.diameterMm * scale;
  const sideX = 48;
  const sideY = 76;
  const sideRight = sideX + viewLength;
  const sideBottom = sideY + viewDiameter;
  const endCenterX = 246;
  const endCenterY = sideY + viewDiameter / 2;
  const radius = viewDiameter / 2;
  const lengthDimensionY = sideBottom + 20;
  const diameterDimensionX = sideX - 16;
  const titleText = text(18, 16, title, 5, "start");
  const drawingNoText = text(279, 16, drawingNumber, 3.5, "end");
  const sideView = [
    '<rect x="' + sideX.toFixed(2) + '" y="' + sideY.toFixed(2) + '" width="' + viewLength.toFixed(2) +
      '" height="' + viewDiameter.toFixed(2) + '" fill="none" stroke="#172b3a" stroke-width="0.55"/>',
    line(sideX - 3, sideY + radius, sideRight + 3, sideY + radius, "#42a99b", 0.25),
    text(sideX + viewLength / 2, sideY - 7, "SIDE VIEW", 3.2),
    line(sideX, sideBottom + 2, sideX, lengthDimensionY + 3, "#64748b", 0.22),
    line(sideRight, sideBottom + 2, sideRight, lengthDimensionY + 3, "#64748b", 0.22),
    line(sideX, lengthDimensionY, sideRight, lengthDimensionY, "#172b3a", 0.28),
    line(sideX, lengthDimensionY - 2, sideX, lengthDimensionY + 2, "#172b3a", 0.28),
    line(sideRight, lengthDimensionY - 2, sideRight, lengthDimensionY + 2, "#172b3a", 0.28),
    text(sideX + viewLength / 2, lengthDimensionY - 2.5, "L = " + input.lengthMm.toFixed(2) + " mm", 3.4)
  ].join("");
  const endView = [
    '<circle cx="' + endCenterX.toFixed(2) + '" cy="' + endCenterY.toFixed(2) + '" r="' + radius.toFixed(2) +
      '" fill="none" stroke="#172b3a" stroke-width="0.55"/>',
    line(endCenterX - radius - 3, endCenterY, endCenterX + radius + 3, endCenterY, "#42a99b", 0.25),
    line(endCenterX, endCenterY - radius - 3, endCenterX, endCenterY + radius + 3, "#42a99b", 0.25),
    text(endCenterX, sideY - 7, "END VIEW", 3.2),
    line(endCenterX - radius - 5, endCenterY - radius, endCenterX - radius - 5, endCenterY + radius, "#172b3a", 0.28),
    line(endCenterX - radius - 7, endCenterY - radius, endCenterX - radius - 3, endCenterY - radius, "#172b3a", 0.28),
    line(endCenterX - radius - 7, endCenterY + radius, endCenterX - radius - 3, endCenterY + radius, "#172b3a", 0.28),
    text(endCenterX - radius - 9, endCenterY, "Ø " + input.diameterMm.toFixed(2) + " mm", 3.2, "end")
  ].join("");
  const notes = [
    text(18, 166, "UNITS: mm", 3.2, "start"),
    text(18, 174, "NOMINAL DIMENSIONS FROM ACCEPTED GEOMETRY REVISION " + input.sourceRevisionNumber, 3.0, "start"),
    text(18, 182, "PRELIMINARY — NOT FOR MANUFACTURE", 4.0, "start", "#b45309"),
    text(18, 190, "Verify dimensions, tolerances, datums, finish and applicable drafting standards before release.", 2.6, "start"),
    text(279, 190, "SOURCE: " + escapeXml(input.sourceArtifactId), 2.4, "end")
  ].join("");
  const frame = [
    '<rect x="8" y="8" width="281" height="194" fill="none" stroke="#64748b" stroke-width="0.25"/>',
    line(8, 24, 289, 24, "#64748b", 0.25),
    line(8, 158, 289, 158, "#64748b", 0.25),
    line(8, 186, 289, 186, "#64748b", 0.25)
  ].join("");
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="0 0 297 210">',
    "<title>" + title + "</title>",
    "<desc>Preliminary orthographic side and end views of a cylindrical shaft. Not for manufacture.</desc>",
    frame, titleText, drawingNoText, sideView, endView, notes, "</svg>"
  ].join("");
}

export function generateShaftOrthographicSvgDrawing(input: ShaftOrthographicDrawingInput): GeneratedCADDrawing {
  validatePositiveDimension(input.diameterMm, "diameterMm");
  validatePositiveDimension(input.lengthMm, "lengthMm");
  validateSourceIdentity(input);
  const drawingNumber = validateLabel(input.drawingNumber, "drawingNumber", 80);
  const title = validateLabel(input.title, "title", 120);
  const svg = buildDrawingMarkup(input, drawingNumber, title);
  const bytes = new TextEncoder().encode(svg);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const entityCount = (svg.match(/<(?:line|rect|circle|text)\b/g) ?? []).length;
  return {
    format: "SVG",
    mediaType: "image/svg+xml",
    parserVersion: "svg-safe-subset-1",
    generatorId: SHAFT_ORTHOGRAPHIC_DRAWING_GENERATOR_ID,
    generatorVersion: SHAFT_ORTHOGRAPHIC_DRAWING_GENERATOR_VERSION,
    units: "mm",
    entityCount,
    bounds: { minX: 0, minY: 0, maxX: PAGE_WIDTH_MM, maxY: PAGE_HEIGHT_MM },
    warnings: [
      "PRELIMINARY: not for manufacture or inspection release.",
      "Only nominal diameter and length are dimensioned; tolerances, datums, surface finish, GD&T and standards compliance are not provided.",
      "Dimensions are sourced from the accepted geometry revision; independently verify drawing and model before downstream use."
    ],
    parameters: {
      drawingNumber: input.drawingNumber.trim(),
      title: input.title.trim(),
      diameterMm: input.diameterMm,
      lengthMm: input.lengthMm,
      sourceGeometryRevisionId: input.sourceGeometryRevisionId,
      sourceArtifactId: input.sourceArtifactId,
      sourceArtifactSha256: input.sourceArtifactSha256,
      sourceRevisionNumber: input.sourceRevisionNumber,
      projection: "ORTHOGRAPHIC"
    },
    svg,
    bytes,
    sha256
  };
}
