const ALLOWED_TAGS = new Set([
  "svg", "g", "line", "polyline", "polygon", "path", "rect", "circle", "ellipse", "text", "title", "desc"
]);
const ALLOWED_ATTRIBUTES = new Set([
  "xmlns", "viewBox", "width", "height", "x", "y", "x1", "y1", "x2", "y2",
  "cx", "cy", "r", "rx", "ry", "points", "d", "fill", "stroke", "stroke-width",
  "stroke-linecap", "stroke-linejoin", "opacity", "fill-opacity", "stroke-opacity",
  "transform", "font-size", "text-anchor", "dominant-baseline"
]);

function isSafeAttributeName(name: string): boolean {
  const lower = name.toLowerCase();
  return ALLOWED_ATTRIBUTES.has(name) && !lower.startsWith("on") &&
    lower !== "style" && lower !== "href" && !lower.endsWith(":href");
}

function isSafeReferenceFreeValue(value: string): boolean {
  return !/url\\s*\\(|javascript:|data:|https?:|file:|@import|expression\\s*\\(/i.test(value);
}

function isSafePaintValue(name: string, value: string): boolean {
  return (name !== "fill" && name !== "stroke") ||
    /^(none|currentColor|#[0-9a-f]{3,8}|[a-z]{1,20})$/i.test(value);
}

function isSafeGeometryValue(name: string, value: string): boolean {
  const needsGeometrySyntax = name === "transform" || name === "d";
  return needsGeometrySyntax
    ? /^[a-z0-9(),.+\\-\\s]+$/i.test(value)
    : value.length <= 10000;
}

function safeAttribute(name: string, value: string): boolean {
  return isSafeAttributeName(name) &&
    isSafeReferenceFreeValue(value) &&
    isSafePaintValue(name, value) &&
    isSafeGeometryValue(name, value);
}

function sanitizeAttributes(element: Element): void {
  for (const attribute of Array.from(element.attributes)) {
    if (!safeAttribute(attribute.name, attribute.value)) element.removeAttribute(attribute.name);
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

function parseSVGDocument(markup: string): XMLDocument {
  if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
    throw new Error("SVG preview requires a browser XML parser.");
  }
  if (!markup || new TextEncoder().encode(markup).byteLength > 10 * 1024 * 1024) {
    throw new Error("SVG must contain 1 byte to 10 MiB.");
  }
  const document = new DOMParser().parseFromString(markup, "image/svg+xml");
  if (document.querySelector("parsererror") || document.documentElement.localName.toLowerCase() !== "svg") {
    throw new Error("The drawing is not well-formed SVG.");
  }
  return document;
}

/**
 * Sanitize SVG for image-only preview. Active content, foreignObject, style, links,
 * external resources and unknown elements are removed. This is not a general SVG editor.
 */
export function sanitizeSVG(markup: string): string {
  const document = parseSVGDocument(markup);
  sanitizeAttributes(document.documentElement);
  sanitizeChildren(document.documentElement);
  document.documentElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(document.documentElement);
}
