export type DXFEntity =
  | { type: "LINE"; layer: string; x1: number; y1: number; x2: number; y2: number }
  | { type: "CIRCLE"; layer: string; x: number; y: number; radius: number }
  | { type: "ARC"; layer: string; x: number; y: number; radius: number; startDegrees: number; endDegrees: number }
  | { type: "LWPOLYLINE"; layer: string; points: Array<[number, number]>; closed: boolean }
  | { type: "TEXT"; layer: string; x: number; y: number; height: number; value: string };

export interface DXFBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface DXFDocument {
  entities: DXFEntity[];
  units: string;
  bounds: DXFBounds;
  warnings: string[];
}

const MAX_DXF_BYTES = 8 * 1024 * 1024;
const MAX_ENTITIES = 10000;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const numberAt = (groups: Array<[number, string]>, code: number, fallback = NaN): number => {
  const pair = groups.find((entry) => entry[0] === code);
  return pair ? Number(pair[1]) : fallback;
};
const allNumbers = (groups: Array<[number, string]>, code: number): number[] =>
  groups.filter((entry) => entry[0] === code).map((entry) => Number(entry[1]));
const layerOf = (groups: Array<[number, string]>): string =>
  (groups.find((entry) => entry[0] === 8)?.[1] ?? "0").slice(0, 128);

function parsePairs(source: string): Array<[number, string]> {
  const lines = source.replace(/\r/g, "").split("\n");
  const pairs: Array<[number, string]> = [];
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const codeText = lines[index].trim();
    if (!codeText) continue;
    const code = Number(codeText);
    if (!Number.isInteger(code) || code < 0 || code > 1071) {
      throw new Error("DXF contains an invalid group code at line " + (index + 1) + ".");
    }
    pairs.push([code, lines[index + 1].trimEnd()]);
  }
  if (lines.slice(pairs.length * 2).some((line) => line.trim())) {
    throw new Error("DXF contains an incomplete group-code pair.");
  }
  return pairs;
}

function readUnits(pairs: Array<[number, string]>): string {
  const index = pairs.findIndex((pair) => pair[0] === 9 && pair[1].trim() === "$INSUNITS");
  if (index < 0) return "unitless";
  const unit = Number(pairs.slice(index + 1).find((pair) => pair[0] === 70)?.[1]);
  const units: Record<number, string> = {
    0: "unitless", 1: "in", 2: "ft", 3: "mi", 4: "mm", 5: "cm",
    6: "m", 7: "km", 8: "microinch", 9: "mil", 10: "yd",
    11: "angstrom", 12: "nm", 13: "micron", 14: "dm",
    15: "dam", 16: "hm", 17: "Gm", 18: "AU", 19: "ly", 20: "pc"
  };
  return units[unit] ?? "unitless";
}

function readEntity(type: string, groups: Array<[number, string]>, warnings: string[]): DXFEntity | null {
  const layer = layerOf(groups);
  const x = numberAt(groups, 10);
  const y = numberAt(groups, 20);
  if (type === "LINE") {
    const x2 = numberAt(groups, 11);
    const y2 = numberAt(groups, 21);
    if ([x, y, x2, y2].every(finite)) return { type, layer, x1: x, y1: y, x2, y2 };
    warnings.push("Skipped a LINE entity with missing or non-finite coordinates.");
  } else if (type === "CIRCLE") {
    const radius = numberAt(groups, 40);
    if ([x, y, radius].every(finite) && radius > 0) return { type, layer, x, y, radius };
    warnings.push("Skipped a CIRCLE entity with invalid centre or radius.");
  } else if (type === "ARC") {
    const radius = numberAt(groups, 40);
    const startDegrees = numberAt(groups, 50);
    const endDegrees = numberAt(groups, 51);
    if ([x, y, radius, startDegrees, endDegrees].every(finite) && radius > 0) {
      return { type, layer, x, y, radius, startDegrees, endDegrees };
    }
    warnings.push("Skipped an ARC entity with invalid centre, radius or angles.");
  } else if (type === "LWPOLYLINE") {
    const xs = allNumbers(groups, 10);
    const ys = allNumbers(groups, 20);
    if (xs.length >= 2 && xs.length === ys.length && xs.every(finite) && ys.every(finite)) {
      if (groups.some((entry) => entry[0] === 42 && Number(entry[1]) !== 0)) {
        warnings.push("LWPOLYLINE bulge arcs are not rendered; vertices are shown as straight segments.");
      }
      return {
        type, layer,
        points: xs.map((pointX, index) => [pointX, ys[index]] as [number, number]),
        closed: (numberAt(groups, 70, 0) & 1) === 1
      };
    }
    warnings.push("Skipped an LWPOLYLINE entity with incomplete vertices.");
  } else if (type === "TEXT") {
    const height = numberAt(groups, 40, 2.5);
    const value = groups.find((entry) => entry[0] === 1)?.[1] ?? "";
    if ([x, y, height].every(finite) && height > 0 && value.length <= 512) {
      return { type, layer, x, y, height, value };
    }
    warnings.push("Skipped a TEXT entity with invalid position, height or content.");
  } else if (type !== "POINT" && type !== "VERTEX" && type !== "SEQEND" && type !== "ENDSEC") {
    warnings.push("Unsupported DXF entity " + type + " was omitted.");
  }
  return null;
}

