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

type GroupPair = [number, string];
type EntityReader = (groups: GroupPair[], warnings: string[]) => DXFEntity | null;

const MAX_DXF_BYTES = 8 * 1024 * 1024;
const MAX_ENTITIES = 10000;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const numberAt = (groups: GroupPair[], code: number, fallback = NaN): number => {
  const pair = groups.find((entry) => entry[0] === code);
  return pair ? Number(pair[1]) : fallback;
};
const allNumbers = (groups: GroupPair[], code: number): number[] =>
  groups.filter((entry) => entry[0] === code).map((entry) => Number(entry[1]));
const layerOf = (groups: GroupPair[]): string =>
  (groups.find((entry) => entry[0] === 8)?.[1] ?? "0").slice(0, 128);

function parseGroupCode(value: string, lineNumber: number): number {
  const codeText = value.trim();
  const code = Number(codeText);
  if (!codeText || !Number.isInteger(code) || code < 0 || code > 1071) {
    throw new Error("DXF contains an invalid group code at line " + lineNumber + ".");
  }
  return code;
}

function parsePairs(source: string): GroupPair[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  if (lines.length % 2 !== 0) throw new Error("DXF contains an incomplete group-code pair.");
  const pairs: GroupPair[] = [];
  for (let index = 0; index < lines.length; index += 2) {
    pairs.push([parseGroupCode(lines[index], index + 1), lines[index + 1].trimEnd()]);
  }
  return pairs;
}

function readUnits(pairs: GroupPair[]): string {
  const index = pairs.findIndex((pair) => pair[0] === 9 && pair[1].trim() === "$INSUNITS");
  if (index < 0) return "unitless";
  const unit = Number(pairs[index + 1]?.[0] === 70 ? pairs[index + 1][1] : NaN);
  const units: Record<number, string> = {
    0: "unitless", 1: "in", 2: "ft", 3: "mi", 4: "mm", 5: "cm",
    6: "m", 7: "km", 8: "microinch", 9: "mil", 10: "yd",
    11: "angstrom", 12: "nm", 13: "micron", 14: "dm",
    15: "dam", 16: "hm", 17: "Gm", 18: "AU", 19: "ly", 20: "pc"
  };
  return units[unit] ?? "unitless";
}

function readLine(groups: GroupPair[], warnings: string[]): DXFEntity | null {
  const [x1, y1, x2, y2] = [numberAt(groups, 10), numberAt(groups, 20), numberAt(groups, 11), numberAt(groups, 21)];
  if ([x1, y1, x2, y2].every(finite)) return { type: "LINE", layer: layerOf(groups), x1, y1, x2, y2 };
  warnings.push("Skipped a LINE entity with missing or non-finite coordinates.");
  return null;
}

function readCircle(groups: GroupPair[], warnings: string[]): DXFEntity | null {
  const x = numberAt(groups, 10), y = numberAt(groups, 20), radius = numberAt(groups, 40);
  if ([x, y, radius].every(finite) && radius > 0) return { type: "CIRCLE", layer: layerOf(groups), x, y, radius };
  warnings.push("Skipped a CIRCLE entity with invalid centre or radius.");
  return null;
}

function readArc(groups: GroupPair[], warnings: string[]): DXFEntity | null {
  const x = numberAt(groups, 10), y = numberAt(groups, 20), radius = numberAt(groups, 40);
  const startDegrees = numberAt(groups, 50), endDegrees = numberAt(groups, 51);
  if ([x, y, radius, startDegrees, endDegrees].every(finite) && radius > 0) {
    return { type: "ARC", layer: layerOf(groups), x, y, radius, startDegrees, endDegrees };
  }
  warnings.push("Skipped an ARC entity with invalid centre, radius or angles.");
  return null;
}

function readPolyline(groups: GroupPair[], warnings: string[]): DXFEntity | null {
  const xs = allNumbers(groups, 10), ys = allNumbers(groups, 20);
  if (xs.length < 2 || xs.length !== ys.length || !xs.every(finite) || !ys.every(finite)) {
    warnings.push("Skipped an LWPOLYLINE entity with incomplete vertices.");
    return null;
  }
  if (groups.some((entry) => entry[0] === 42 && Number(entry[1]) !== 0)) {
    warnings.push("LWPOLYLINE bulge arcs are not rendered; vertices are shown as straight segments.");
  }
  return {
    type: "LWPOLYLINE", layer: layerOf(groups),
    points: xs.map((pointX, index) => [pointX, ys[index]] as [number, number]),
    closed: (numberAt(groups, 70, 0) & 1) === 1
  };
}

