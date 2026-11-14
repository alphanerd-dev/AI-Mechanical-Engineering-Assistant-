import { parseDXF } from "./dxf.js";

export type CADDrawingFormat = "PDF" | "SVG" | "DXF";

type SVGTagName =
  | "svg" | "g" | "line" | "polyline" | "polygon" | "path"
  | "rect" | "circle" | "ellipse" | "text" | "title" | "desc";
type SVGAttributeName =
  | "xmlns" | "viewBox" | "width" | "height" | "x" | "y" | "x1" | "y1"
  | "x2" | "y2" | "cx" | "cy" | "r" | "rx" | "ry" | "points" | "d"
  | "fill" | "stroke" | "stroke-width" | "stroke-linecap" | "stroke-linejoin"
  | "opacity" | "fill-opacity" | "stroke-opacity" | "transform" | "font-size"
  | "text-anchor" | "dominant-baseline";

declare const svgAttributeValueBrand: unique symbol;
declare const svgMarkupBrand: unique symbol;
declare const drawingFilenameBrand: unique symbol;
declare const drawingMimeTypeBrand: unique symbol;
type SVGAttributeValue = string & { readonly [svgAttributeValueBrand]: true };
type SVGMarkup = string & { readonly [svgMarkupBrand]: true };
type DrawingFilename = string & { readonly [drawingFilenameBrand]: true };
type DrawingMimeType = string & { readonly [drawingMimeTypeBrand]: true };
export interface CADDrawingInspection {
  format: CADDrawingFormat;
  mediaType: "application/pdf" | "image/svg+xml" | "application/dxf";
  parserVersion: string;
  units?: string;
  entityCount?: number;
  bounds?: { minX: number; minY: number; maxX: number; maxY: number };
  warnings: string[];
}

const MAX_DRAWING_BYTES = 4 * 1024 * 1024;
const SVG_TAGS: ReadonlySet<SVGTagName> = new Set<SVGTagName>([
  "svg", "g", "line", "polyline", "polygon", "path", "rect", "circle", "ellipse", "text", "title", "desc"
]);
const SVG_ATTRIBUTES: ReadonlySet<SVGAttributeName> = new Set<SVGAttributeName>([
  "xmlns", "viewBox", "width", "height", "x", "y", "x1", "y1", "x2", "y2",
  "cx", "cy", "r", "rx", "ry", "points", "d", "fill", "stroke", "stroke-width",
  "stroke-linecap", "stroke-linejoin", "opacity", "fill-opacity", "stroke-opacity",
  "transform", "font-size", "text-anchor", "dominant-baseline"
]);

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Drawing must contain valid UTF-8 text.");
  }
}

function rejectUnsafeSVGMarkup(markup: string): void {
  if (/<!DOCTYPE|<!ENTITY|<\?|<script\b|<foreignObject\b|<iframe\b|<object\b|<embed\b|<image\b|<use\b|<style\b|<animate\b|<set\b/i.test(markup)) {
    throw new Error("SVG contains active, external, linked or unsupported XML content.");
  }
}

function parseSVGToken(token: string):
  | { kind: "comment" }
  | { kind: "text" }
  | { kind: "closing"; tag: SVGTagName }
  | { kind: "opening"; tag: SVGTagName; attributes: string; selfClosing: boolean } {
  if (!token.startsWith("<")) return { kind: "text" };
  if (/^<!--[\s\S]*-->$/.test(token)) return { kind: "comment" };
  const closing = /^<\/([A-Za-z][A-Za-z0-9]*)\s*>$/.exec(token);
  if (closing) return { kind: "closing", tag: closing[1].toLowerCase() as SVGTagName };
  const opening = /^<([A-Za-z][A-Za-z0-9]*)([\s\S]*?)\s*(\/?)>$/.exec(token);
  if (!opening) throw new Error("SVG contains malformed or unsupported XML markup.");
  return {
    kind: "opening",
    tag: opening[1].toLowerCase() as SVGTagName,
    attributes: opening[2],
    selfClosing: opening[3] === "/"
  };
}

interface SVGAttribute {
  name: SVGAttributeName;
  value: SVGAttributeValue;
}

interface SVGAttributeValidationContext {
  seenNames: Set<SVGAttributeName>;
}

