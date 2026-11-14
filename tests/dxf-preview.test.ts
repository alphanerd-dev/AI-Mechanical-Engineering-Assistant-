import { describe, expect, it } from "vitest";
import { measureDXFDistance, parseDXF } from "../src/drawings/dxf.js";

const drawing = [
  "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
  "0", "SECTION", "2", "ENTITIES",
  "0", "LINE", "8", "FRAME", "10", "0", "20", "0", "11", "100", "21", "0",
  "0", "CIRCLE", "8", "HOLES", "10", "50", "20", "40", "40", "10",
  "0", "LWPOLYLINE", "8", "OUTLINE", "70", "1", "10", "0", "20", "0", "10", "100", "20", "0", "10", "100", "20", "80",
  "0", "TEXT", "8", "NOTES", "10", "5", "20", "90", "40", "3", "1", "DATUM A",
  "0", "ENDSEC", "0", "EOF"
].join("\n");

describe("bounded DXF 2D preview parser", () => {
  it("parses supported primitives, units and drawing bounds", () => {
    const result = parseDXF(drawing);
    expect(result.units).toBe("mm");
    expect(result.entities.map((entity) => entity.type)).toEqual(["LINE", "CIRCLE", "LWPOLYLINE", "TEXT"]);
    expect(result.bounds).toMatchObject({ minX: 0, minY: 0, maxX: 100, maxY: 90 });
  });

  it("rejects malformed group codes, empty documents and oversized data", () => {
    expect(() => parseDXF("bad\nvalue\n")).toThrow("invalid group code");
    expect(() => parseDXF("0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF")).toThrow("no supported 2D entities");
    expect(() => parseDXF("0\n".repeat(4 * 1024 * 1024 + 1))).toThrow("8 MiB");
  });

  it("measures two drawing coordinates in the declared coordinate units", () => {
    const measurement = measureDXFDistance([0, 0], [3, 4]);
    expect(measurement).toEqual({ deltaX: 3, deltaY: 4, distance: 5 });
    expect(() => measureDXFDistance([0, 0], [Number.NaN, 4])).toThrow("finite coordinates");
  });

  it("reports unsupported entities rather than inferring geometry", () => {
    const result = parseDXF("0\nSECTION\n2\nENTITIES\n0\nLINE\n10\n0\n20\n0\n11\n1\n21\n1\n0\nSPLINE\n0\nENDSEC\n0\nEOF");
    expect(result.warnings.join(" ")).toContain("Unsupported DXF entity SPLINE");
  });
});
