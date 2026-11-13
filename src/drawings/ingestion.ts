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

function validateSVG(markup: string): void {
  if (!markup.trim() || !/<svg(?:\s|>)/i.test(markup) || !/<\/svg\s*>/i.test(markup)) {
    throw new Error("SVG drawing must contain a complete svg root element.");
  }
  if (/<!DOCTYPE|<!ENTITY|<\?|<script\b|<foreignObject\b|<iframe\b|<object\b|<embed\b|<image\b|<use\b|<style\b|<animate\b|<set\b/i.test(markup)) {
    throw new Error("SVG contains active, external, linked or unsupported XML content.");
  }
  const tokens = markup.match(/<[^>]*>|[^<]+/g) ?? [];
  const stack: string[] = [];
  let rootSeen = false;
  for (const token of tokens) {
    if (!token.startsWith("<")) {
      if (/&(?!(?:amp|lt|gt|quot|apos);)/i.test(token)) throw new Error("SVG contains an unsupported entity reference.");
      continue;
    }
    if (/^<!--[\s\S]*-->$/.test(token)) continue;
    const closing = /^<\/([A-Za-z][A-Za-z0-9]*)\s*>$/.exec(token);
    if (closing) {
      const tag = closing[1].toLowerCase();
      if (stack.pop() !== tag) throw new Error("SVG element nesting is malformed.");
      continue;
    }
    const opening = /^<([A-Za-z][A-Za-z0-9]*)([\s\S]*?)\s*(\/?)>$/.exec(token);
    if (!opening) throw new Error("SVG contains malformed or unsupported XML markup.");
    const tag = opening[1].toLowerCase();
    if (!SVG_TAGS.has(tag)) throw new Error("SVG contains unsupported element " + tag + ".");
    if (!rootSeen) {
      if (tag !== "svg" || stack.length !== 0) throw new Error("SVG root element must be svg.");
      rootSeen = true;
    }
    const attributes = opening[2];
    const attributePattern = /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let match: RegExpExecArray | null;
    let consumed = "";
    const seen = new Set<string>();
    while ((match = attributePattern.exec(attributes)) !== null) {
      consumed += match[0];
      const name = match[1];
      const value = match[2] ?? match[3] ?? "";
      if (!SVG_ATTRIBUTES.has(name) || name.toLowerCase().startsWith("on") || seen.has(name)) {
        throw new Error("SVG contains a disallowed or duplicate attribute.");
      }
      seen.add(name);
      if (!(name === "xmlns" && value === "http://www.w3.org/2000/svg") && /url\s*\(|javascript:|data:|https?:|file:|@import|expression\s*\(/i.test(value)) {
        throw new Error("SVG contains an external or executable attribute value.");
      }
      if ((name === "fill" || name === "stroke") && !/^(none|currentColor|#[0-9a-f]{3,8}|[a-z]{1,20})$/i.test(value)) {
        throw new Error("SVG paint attribute is outside the safe preview subset.");
      }
      if ((name === "transform" || name === "d") && !/^[a-z0-9(),.+\-\s]+$/i.test(value)) {
        throw new Error("SVG geometry attribute contains unsupported syntax.");
      }
      if (value.length > 10000) throw new Error("SVG attribute exceeds the safe preview limit.");
    }
    if (attributes.replace(attributePattern, "").trim()) throw new Error("SVG contains malformed or unsupported attributes.");
    if (opening[3] !== "/") stack.push(tag);
  }
  if (!rootSeen || stack.length !== 0) throw new Error("SVG document is incomplete or malformed.");
}

function extension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
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
  if (typeof filename !== "string" || !filename.trim() || filename.length > 180 ||
      /[\r\n\0]/.test(filename) || filename.split(/[\\/]/).some((part) => part === "..")) {
    throw new Error("Drawing filename is invalid.");
  }
  const ext = extension(filename);
  const declared = input.declaredMimeType?.trim().toLowerCase() ?? "";
  if (bytes.byteLength >= 5 && BufferlessPrefix(bytes, "%PDF-")) {
    if (ext !== "pdf" || (declared && declared !== "application/pdf")) throw new Error("PDF filename or media type does not match its content.");
    const tail = new TextDecoder("latin1").decode(bytes.subarray(Math.max(0, bytes.length - 2048)));
    if (!tail.includes("%%EOF")) throw new Error("PDF drawing is missing its terminal EOF marker.");
    return { format: "PDF", mediaType: "application/pdf", parserVersion: "pdf-source-1", warnings: ["PDF is stored as an immutable source; page rendering is performed by the viewer."] };
  }
  const prefix = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 512))).trimStart();
  if (/^<svg(?:\s|>)/i.test(prefix)) {
    if (ext !== "svg" || (declared && declared !== "image/svg+xml")) throw new Error("SVG filename or media type does not match its content.");
    const markup = decodeUtf8(bytes);
    validateSVG(markup);
    return { format: "SVG", mediaType: "image/svg+xml", parserVersion: "svg-safe-subset-1", warnings: ["SVG preview is sanitized again by the browser before rendering."] };
  }
  if (ext === "dxf" && (!declared || ["application/dxf", "image/vnd.dxf", "application/octet-stream"].includes(declared))) {
    if (declared && !["application/dxf", "image/vnd.dxf", "application/octet-stream"].includes(declared)) {
      throw new Error("DXF media type does not match the declared file format.");
    }
    const source = decodeUtf8(bytes);
    if (/[^\x09\x0a\x0d\x20-\x7e]/.test(source)) throw new Error("DXF preview currently accepts ASCII-compatible text only.");
    const parsed = parseDXF(source);
    return {
      format: "DXF", mediaType: "application/dxf", parserVersion: "dxf-preview-1",
      units: parsed.units, entityCount: parsed.entities.length, bounds: parsed.bounds, warnings: parsed.warnings
    };
  }
  throw new Error("Unsupported drawing format. Accepted formats are PDF, safe-subset SVG and ASCII DXF.");
}

function BufferlessPrefix(bytes: Uint8Array, text: string): boolean {
  if (bytes.length < text.length) return false;
  for (let index = 0; index < text.length; index += 1) if (bytes[index] !== text.charCodeAt(index)) return false;
  return true;
}
