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
    drawingNumber: string; title: string; diameterMm: number; lengthMm: number;
    sourceGeometryRevisionId: string; sourceArtifactId: string; sourceArtifactSha256: string;
    sourceRevisionNumber: number; projection: "ORTHOGRAPHIC";
  };
  svg: string; bytes: Uint8Array; sha256: string;
}
interface DrawingLine { x1: number; y1: number; x2: number; y2: number; stroke?: string; width?: number; }
interface DrawingText { x: number; y: number; value: string; size?: number; anchor?: string; fill?: string; }
interface DrawingLabels { drawingNumber: string; title: string; }
const PAGE_WIDTH_MM = 297;
const PAGE_HEIGHT_MM = 210;
const MAX_DIMENSION_MM = 100_000;
const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateFiniteDimension(input: { value: number; name: string }): void {
  if (!Number.isFinite(input.value)) throw new Error(input.name + " must be finite.");
}
function validatePositiveDimension(input: { value: number; name: string }): void {
  if (input.value <= 0) throw new Error(input.name + " must be positive.");
}
function validateMaximumDimension(input: { value: number; name: string }): void {
  if (input.value > MAX_DIMENSION_MM) throw new Error(input.name + " must not exceed 100000 mm.");
}
function validateDimensions(input: ShaftOrthographicDrawingInput): void {
  validateFiniteDimension({ value: input.diameterMm, name: "diameterMm" });
  validateFiniteDimension({ value: input.lengthMm, name: "lengthMm" });
  validatePositiveDimension({ value: input.diameterMm, name: "diameterMm" });
  validatePositiveDimension({ value: input.lengthMm, name: "lengthMm" });
  validateMaximumDimension({ value: input.diameterMm, name: "diameterMm" });
  validateMaximumDimension({ value: input.lengthMm, name: "lengthMm" });
}
function validateSourceRevisionId(value: string): void {
  if (!UUID.test(value)) throw new Error("A valid source geometry revision ID is required.");
}
function validateSourceArtifact(input: { id: string; sha256: string }): void {
  if (!input.id.trim() || input.id.length > 160) throw new Error("A valid source artifact ID is required.");
  if (!SHA256.test(input.sha256)) throw new Error("A valid source artifact SHA-256 digest is required.");
}
function validateSourceRevisionNumber(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("A positive source revision number is required.");
}
function validateSourceIdentity(input: ShaftOrthographicDrawingInput): void {
  validateSourceRevisionId(input.sourceGeometryRevisionId);
  validateSourceArtifact({ id: input.sourceArtifactId, sha256: input.sourceArtifactSha256 });
  validateSourceRevisionNumber(input.sourceRevisionNumber);
}
function escapeXmlLabel(input: { value: string }): string {
  return input.value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function validateRequiredLabel(input: { value: string; name: string }): string {
  const value = input.value.trim();
  if (!value) throw new Error(input.name + " is required.");
  return value;
}
function validateLabelLength(input: { value: string; name: string; maximum: number }): void {
  if (input.value.length > input.maximum) throw new Error(input.name + " is too long.");
}
function validateDrawingNumberCharacters(value: string): void {
  if (/[\x00-\x1f\x7f\\/]/.test(value)) throw new Error("drawingNumber contains unsafe characters.");
}
function validateTitleCharacters(value: string): void {
  if (/[\x00-\x1f\x7f]/.test(value)) throw new Error("title contains control characters.");
}
function validateLabels(input: ShaftOrthographicDrawingInput): DrawingLabels {
  const drawingNumber = validateRequiredLabel({ value: input.drawingNumber, name: "drawingNumber" });
  const title = validateRequiredLabel({ value: input.title, name: "title" });
  validateLabelLength({ value: drawingNumber, name: "drawingNumber", maximum: 80 });
  validateLabelLength({ value: title, name: "title", maximum: 120 });
  validateDrawingNumberCharacters(drawingNumber);
  validateTitleCharacters(title);
  return { drawingNumber: escapeXmlLabel({ value: drawingNumber }), title: escapeXmlLabel({ value: title }) };
}

class ShaftOrthographicRenderer {
  private readonly scale: number;
  constructor(
    private readonly input: ShaftOrthographicDrawingInput,
    private readonly labels: DrawingLabels
  ) {
    this.scale = Math.min(170 / input.lengthMm, 42 / input.diameterMm);
  }
  private line(spec: DrawingLine): string {
    const stroke = spec.stroke ?? "#172b3a";
    const width = spec.width ?? 0.35;
    return '<line x1="' + spec.x1.toFixed(2) + '" y1="' + spec.y1.toFixed(2) +
      '" x2="' + spec.x2.toFixed(2) + '" y2="' + spec.y2.toFixed(2) +
      '" stroke="' + stroke + '" stroke-width="' + width + '"/>';
  }
  private text(spec: DrawingText): string {
    const size = spec.size ?? 3.4;
    const anchor = spec.anchor ?? "middle";
    const fill = spec.fill ?? "#172b3a";
    return '<text x="' + spec.x.toFixed(2) + '" y="' + spec.y.toFixed(2) +
      '" font-size="' + size.toFixed(2) + '" text-anchor="' + anchor +
      '" fill="' + fill + '">' + spec.value + '</text>';
  }
  private sideView(): string {
    const x = 48;
    const y = 76;
    const length = this.input.lengthMm * this.scale;
    const diameter = this.input.diameterMm * this.scale;
    const right = x + length;
    const bottom = y + diameter;
    const radius = diameter / 2;
    const dimensionY = bottom + 20;
    return [
      '<rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + length.toFixed(2) +
        '" height="' + diameter.toFixed(2) + '" fill="none" stroke="#172b3a" stroke-width="0.55"/>',
      this.line({ x1: x - 3, y1: y + radius, x2: right + 3, y2: y + radius, stroke: "#42a99b", width: 0.25 }),
      this.text({ x: x + length / 2, y: y - 7, value: "SIDE VIEW", size: 3.2 }),
      this.line({ x1: x, y1: bottom + 2, x2: x, y2: dimensionY + 3, stroke: "#64748b", width: 0.22 }),
      this.line({ x1: right, y1: bottom + 2, x2: right, y2: dimensionY + 3, stroke: "#64748b", width: 0.22 }),
      this.line({ x1: x, y1: dimensionY, x2: right, y2: dimensionY, width: 0.28 }),
      this.line({ x1: x, y1: dimensionY - 2, x2: x, y2: dimensionY + 2, width: 0.28 }),
      this.line({ x1: right, y1: dimensionY - 2, x2: right, y2: dimensionY + 2, width: 0.28 }),
      this.text({ x: x + length / 2, y: dimensionY - 2.5, value: "L = " + this.input.lengthMm.toFixed(2) + " mm", size: 3.4 })
    ].join("");
  }
  private endView(): string {
    const centerX = 264;
    const centerY = 76 + this.input.diameterMm * this.scale / 2;
    const radius = this.input.diameterMm * this.scale / 2;
    return [
      '<circle cx="' + centerX.toFixed(2) + '" cy="' + centerY.toFixed(2) + '" r="' + radius.toFixed(2) +
        '" fill="none" stroke="#172b3a" stroke-width="0.55"/>',
      this.line({ x1: centerX - radius - 3, y1: centerY, x2: centerX + radius + 3, y2: centerY, stroke: "#42a99b", width: 0.25 }),
      this.line({ x1: centerX, y1: centerY - radius - 3, x2: centerX, y2: centerY + radius + 3, stroke: "#42a99b", width: 0.25 }),
      this.text({ x: centerX, y: 69, value: "END VIEW", size: 3.2 }),
      this.line({ x1: centerX - radius - 5, y1: centerY - radius, x2: centerX - radius - 5, y2: centerY + radius, width: 0.28 }),
      this.line({ x1: centerX - radius - 7, y1: centerY - radius, x2: centerX - radius - 3, y2: centerY - radius, width: 0.28 }),
      this.line({ x1: centerX - radius - 7, y1: centerY + radius, x2: centerX - radius - 3, y2: centerY + radius, width: 0.28 }),
      this.text({ x: centerX - radius - 9, y: centerY, value: "Ø " + this.input.diameterMm.toFixed(2) + " mm", size: 3.2, anchor: "end" })
    ].join("");
  }
  private frame(): string {
    return [
      '<rect x="8" y="8" width="281" height="194" fill="none" stroke="#64748b" stroke-width="0.25"/>',
      this.line({ x1: 8, y1: 24, x2: 289, y2: 24, stroke: "#64748b", width: 0.25 }),
      this.line({ x1: 8, y1: 158, x2: 289, y2: 158, stroke: "#64748b", width: 0.25 }),
      this.line({ x1: 8, y1: 186, x2: 289, y2: 186, stroke: "#64748b", width: 0.25 })
    ].join("");
  }
  private notes(): string {
    return [
      this.text({ x: 18, y: 166, value: "UNITS: mm", size: 3.2, anchor: "start" }),
      this.text({ x: 18, y: 174, value: "NOMINAL DIMENSIONS FROM ACCEPTED GEOMETRY REVISION " + this.input.sourceRevisionNumber, size: 3, anchor: "start" }),
      this.text({ x: 18, y: 182, value: "PRELIMINARY — NOT FOR MANUFACTURE", size: 4, anchor: "start", fill: "#b45309" }),
      this.text({ x: 18, y: 190, value: "Verify dimensions, tolerances, datums, finish and applicable drafting standards before release.", size: 2.6, anchor: "start" }),
      this.text({ x: 279, y: 190, value: "SOURCE: " + escapeXmlLabel({ value: this.input.sourceArtifactId }), size: 2.4, anchor: "end" })
    ].join("");
  }
  render(): string {
    return [
      '<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="0 0 297 210">',
      "<title>" + this.labels.title + "</title>",
      "<desc>Preliminary orthographic side and end views of a cylindrical shaft. Not for manufacture.</desc>",
      this.frame(),
      this.text({ x: 18, y: 16, value: this.labels.title, size: 5, anchor: "start" }),
      this.text({ x: 279, y: 16, value: this.labels.drawingNumber, size: 3.5, anchor: "end" }),
      this.sideView(), this.endView(), this.notes(), "</svg>"
    ].join("");
  }
}
export function generateShaftOrthographicSvgDrawing(input: ShaftOrthographicDrawingInput): GeneratedCADDrawing {
  validateDimensions(input);
  validateSourceIdentity(input);
  const labels = validateLabels(input);
  const svg = new ShaftOrthographicRenderer(input, labels).render();
  const bytes = new TextEncoder().encode(svg);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const entityCount = (svg.match(/<(?:line|rect|circle|text)\b/g) ?? []).length;
  return {
    format: "SVG", mediaType: "image/svg+xml", parserVersion: "svg-safe-subset-1",
    generatorId: SHAFT_ORTHOGRAPHIC_DRAWING_GENERATOR_ID,
    generatorVersion: SHAFT_ORTHOGRAPHIC_DRAWING_GENERATOR_VERSION,
    units: "mm", entityCount,
    bounds: { minX: 0, minY: 0, maxX: PAGE_WIDTH_MM, maxY: PAGE_HEIGHT_MM },
    warnings: [
      "PRELIMINARY: not for manufacture or inspection release.",
      "Only nominal diameter and length are dimensioned; tolerances, datums, surface finish, GD&T and standards compliance are not provided.",
      "Dimensions are sourced from the accepted geometry revision; independently verify drawing and model before downstream use."
    ],
    parameters: {
      drawingNumber: input.drawingNumber.trim(), title: input.title.trim(),
      diameterMm: input.diameterMm, lengthMm: input.lengthMm,
      sourceGeometryRevisionId: input.sourceGeometryRevisionId,
      sourceArtifactId: input.sourceArtifactId,
      sourceArtifactSha256: input.sourceArtifactSha256,
      sourceRevisionNumber: input.sourceRevisionNumber, projection: "ORTHOGRAPHIC"
    },
    svg, bytes, sha256
  };
}
