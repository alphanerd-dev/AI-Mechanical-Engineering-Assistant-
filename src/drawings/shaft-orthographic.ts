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

interface DrawingLine {
  x1: number; y1: number; x2: number; y2: number;
  stroke?: string; width?: number;
}
interface DrawingText {
  x: number; y: number; value: string;
  size?: number; anchor?: string; fill?: string;
}
interface DrawingLabel {
  value: string; name: string; maximum: number;
}

const PAGE_WIDTH_MM = 297;
const PAGE_HEIGHT_MM = 210;
const MAX_DIMENSION_MM = 100_000;
const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

function validatePositiveDimension(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new Error(name + " must be finite.");
  if (value <= 0) throw new Error(name + " must be positive.");
  if (value > MAX_DIMENSION_MM) throw new Error(name + " must not exceed 100000 mm.");
}
function validateSourceRevisionId(value: string): void {
  if (!UUID.test(value)) throw new Error("A valid source geometry revision ID is required.");
}
function validateSourceArtifactId(value: string): void {
  if (!value.trim() || value.length > 160) throw new Error("A valid source artifact ID is required.");
}
function validateSourceArtifactDigest(value: string): void {
  if (!SHA256.test(value)) throw new Error("A valid source artifact SHA-256 digest is required.");
}
function validateSourceRevisionNumber(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("A positive source revision number is required.");
}
function validateSourceIdentity(input: ShaftOrthographicDrawingInput): void {
  validateSourceRevisionId(input.sourceGeometryRevisionId);
  validateSourceArtifactId(input.sourceArtifactId);
  validateSourceArtifactDigest(input.sourceArtifactSha256);
  validateSourceRevisionNumber(input.sourceRevisionNumber);
}
function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function hasUnsafeControlCharacters(value: string): boolean {
  return /[\x00-\x1f\x7f]/.test(value);
}
function validateDrawingNumber(value: string): void {
  if (/[\\/]/.test(value)) throw new Error("drawingNumber cannot contain path separators.");
}
function validateLabel(input: DrawingLabel): string {
  const normalized = input.value.trim();
  if (!normalized || normalized.length > input.maximum) {
    throw new Error(input.name + " is required and must be a safe short label.");
  }
  if (hasUnsafeControlCharacters(normalized)) throw new Error(input.name + " contains control characters.");
  if (input.name === "drawingNumber") validateDrawingNumber(normalized);
  return escapeXml(normalized);
}
function line(input: DrawingLine): string {
  const stroke = input.stroke ?? "#172b3a";
  const width = input.width ?? 0.35;
  return '<line x1="' + input.x1.toFixed(2) + '" y1="' + input.y1.toFixed(2) +
    '" x2="' + input.x2.toFixed(2) + '" y2="' + input.y2.toFixed(2) +
    '" stroke="' + stroke + '" stroke-width="' + width + '"/>';
}
function text(input: DrawingText): string {
  const size = input.size ?? 3.4;
  const anchor = input.anchor ?? "middle";
  const fill = input.fill ?? "#172b3a";
  return '<text x="' + input.x.toFixed(2) + '" y="' + input.y.toFixed(2) +
    '" font-size="' + size.toFixed(2) + '" text-anchor="' + anchor +
    '" fill="' + fill + '">' + input.value + '</text>';
}
function buildSideView(input: ShaftOrthographicDrawingInput, scale: number): string {
  const sideX = 48;
  const sideY = 76;
  const viewLength = input.lengthMm * scale;
  const viewDiameter = input.diameterMm * scale;
  const sideRight = sideX + viewLength;
  const sideBottom = sideY + viewDiameter;
  const radius = viewDiameter / 2;
  const dimensionY = sideBottom + 20;
  return [
    '<rect x="' + sideX.toFixed(2) + '" y="' + sideY.toFixed(2) + '" width="' + viewLength.toFixed(2) +
      '" height="' + viewDiameter.toFixed(2) + '" fill="none" stroke="#172b3a" stroke-width="0.55"/>',
    line({ x1: sideX - 3, y1: sideY + radius, x2: sideRight + 3, y2: sideY + radius, stroke: "#42a99b", width: 0.25 }),
    text({ x: sideX + viewLength / 2, y: sideY - 7, value: "SIDE VIEW", size: 3.2 }),
    line({ x1: sideX, y1: sideBottom + 2, x2: sideX, y2: dimensionY + 3, stroke: "#64748b", width: 0.22 }),
    line({ x1: sideRight, y1: sideBottom + 2, x2: sideRight, y2: dimensionY + 3, stroke: "#64748b", width: 0.22 }),
    line({ x1: sideX, y1: dimensionY, x2: sideRight, y2: dimensionY, width: 0.28 }),
    line({ x1: sideX, y1: dimensionY - 2, x2: sideX, y2: dimensionY + 2, width: 0.28 }),
    line({ x1: sideRight, y1: dimensionY - 2, x2: sideRight, y2: dimensionY + 2, width: 0.28 }),
    text({ x: sideX + viewLength / 2, y: dimensionY - 2.5, value: "L = " + input.lengthMm.toFixed(2) + " mm", size: 3.4 })
  ].join("");
}
function buildEndView(input: ShaftOrthographicDrawingInput, scale: number): string {
  const centerX = 246;
  const centerY = 76 + input.diameterMm * scale / 2;
  const radius = input.diameterMm * scale / 2;
  return [
    '<circle cx="' + centerX.toFixed(2) + '" cy="' + centerY.toFixed(2) + '" r="' + radius.toFixed(2) +
      '" fill="none" stroke="#172b3a" stroke-width="0.55"/>',
    line({ x1: centerX - radius - 3, y1: centerY, x2: centerX + radius + 3, y2: centerY, stroke: "#42a99b", width: 0.25 }),
    line({ x1: centerX, y1: centerY - radius - 3, x2: centerX, y2: centerY + radius + 3, stroke: "#42a99b", width: 0.25 }),
    text({ x: centerX, y: 69, value: "END VIEW", size: 3.2 }),
    line({ x1: centerX - radius - 5, y1: centerY - radius, x2: centerX - radius - 5, y2: centerY + radius, width: 0.28 }),
    line({ x1: centerX - radius - 7, y1: centerY - radius, x2: centerX - radius - 3, y2: centerY - radius, width: 0.28 }),
    line({ x1: centerX - radius - 7, y1: centerY + radius, x2: centerX - radius - 3, y2: centerY + radius, width: 0.28 }),
    text({ x: centerX - radius - 9, y: centerY, value: "Ø " + input.diameterMm.toFixed(2) + " mm", size: 3.2, anchor: "end" })
  ].join("");
}
function buildDrawingFrame(): string {
  return [
    '<rect x="8" y="8" width="281" height="194" fill="none" stroke="#64748b" stroke-width="0.25"/>',
    line({ x1: 8, y1: 24, x2: 289, y2: 24, stroke: "#64748b", width: 0.25 }),
    line({ x1: 8, y1: 158, x2: 289, y2: 158, stroke: "#64748b", width: 0.25 }),
    line({ x1: 8, y1: 186, x2: 289, y2: 186, stroke: "#64748b", width: 0.25 })
  ].join("");
}
function buildDrawingNotes(input: ShaftOrthographicDrawingInput): string {
  return [
    text({ x: 18, y: 166, value: "UNITS: mm", size: 3.2, anchor: "start" }),
    text({ x: 18, y: 174, value: "NOMINAL DIMENSIONS FROM ACCEPTED GEOMETRY REVISION " + input.sourceRevisionNumber, size: 3, anchor: "start" }),
    text({ x: 18, y: 182, value: "PRELIMINARY — NOT FOR MANUFACTURE", size: 4, anchor: "start", fill: "#b45309" }),
    text({ x: 18, y: 190, value: "Verify dimensions, tolerances, datums, finish and applicable drafting standards before release.", size: 2.6, anchor: "start" }),
    text({ x: 279, y: 190, value: "SOURCE: " + escapeXml(input.sourceArtifactId), size: 2.4, anchor: "end" })
  ].join("");
}
function buildDrawingMarkup(input: ShaftOrthographicDrawingInput, drawingNumber: string, title: string): string {
  const scale = Math.min(170 / input.lengthMm, 42 / input.diameterMm);
  const header = text({ x: 18, y: 16, value: title, size: 5, anchor: "start" });
  const drawingId = text({ x: 279, y: 16, value: drawingNumber, size: 3.5, anchor: "end" });
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="0 0 297 210">',
    "<title>" + title + "</title>",
    "<desc>Preliminary orthographic side and end views of a cylindrical shaft. Not for manufacture.</desc>",
    buildDrawingFrame(), header, drawingId,
    buildSideView(input, scale), buildEndView(input, scale), buildDrawingNotes(input), "</svg>"
  ].join("");
}

export function generateShaftOrthographicSvgDrawing(input: ShaftOrthographicDrawingInput): GeneratedCADDrawing {
  validatePositiveDimension(input.diameterMm, "diameterMm");
  validatePositiveDimension(input.lengthMm, "lengthMm");
  validateSourceIdentity(input);
  const drawingNumber = validateLabel({ value: input.drawingNumber, name: "drawingNumber", maximum: 80 });
  const title = validateLabel({ value: input.title, name: "title", maximum: 120 });
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
