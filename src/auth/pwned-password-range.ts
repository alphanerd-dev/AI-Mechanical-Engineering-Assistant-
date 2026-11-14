interface HashRangeEntry {
  suffix: string;
  count: number;
}

function parseHashRangeEntry(line: string): HashRangeEntry | null {
  const separator = line.indexOf(":");
  if (separator < 0) return null;

  const suffix = line.slice(0, separator).trim().toUpperCase();
  const count = Number(line.slice(separator + 1).trim());
  if (!/^[A-F0-9]{35}$/.test(suffix)) return null;
  if (!Number.isSafeInteger(count) || count < 0) return null;
  return { suffix, count };
}

function parseHashRangeResponse(responseBody: string): HashRangeEntry[] | null {
  const lines = responseBody.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return null;

  const entries = lines.map(parseHashRangeEntry);
  if (entries.some((entry) => entry === null)) return null;
  return entries as HashRangeEntry[];
}

export function isCompromisedPasswordRange(responseBody: string, suffix: string): boolean | null {
  return parseHashRangeResponse(responseBody)?.some(
    (entry) => entry.suffix === suffix && entry.count > 0,
  ) ?? null;
}
