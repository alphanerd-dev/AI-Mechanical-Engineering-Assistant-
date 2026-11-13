import { parseDXF } from "./dxf.js";

export type CADDrawingFormat = "PDF" | "SVG" | "DXF";
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
const SVG_TAGS = new Set(["svg", "g", "line", "polyline", "polygon", "path", "rect", "circle", "ellipse", "text", "title", "desc"]);
const SVG_ATTRIBUTES = new Set([
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
  | { kind: "closing"; tag: string }
  | { kind: "opening"; tag: string; attributes: string; selfClosing: boolean } {
  if (!token.startsWith("<")) return { kind: "text" };
  if (/^<!--[\s\S]*-->$/.test(token)) return { kind: "comment" };
  const closing = /^<\/([A-Za-z][A-Za-z0-9]*)\s*>$/.exec(token);
  if (closing) return { kind: "closing", tag: closing[1].toLowerCase() };
  const opening = /^<([A-Za-z][A-Za-z0-9]*)([\s\S]*?)\s*(\/?)>$/.exec(token);
  if (!opening) throw new Error("SVG contains malformed or unsupported XML markup.");
  return {
    kind: "opening",
    tag: opening[1].toLowerCase(),
    attributes: opening[2],
    selfClosing: opening[3] === "/"
  };
}

function parseSVGAttributes(attributes: string): Array<{ name: string; value: string }> {
  const pattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const parsed: Array<{ name: string; value: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(attributes)) !== null) {
    parsed.push({ name: match[1], value: match[2] ?? match[3] ?? "" });
  }
  if (attributes.replace(pattern, "").trim()) throw new Error("SVG contains malformed or unsupported attributes.");
  return parsed;
}

function isAllowedSVGAttributeName(name: string): boolean {
  return SVG_ATTRIBUTES.has(name);
}

function isSVGEventAttribute(name: string): boolean {
  return name.toLowerCase().startsWith("on");
}

function validateSVGAttributeName(name: string, seen: Set<string>): void {
  if (!isAllowedSVGAttributeName(name)) throw new Error("SVG contains a disallowed attribute.");
  if (isSVGEventAttribute(name)) throw new Error("SVG event attributes are not supported.");
  if (seen.has(name)) throw new Error("SVG contains a duplicate attribute.");
  seen.add(name);
}

function isCanonicalSVGNamespace(name: string, value: string): boolean {
  return name === "xmlns" && value === "http://www.w3.org/2000/svg";
}

function validateSVGAttributeSecurity(name: string, value: string): void {
  if (!isCanonicalSVGNamespace(name, value) &&
      /url\s*\(|javascript:|data:|https?:|file:|@import|expression\s*\(/i.test(value)) {
    throw new Error("SVG contains an external or executable attribute value.");
  }
}

function validateSVGAttribute(name: string, value: string, seen: Set<string>): void {
  validateSVGAttributeName(name, seen);
  validateSVGAttributeSecurity(name, value);
  validateSVGAttributeValue(name, value);
}

function validateSVGAttributes(attributes: string): void {
  const seen = new Set<string>();
  for (const attribute of parseSVGAttributes(attributes)) {
    validateSVGAttribute(attribute.name, attribute.value, seen);
  }
}

function validateSVGPaintValue(name: string, value: string): void {
  if ((name === "fill" || name === "stroke") && !/^(none|currentColor|#[0-9a-f]{3,8}|[a-z]{1,20})$/i.test(value)) {
    throw new Error("SVG paint attribute is outside the safe preview subset.");
  }
}

function validateSVGGeometryValue(name: string, value: string): void {
  if ((name === "transform" || name === "d") && !/^[a-z0-9(),.+\-\s]+$/i.test(value)) {
    throw new Error("SVG geometry attribute contains unsupported syntax.");
  }
}

function validateSVGAttributeValue(name: string, value: string): void {
  if (value.length > 10000) throw new Error("SVG attribute exceeds the safe preview limit.");
  validateSVGPaintValue(name, value);
  validateSVGGeometryValue(name, value);
}

function validateSVGText(token: string): void {
  if (/&(?!(?:amp|lt|gt|quot|apos);)/i.test(token)) {
    throw new Error("SVG contains an unsupported entity reference.");
  }
}

interface SVGValidationState {
  stack: string[];
  rootSeen: boolean;
}

function closeSVGElement(tag: string, state: SVGValidationState): void {
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

function validateSVGStructure(markup: string): void {
  const state: SVGValidationState = { stack: [], rootSeen: false };
  const tokens = markup.match(/<[^>]*>|[^<]+/g) ?? [];
  for (const token of tokens) validateSVGToken(token, state);
  if (!state.rootSeen || state.stack.length !== 0) throw new Error("SVG document is incomplete or malformed.");
}

function validateSVG(markup: string): void {
  if (!markup.trim() || !/^\s*<svg(?:\s|>)/i.test(markup) || !/<\/svg\s*>/i.test(markup)) {
    throw new Error("SVG drawing must contain a complete svg root element.");
  }
  rejectUnsafeSVGMarkup(markup);
  validateSVGStructure(markup);
}

function extension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
}

function validateDrawingFilename(filename: string): string {
  if (!filename.trim() || filename.length > 180 || /[\r\n\0]/.test(filename) ||
      filename.split(/[\\/]/).some((part) => part === "..")) {
    throw new Error("Drawing filename is invalid.");
  }
  return extension(filename);
}

function isPDFContent(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 5 && BufferlessPrefix(bytes, "%PDF-");
}

function validatePDFUploadMetadata(extension: string, declaredMimeType: string): void {
  if (extension !== "pdf" || (declaredMimeType && declaredMimeType !== "application/pdf")) {
    throw new Error("PDF filename or media type does not match its content.");
  }
}

function validatePDFEndMarker(bytes: Uint8Array): void {
  const tail = new TextDecoder("latin1").decode(bytes.subarray(Math.max(0, bytes.length - 2048)));
  if (!tail.includes("%%EOF")) throw new Error("PDF drawing is missing its terminal EOF marker.");
}

function inspectPDF(input: { bytes: Uint8Array; extension: string; declaredMimeType: string }): CADDrawingInspection | null {
  if (!isPDFContent(input.bytes)) return null;
  validatePDFUploadMetadata(input.extension, input.declaredMimeType);
  validatePDFEndMarker(input.bytes);
  return {
    format: "PDF", mediaType: "application/pdf", parserVersion: "pdf-source-1",
    warnings: ["PDF is stored as an immutable source; page rendering is performed by the viewer."]
  };
}

function inspectSVG(bytes: Uint8Array, ext: string, declared: string, prefix: string): CADDrawingInspection | null {
  if (!/^<svg(?:\s|>)/i.test(prefix)) return null;
  if (ext !== "svg" || (declared && declared !== "image/svg+xml")) {
    throw new Error("SVG filename or media type does not match its content.");
  }
  validateSVG(decodeUtf8(bytes));
  return {
    format: "SVG", mediaType: "image/svg+xml", parserVersion: "svg-safe-subset-1",
    warnings: ["SVG preview is sanitized again by the browser before rendering."]
  };
}

function inspectDXF(bytes: Uint8Array, ext: string, declared: string): CADDrawingInspection | null {
  const supportedTypes = ["application/dxf", "image/vnd.dxf", "application/octet-stream"];
  if (ext !== "dxf") return null;
  if (declared && !supportedTypes.includes(declared)) {
    throw new Error("DXF media type does not match the declared file format.");
  }
  const source = decodeUtf8(bytes);
  if (/[^\x09\x0a\x0d\x20-\x7e]/.test(source)) {
    throw new Error("DXF preview currently accepts ASCII-compatible text only.");
  }
  const parsed = parseDXF(source);
  return {
    format: "DXF", mediaType: "application/dxf", parserVersion: "dxf-preview-1",
    units: parsed.units, entityCount: parsed.entities.length, bounds: parsed.bounds, warnings: parsed.warnings
  };
}

/** Inspect and strictly bound a source drawing before private project storage. */
export function inspectCADDrawingUpload(input: {
  filename: string;
  declaredMimeType?: string;
  bytes: Uint8Array;
}): CADDrawingInspection {
  const { filename, bytes } = input;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > MAX_DRAWING_BYTES) {
    throw new Error("Drawing must contain 1 byte to 4 MiB.");
  }
  const ext = validateDrawingFilename(filename);
  const declared = input.declaredMimeType?.trim().toLowerCase() ?? "";
  const prefix = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 512))).trimStart();
  const inspection = inspectPDF({ bytes, extension: ext, declaredMimeType: declared }) ??
    inspectSVG(bytes, ext, declared, prefix) ??
    inspectDXF(bytes, ext, declared);
  if (!inspection) throw new Error("Unsupported drawing format. Accepted formats are PDF, safe-subset SVG and ASCII DXF.");
  return inspection;
}

function BufferlessPrefix(bytes: Uint8Array, text: string): boolean {
  if (bytes.length < text.length) return false;
  for (let index = 0; index < text.length; index += 1) if (bytes[index] !== text.charCodeAt(index)) return false;
  return true;
}
