type NormalizeChild = (value: unknown, seen: Set<object>) => unknown;
type ObjectEntry = [string, unknown];

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  if (prototype === Object.prototype) return true;
  return prototype === null;
}
function compareObjectKeys(left: ObjectEntry, right: ObjectEntry): number {
  if (left[0] < right[0]) return -1;
  if (left[0] > right[0]) return 1;
  return 0;
}
function sortedObjectEntries(value: object): ObjectEntry[] {
  return Object.entries(value as Record<string, unknown>).sort(compareObjectKeys);
}
export function normalizeObject(value: object, seen: Set<object>, normalizeChild: NormalizeChild): Record<string, unknown> {
  if (!isPlainObject(value)) throw new Error("Agent journal payload must use plain JSON objects.");
  if (Object.getOwnPropertySymbols(value).length > 0) throw new Error("Agent journal payload cannot contain symbol keys.");
  const entries = sortedObjectEntries(value);
  return Object.fromEntries(entries.map(([key, item]) => [key, normalizeChild(item, seen)]));
}