function parseSVGAttributes(attributes: string): SVGAttribute[] {
  const pattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const parsed: SVGAttribute[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(attributes)) !== null) {
    parsed.push({
      name: match[1] as SVGAttributeName,
      value: (match[2] ?? match[3] ?? "") as SVGAttributeValue
    });
  }
  if (attributes.replace(pattern, "").trim()) throw new Error("SVG contains malformed or unsupported attributes.");
  return parsed;
}

function isAllowedSVGAttributeName(name: SVGAttributeName): boolean {
  return SVG_ATTRIBUTES.has(name);
}

function isSVGEventAttribute(name: SVGAttributeName): boolean {
  return name.toLowerCase().startsWith("on");
}

function validateSVGAttributeName(
  attribute: SVGAttribute,
  context: SVGAttributeValidationContext
): void {
  const { name } = attribute;
  if (!isAllowedSVGAttributeName(name)) throw new Error("SVG contains a disallowed attribute.");
  if (isSVGEventAttribute(name)) throw new Error("SVG event attributes are not supported.");
  if (context.seenNames.has(name)) throw new Error("SVG contains a duplicate attribute.");
  context.seenNames.add(name);
}

function isCanonicalSVGNamespace(attribute: SVGAttribute): boolean {
  return attribute.name === "xmlns" && attribute.value === "http://www.w3.org/2000/svg";
}