function readText(groups: GroupPair[], warnings: string[]): DXFEntity | null {
  const x = numberAt(groups, 10), y = numberAt(groups, 20), height = numberAt(groups, 40, 2.5);
  const value = groups.find((entry) => entry[0] === 1)?.[1] ?? "";
  if ([x, y, height].every(finite) && height > 0 && value.length <= 512) {
    return { type: "TEXT", layer: layerOf(groups), x, y, height, value };
  }
  warnings.push("Skipped a TEXT entity with invalid position, height or content.");
  return null;
}

const ENTITY_READERS: Readonly<Record<string, EntityReader>> = {
  LINE: readLine,
  CIRCLE: readCircle,
  ARC: readArc,
  LWPOLYLINE: readPolyline,
  TEXT: readText
};

function readEntity(type: string, groups: GroupPair[], warnings: string[]): DXFEntity | null {
  const reader = ENTITY_READERS[type];
  if (reader) return reader(groups, warnings);
  if (!["POINT", "VERTEX", "SEQEND", "ENDSEC"].includes(type)) {
    warnings.push("Unsupported DXF entity " + type + " was omitted.");
  }
  return null;
}

function parseEntities(pairs: GroupPair[], warnings: string[]): DXFEntity[] {
  const entities: DXFEntity[] = [];
  let inEntities = false;
  for (let index = 0; index < pairs.length;) {
    const [code, value] = pairs[index];
    if (code !== 0) { index += 1; continue; }
    if (value === "SECTION") {
      const section = pairs[index + 1];
      inEntities = section?.[0] === 2 && section[1].toUpperCase() === "ENTITIES";
      index += section?.[0] === 2 ? 2 : 1;
      continue;
    }
    if (value === "ENDSEC") { inEntities = false; index += 1; continue; }
    if (!inEntities) { index += 1; continue; }
    let end = index + 1;
    while (end < pairs.length && pairs[end][0] !== 0) end += 1;
    const entity = readEntity(value.toUpperCase(), pairs.slice(index + 1, end), warnings);
    if (entity) entities.push(entity);
    if (entities.length > MAX_ENTITIES) throw new Error("DXF exceeds the 10,000 supported-entity preview limit.");
    index = end;
  }
  return entities;
}

function appendEntityBounds(entity: DXFEntity, xs: number[], ys: number[]): void {
  if (entity.type === "LINE") {
    xs.push(entity.x1, entity.x2); ys.push(entity.y1, entity.y2);
  } else if (entity.type === "CIRCLE" || entity.type === "ARC") {
    xs.push(entity.x - entity.radius, entity.x + entity.radius);
    ys.push(entity.y - entity.radius, entity.y + entity.radius);
  } else if (entity.type === "LWPOLYLINE") {
    for (const [x, y] of entity.points) { xs.push(x); ys.push(y); }
  } else {
    xs.push(entity.x); ys.push(entity.y);
  }
}

function computeBounds(entities: DXFEntity[]): DXFBounds {
  const xs: number[] = [], ys: number[] = [];
  for (const entity of entities) appendEntityBounds(entity, xs, ys);
  const bounds = {
    minX: Math.min(...xs), minY: Math.min(...ys),
    maxX: Math.max(...xs), maxY: Math.max(...ys)
  };
  if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(finite) ||
      bounds.maxX - bounds.minX <= 0 || bounds.maxY - bounds.minY <= 0) {
    throw new Error("DXF preview has degenerate or non-finite drawing bounds.");
  }
  return bounds;
}

/** Parse a deliberately bounded ASCII DXF subset. Unsupported entities are reported, never guessed. */
export function parseDXF(source: string): DXFDocument {
  if (typeof source !== "string" || source.length === 0 ||
      new TextEncoder().encode(source).byteLength > MAX_DXF_BYTES) {
    throw new Error("DXF must contain 1 byte to 8 MiB of ASCII-compatible text.");
  }
  const pairs = parsePairs(source);
  const warnings: string[] = [];
  const entities = parseEntities(pairs, warnings);
  if (!entities.length) throw new Error("DXF contains no supported 2D entities.");
  return { entities, units: readUnits(pairs), bounds: computeBounds(entities), warnings };
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
