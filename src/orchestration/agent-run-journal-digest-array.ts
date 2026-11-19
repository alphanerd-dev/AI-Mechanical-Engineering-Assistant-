type NormalizeChild = (value: unknown, seen: Set<object>) => unknown;

function hasDenseIndexes(value: unknown[]): boolean {
  if (Object.keys(value).length !== value.length) return false;
  if (Object.getOwnPropertySymbols(value).length > 0) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}
export function normalizeArray(value: unknown[], seen: Set<object>, normalizeChild: NormalizeChild): unknown[] {
  if (!hasDenseIndexes(value)) throw new Error("Agent journal arrays must be dense JSON arrays.");
  return value.map(item => normalizeChild(item, seen));
}