/** Parse a deliberately bounded ASCII DXF subset. Unsupported entities are reported, never guessed. */
export function parseDXF(source: string): DXFDocument {
  if (typeof source !== "string" || source.length === 0 || new TextEncoder().encode(source).byteLength > MAX_DXF_BYTES) {
    throw new Error("DXF must contain 1 byte to 8 MiB of ASCII-compatible text.");
  }
  const pairs = parsePairs(source);
  const warnings: string[] = [];
  const entities: DXFEntity[] = [];
  let section = "";
  let inEntities = false;
  for (let index = 0; index < pairs.length;) {
    const [code, value] = pairs[index];
    if (code !== 0) { index += 1; continue; }
    if (value === "SECTION") {
      const sectionPair = pairs[index + 1];
      section = sectionPair?.[0] === 2 ? sectionPair[1].toUpperCase() : "";
      inEntities = section === "ENTITIES";
      index += sectionPair?.[0] === 2 ? 2 : 1;
      continue;
    }
    if (value === "ENDSEC") {
      section = "";
      inEntities = false;
      index += 1;
      continue;
    }
    if (!inEntities) { index += 1; continue; }
    const type = value.toUpperCase();
    let end = index + 1;
    while (end < pairs.length && pairs[end][0] !== 0) end += 1;
    const entity = readEntity(type, pairs.slice(index + 1, end), warnings);
    if (entity) entities.push(entity);
    if (entities.length > MAX_ENTITIES) throw new Error("DXF exceeds the 10,000 supported-entity preview limit.");
    index = end;
  }
  if (!entities.length) throw new Error("DXF contains no supported 2D entities.");
  const xs: number[] = [];
  const ys: number[] = [];
  for (const entity of entities) {
    if (entity.type === "LINE") { xs.push(entity.x1, entity.x2); ys.push(entity.y1, entity.y2); }
    else if (entity.type === "CIRCLE" || entity.type === "ARC") {
      xs.push(entity.x - entity.radius, entity.x + entity.radius);
      ys.push(entity.y - entity.radius, entity.y + entity.radius);
    } else if (entity.type === "LWPOLYLINE") {
      for (const [pointX, pointY] of entity.points) { xs.push(pointX); ys.push(pointY); }
    } else { xs.push(entity.x); ys.push(entity.y); }
  }
  const bounds = {
    minX: Math.min(...xs), minY: Math.min(...ys),
    maxX: Math.max(...xs), maxY: Math.max(...ys)
  };
  if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(finite) ||
      bounds.maxX - bounds.minX <= 0 || bounds.maxY - bounds.minY <= 0) {
    throw new Error("DXF preview has degenerate or non-finite drawing bounds.");
  }
  return { entities, units: readUnits(pairs), bounds, warnings };
}


/** Euclidean distance in the drawing's declared units; this does not apply scale or tolerance validation. */
export function measureDXFDistance(start: [number, number], end: [number, number]): {
  deltaX: number;
  deltaY: number;
  distance: number;
} {
  if (![...start, ...end].every(Number.isFinite)) {
    throw new Error("Measurement points must contain finite coordinates.");
  }
  const deltaX = end[0] - start[0];
  const deltaY = end[1] - start[1];
  return { deltaX, deltaY, distance: Math.hypot(deltaX, deltaY) };
}
