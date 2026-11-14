const ALLOWED_TAGS = new Set([
  "svg", "g", "line", "polyline", "polygon", "path", "rect", "circle", "ellipse", "text", "title", "desc"
]);
const ALLOWED_ATTRIBUTES = new Set([
  "xmlns", "viewBox", "width", "height", "x", "y", "x1", "y1", "x2", "y2",
  "cx", "cy", "r", "rx", "ry", "points", "d", "fill", "stroke", "stroke-width",
  "stroke-linecap", "stroke-linejoin", "opacity", "fill-opacity", "stroke-opacity",
  "transform", "font-size", "text-anchor", "dominant-baseline"
]);

function isSafeAttributeName({ name }: { name: string }): boolean {
  const lower = name.toLowerCase();
  if (!ALLOWED_ATTRIBUTES.has(name)) return false;
  if (lower.startsWith("on")) return false;
  if (lower === "style") return false;
  if (lower === "href") return false;
  if (lower.endsWith(":href")) return false;
  return true;
}

function isSafeReferenceFreeValue({ value }: { value: string }): boolean {
  return !/url\s*\(|javascript:|data:|https?:|file:|@import|expression\s*\(/i.test(value);
}

function isSafePaintValue({ name, value }: { name: string; value: string }): boolean {
  if (name !== "fill" && name !== "stroke") return true;
  return /^(none|currentColor|#[0-9a-f]{3,8}|[a-z]{1,20})$/i.test(value);
}

function isSafeGeometryValue({ name, value }: { name: string; value: string }): boolean {
  if (name !== "transform" && name !== "d") return value.length <= 10000;
  return /^[a-z0-9(),.+\-\s]+$/i.test(value);
}

function safeAttribute({ name, value }: { name: string; value: string }): boolean {
  if (!isSafeAttributeName({ name })) return false;
  if (!isSafeReferenceFreeValue({ value })) return false;
  if (!isSafePaintValue({ name, value })) return false;
  return isSafeGeometryValue({ name, value });
}

function sanitizeAttributes(element: Element): void {
  for (const attribute of Array.from(element.attributes)) {
    if (!safeAttribute({ name: attribute.name, value: attribute.value })) element.removeAttribute(attribute.name);
  }
}

function sanitizeChildren(element: Element): void {
  for (const child of Array.from(element.children)) {
    if (!ALLOWED_TAGS.has(child.localName.toLowerCase())) {
      child.remove();
      continue;
    }
    sanitizeAttributes(child);
    sanitizeChildren(child);
  }
}

function assertBrowserXmlSupport(): void {
  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    throw new Error("SVG preview requires a browser XML parser.");
  }
}

function assertMarkupSize({ markup }: { markup: string }): void {
  if (!markup || new TextEncoder().encode(markup).byteLength > 10 * 1024 * 1024) {
    throw new Error("SVG must contain 1 byte to 10 MiB.");
  }
}

function isSvgDocument(document: XMLDocument): boolean {
  const root = document.documentElement;
  return !document.querySelector("parsererror") && root.localName.toLowerCase() === "svg";
}

function parseSVGDocument({ markup }: { markup: string }): XMLDocument {
  assertBrowserXmlSupport();
  assertMarkupSize({ markup });
  const document = new DOMParser().parseFromString(markup, "image/svg+xml");
  if (!isSvgDocument(document)) throw new Error("The drawing is not well-formed SVG.");
  return document;
}

/**
 * Sanitize SVG for image-only preview. Active content, foreignObject, style, links,
 * external resources and unknown elements are removed. This is not a general SVG editor.
 */
export function sanitizeSVG(markup: string): string {
  const document = parseSVGDocument({ markup });
  sanitizeAttributes(document.documentElement);
  sanitizeChildren(document.documentElement);
  document.documentElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(document.documentElement);
}
