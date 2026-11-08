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

function isValidGroupCode(codeText: string, code: number): boolean {
  return codeText.length > 0 && Number.isInteger(code) && code >= 0 && code <= 1071;
}

function parseGroupCode(value: string, lineNumber: number): number {
  const codeText = value.trim();
  const code = Number(codeText);
  if (isValidGroupCode(codeText, code)) return code;
  throw new Error("DXF contains an invalid group code at line " + lineNumber + ".");
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

function hasValidPolylineVertices(xs: number[], ys: number[]): boolean {
  if (xs.length < 2) return false;
  if (xs.length !== ys.length) return false;
  if (!xs.every(finite)) return false;
  return ys.every(finite);
}

function readPolyline(groups: GroupPair[], warnings: string[]): DXFEntity | null {
  const xs = allNumbers(groups, 10), ys = allNumbers(groups, 20);
  if (!hasValidPolylineVertices(xs, ys)) {
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

function isValidTextEntity(x: number, y: number, height: number, value: string): boolean {
  if (!finite(x)) return false;
  if (!finite(y)) return false;
  if (!finite(height) || height <= 0) return false;
  return value.length <= 512;
}

function readText(groups: GroupPair[], warnings: string[]): DXFEntity | null {
  const x = numberAt(groups, 10), y = numberAt(groups, 20), height = numberAt(groups, 40, 2.5);
  const value = groups.find((entry) => entry[0] === 1)?.[1] ?? "";
  if (isValidTextEntity(x, y, height, value)) {
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

interface EntityParseStep {
  nextIndex: number;
  inEntities: boolean;
  entity?: DXFEntity;
}

function nextEntityBoundary(pairs: GroupPair[], start: number): number {
  let end = start + 1;
  while (end < pairs.length && pairs[end][0] !== 0) end += 1;
  return end;
}

function readSectionState(pairs: GroupPair[], index: number): EntityParseStep {
  const section = pairs[index + 1];
  const validHeader = section?.[0] === 2;
  return {
    nextIndex: index + (validHeader ? 2 : 1),
    inEntities: validHeader && section[1].toUpperCase() === "ENTITIES"
  };
}

function parseEntityStep(
  pairs: GroupPair[],
  index: number,
  inEntities: boolean,
  warnings: string[]
): EntityParseStep {
  const [code, value] = pairs[index];
  if (code !== 0) return { nextIndex: index + 1, inEntities };
  if (value === "SECTION") return readSectionState(pairs, index);
  if (value === "ENDSEC") return { nextIndex: index + 1, inEntities: false };
  if (!inEntities) return { nextIndex: index + 1, inEntities };
  const end = nextEntityBoundary(pairs, index);
  return {
    nextIndex: end,
    inEntities,
    entity: readEntity(value.toUpperCase(), pairs.slice(index + 1, end), warnings) ?? undefined
  };
}

function parseEntities(pairs: GroupPair[], warnings: string[]): DXFEntity[] {
  const entities: DXFEntity[] = [];
  let index = 0;
  let inEntities = false;
  while (index < pairs.length) {
    const step = parseEntityStep(pairs, index, inEntities, warnings);
    if (step.entity) entities.push(step.entity);
    if (entities.length > MAX_ENTITIES) throw new Error("DXF exceeds the 10,000 supported-entity preview limit.");
    index = step.nextIndex;
    inEntities = step.inEntities;
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

function hasFiniteBounds(bounds: DXFBounds): boolean {
  if (!finite(bounds.minX)) return false;
  if (!finite(bounds.minY)) return false;
  if (!finite(bounds.maxX)) return false;
  return finite(bounds.maxY);
}

function hasPositiveBoundsArea(bounds: DXFBounds): boolean {
  if (bounds.maxX <= bounds.minX) return false;
  return bounds.maxY > bounds.minY;
}

function computeBounds(entities: DXFEntity[]): DXFBounds {
  const xs: number[] = [], ys: number[] = [];
  for (const entity of entities) appendEntityBounds(entity, xs, ys);
  const bounds = {
    minX: Math.min(...xs), minY: Math.min(...ys),
    maxX: Math.max(...xs), maxY: Math.max(...ys)
  };
  if (!hasFiniteBounds(bounds)) {
    throw new Error("DXF preview has non-finite drawing bounds.");
  }
  if (!hasPositiveBoundsArea(bounds)) {
    throw new Error("DXF preview has degenerate drawing bounds.");
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
