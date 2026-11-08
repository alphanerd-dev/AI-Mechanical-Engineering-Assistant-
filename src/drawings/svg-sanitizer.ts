const ALLOWED_TAGS = new Set([
  "svg", "g", "line", "polyline", "polygon", "path", "rect", "circle", "ellipse", "text", "title", "desc"
]);
const ALLOWED_ATTRIBUTES = new Set([
  "xmlns", "viewBox", "width", "height", "x", "y", "x1", "y1", "x2", "y2",
  "cx", "cy", "r", "rx", "ry", "points", "d", "fill", "stroke", "stroke-width",
  "stroke-linecap", "stroke-linejoin", "opacity", "fill-opacity", "stroke-opacity",
  "transform", "font-size", "text-anchor", "dominant-baseline"
]);

function safeAttribute(name: string, value: string): boolean {
  const lower = name.toLowerCase();
  if (!ALLOWED_ATTRIBUTES.has(name) || lower.startsWith("on") || lower === "style" ||
      lower === "href" || lower.endsWith(":href")) return false;
  if (/url\s*\(|javascript:|data:|https?:|file:|@import|expression\s*\(/i.test(value)) return false;
  if (name === "fill" || name === "stroke") {
    return /^(none|currentColor|#[0-9a-f]{3,8}|[a-z]{1,20})$/i.test(value);
  }
  if (name === "transform") return /^[a-z0-9(),.+\-\s]+$/i.test(value);
  if (name === "d") return /^[a-z0-9(),.+\-\s]+$/i.test(value);
  return value.length <= 10000;
}

/**
 * Sanitize SVG for image-only preview. Active content, foreignObject, style, links,
 * external resources and unknown elements are removed. This is not a general SVG editor.
 */
export function sanitizeSVG(markup: string): string {
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
  const visit = (element: Element) => {
    for (const child of Array.from(element.children)) {
      const tag = child.localName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        child.remove();
        continue;
      }
      for (const attribute of Array.from(child.attributes)) {
        if (!safeAttribute(attribute.name, attribute.value)) child.removeAttribute(attribute.name);
      }
      visit(child);
    }
    for (const attribute of Array.from(element.attributes)) {
      if (!safeAttribute(attribute.name, attribute.value)) element.removeAttribute(attribute.name);
    }
  };
  visit(document.documentElement);
  document.documentElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(document.documentElement);
}