function validateSVGAttributeSecurity(attribute: SVGAttribute): void {
  if (!isCanonicalSVGNamespace(attribute) &&
      /url\s*\(|javascript:|data:|https?:|file:|@import|expression\s*\(/i.test(attribute.value)) {
    throw new Error("SVG contains an external or executable attribute value.");
  }
}

function validateSVGAttribute(attribute: SVGAttribute, context: SVGAttributeValidationContext): void {
  validateSVGAttributeName(attribute, context);
  validateSVGAttributeSecurity(attribute);
  validateSVGAttributeValue(attribute);
}

function validateSVGAttributes(attributes: string): void {
  const context: SVGAttributeValidationContext = { seenNames: new Set<SVGAttributeName>() };
  for (const attribute of parseSVGAttributes(attributes)) {
    validateSVGAttribute(attribute, context);
  }
}

function isSVGPaintAttribute(name: SVGAttributeName): boolean {
  return name === "fill" || name === "stroke";
}

function isSupportedSVGPaint(value: SVGAttributeValue): boolean {
  return /^(none|currentColor|#[0-9a-f]{3,8}|[a-z]{1,20})$/i.test(value);
}

function validateSVGPaintValue(attribute: SVGAttribute): void {
  if (!isSVGPaintAttribute(attribute.name)) return;
  if (!isSupportedSVGPaint(attribute.value)) throw new Error("SVG paint attribute is outside the safe preview subset.");
}

const SVG_GEOMETRY_ATTRIBUTES: ReadonlySet<SVGAttributeName> = new Set<SVGAttributeName>(["transform", "d"]);
const SVG_GEOMETRY_VALUE_PATTERN = /^[a-z0-9(),.+\-\s]+$/i;

function isSupportedSVGGeometrySyntax(value: SVGAttributeValue): boolean {
  return SVG_GEOMETRY_VALUE_PATTERN.test(value);
}

function validateSVGGeometryValue(attribute: SVGAttribute): void {
  if (!SVG_GEOMETRY_ATTRIBUTES.has(attribute.name)) return;
  if (!isSupportedSVGGeometrySyntax(attribute.value)) {
    throw new Error("SVG geometry attribute contains unsupported syntax.");
  }
}

function validateSVGAttributeValue(attribute: SVGAttribute): void {
  if (attribute.value.length > 10000) throw new Error("SVG attribute exceeds the safe preview limit.");
  validateSVGPaintValue(attribute);
  validateSVGGeometryValue(attribute);
}

function validateSVGText(token: string): void {
  if (/&(?!(?:amp|lt|gt|quot|apos);)/i.test(token)) {
    throw new Error("SVG contains an unsupported entity reference.");
  }
}

interface SVGValidationState {
  stack: SVGTagName[];
  rootSeen: boolean;
}

function closeSVGElement(tag: SVGTagName, state: SVGValidationState): void {
  if (state.stack.pop() !== tag) throw new Error("SVG element nesting is malformed.");
}

function openSVGElement(token: Extract<ReturnType<typeof parseSVGToken>, { kind: "opening" }>, state: SVGValidationState): void {
  if (!SVG_TAGS.has(token.tag)) throw new Error("SVG contains unsupported element " + token.tag + ".");
  if (!state.rootSeen) {
    if (token.tag !== "svg" || state.stack.length !== 0) throw new Error("SVG root element must be svg.");
    state.rootSeen = true;
  }
  validateSVGAttributes(token.attributes);
  if (!token.selfClosing) state.stack.push(token.tag);
}

function validateSVGToken(rawToken: string, state: SVGValidationState): void {
  const token = parseSVGToken(rawToken);
  if (token.kind === "comment") return;
  if (token.kind === "text") {
    validateSVGText(rawToken);
    return;
  }
  if (token.kind === "closing") {
    closeSVGElement(token.tag, state);
    return;
  }
  openSVGElement(token, state);
}

function validateSVGStructure(markup: SVGMarkup): void {
  const state: SVGValidationState = { stack: [], rootSeen: false };
  const tokens = markup.match(/<[^>]*>|[^<]+/g) ?? [];
  for (const token of tokens) validateSVGToken(token, state);
  if (!state.rootSeen || state.stack.length !== 0) throw new Error("SVG document is incomplete or malformed.");
}

function validateSVGRootOpening(markup: SVGMarkup): void {
  if (!/^\s*<svg(?:\s|>)/i.test(markup)) {
    throw new Error("SVG drawing must contain a complete svg root element.");
  }
}

function validateSVGRootClosing(markup: SVGMarkup): void {
  if (!/<\/svg\s*>/i.test(markup)) {
    throw new Error("SVG drawing must contain a complete svg root element.");
  }
}

function validateSVG(markup: SVGMarkup): void {
  if (!markup.trim()) throw new Error("SVG drawing must contain a complete svg root element.");
  validateSVGRootOpening(markup);
  validateSVGRootClosing(markup);
  rejectUnsafeSVGMarkup(markup);
  validateSVGStructure(markup);
}

type DrawingExtension = "pdf" | "svg" | "dxf" | "unknown";

interface DrawingInspectionContext {
  bytes: Uint8Array;
  extension: DrawingExtension;
  declaredMimeType: string;
  prefix: string;
}

const SUPPORTED_DXF_MEDIA_TYPES = new Set([
  "application/dxf",
  "image/vnd.dxf",
  "application/octet-stream"
]);

function extension(name: DrawingFilename): DrawingExtension {
  const base = name.split(/[\\/]/).pop() ?? "";
  const value = base.includes(".") ? base.split(".").pop()?.toLowerCase() : "";
  return value === "pdf" || value === "svg" || value === "dxf" ? value : "unknown";
}

function isSafeDrawingFilename(filename: DrawingFilename): boolean {
  if (!filename.trim()) return false;
  if (filename.length > 180) return false;
  if (/[\r\n\0]/.test(filename)) return false;
  return !filename.split(/[\\/]/).some(part => part === "..");
}

function validateDrawingFilename(filename: DrawingFilename): DrawingExtension {
  if (!isSafeDrawingFilename(filename)) throw new Error("Drawing filename is invalid.");
  return extension(filename);
}

function isPDFContent(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 5 && BufferlessPrefix(bytes, "%PDF-");
}

function validatePDFUploadMetadata(context: DrawingInspectionContext): void {
  const extensionMatches = context.extension === "pdf";
  const mediaTypeMatches = !context.declaredMimeType ||
    context.declaredMimeType === "application/pdf";
  if (!extensionMatches || !mediaTypeMatches) {
    throw new Error("PDF filename or media type does not match its content.");
  }
}

function validatePDFEndMarker(bytes: Uint8Array): void {
  const tail = new TextDecoder("latin1").decode(bytes.subarray(Math.max(0, bytes.length - 2048)));
  if (!tail.includes("%%EOF")) throw new Error("PDF drawing is missing its terminal EOF marker.");
}

function inspectPDF(context: DrawingInspectionContext): CADDrawingInspection | null {
  if (!isPDFContent(context.bytes)) return null;
  validatePDFUploadMetadata(context);
  validatePDFEndMarker(context.bytes);
  return {
    format: "PDF",
    mediaType: "application/pdf",
    parserVersion: "pdf-source-1",
    warnings: ["PDF is stored as an immutable source; page rendering is performed by the viewer."]
  };
}

function hasSVGRootPrefix(prefix: string): boolean {
  return /^<svg(?:\s|>)/i.test(prefix);
}

function validateSVGUploadMetadata(context: DrawingInspectionContext): void {
  const extensionMatches = context.extension === "svg";
  const mediaTypeMatches = !context.declaredMimeType ||
    context.declaredMimeType === "image/svg+xml";
  if (!extensionMatches || !mediaTypeMatches) {
    throw new Error("SVG filename or media type does not match its content.");
  }
}

function inspectSVG(context: DrawingInspectionContext): CADDrawingInspection | null {
  if (!hasSVGRootPrefix(context.prefix)) return null;
  validateSVGUploadMetadata(context);
  validateSVG(decodeUtf8(context.bytes));
  return {
    format: "SVG",
    mediaType: "image/svg+xml",
    parserVersion: "svg-safe-subset-1",
    warnings: ["SVG preview is sanitized again by the browser before rendering."]
  };
}

function inspectDXF(context: DrawingInspectionContext): CADDrawingInspection | null {
  if (context.extension !== "dxf") return null;
  if (context.declaredMimeType && !SUPPORTED_DXF_MEDIA_TYPES.has(context.declaredMimeType)) {
    throw new Error("DXF media type does not match the declared file format.");
  }
  const source = decodeUtf8(context.bytes);
  if (/[^\x09\x0a\x0d\x20-\x7e]/.test(source)) {
    throw new Error("DXF preview currently accepts ASCII-compatible text only.");
  }
  const parsed = parseDXF(source);
  return {
    format: "DXF",
    mediaType: "application/dxf",
    parserVersion: "dxf-preview-1",
    units: parsed.units,
    entityCount: parsed.entities.length,
    bounds: parsed.bounds,
    warnings: parsed.warnings
  };
}

function validateDrawingBytes(bytes: Uint8Array): void {
  if (!(bytes instanceof Uint8Array)) throw new Error("Drawing must contain 1 byte to 4 MiB.");
  if (bytes.byteLength < 1) throw new Error("Drawing must contain 1 byte to 4 MiB.");
  if (bytes.byteLength > MAX_DRAWING_BYTES) throw new Error("Drawing must contain 1 byte to 4 MiB.");
}

function createDrawingInspectionContext(input: {
  filename: string;
  declaredMimeType?: string;
  bytes: Uint8Array;
}): DrawingInspectionContext {
  return {
    bytes: input.bytes,
    extension: validateDrawingFilename(input.filename),
    declaredMimeType: input.declaredMimeType?.trim().toLowerCase() ?? "",
    prefix: new TextDecoder().decode(input.bytes.subarray(0, Math.min(input.bytes.length, 512))).trimStart()
  };
}

function inspectDrawingByFormat(context: DrawingInspectionContext): CADDrawingInspection | null {
  return inspectPDF(context) ?? inspectSVG(context) ?? inspectDXF(context);
}

function requireSupportedDrawingInspection(inspection: CADDrawingInspection | null): CADDrawingInspection {
  if (!inspection) {
    throw new Error("Unsupported drawing format. Accepted formats are PDF, safe-subset SVG and ASCII DXF.");
  }
  return inspection;
}

/** Inspect and strictly bound a source drawing before private project storage. */
export function inspectCADDrawingUpload(input: {
  filename: string;
  declaredMimeType?: string;
  bytes: Uint8Array;
}): CADDrawingInspection {
  validateDrawingBytes(input.bytes);
  const context = createDrawingInspectionContext(input);
  return requireSupportedDrawingInspection(inspectDrawingByFormat(context));
}

function BufferlessPrefix(bytes: Uint8Array, text: string): boolean {
  if (bytes.length < text.length) return false;
  for (let index = 0; index < text.length; index += 1) if (bytes[index] !== text.charCodeAt(index)) return false;
  return true;
}
