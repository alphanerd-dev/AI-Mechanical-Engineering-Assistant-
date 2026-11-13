import { describe, expect, it } from "vitest";
import { inspectCADDrawingUpload } from "../src/drawings/ingestion.js";

const dxf = [
  "0","SECTION","2","HEADER","9","$INSUNITS","70","4","0","ENDSEC",
  "0","SECTION","2","ENTITIES","0","LINE","8","FRAME","10","0","20","0","11","100","21","0",
  "0","ENDSEC","0","EOF"
].join("\n");
const bytes = (value: string) => new TextEncoder().encode(value);

describe("project drawing ingestion inspection", () => {
  it("accepts a bounded PDF source with a valid signature and EOF marker", () => {
    const result = inspectCADDrawingUpload({
      filename: "drawing.pdf", declaredMimeType: "application/pdf",
      bytes: bytes("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF")
    });
    expect(result).toMatchObject({ format: "PDF", mediaType: "application/pdf", parserVersion: "pdf-source-1" });
  });

  it("accepts only the safe SVG preview subset", () => {
    const result = inspectCADDrawingUpload({
      filename: "layout.svg", declaredMimeType: "image/svg+xml",
      bytes: bytes('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><line x1="0" y1="0" x2="100" y2="100" stroke="#123456"/></svg>')
    });
    expect(result.format).toBe("SVG");
    expect(() => inspectCADDrawingUpload({
      filename: "unsafe.svg", bytes: bytes('<svg><script>alert(1)</script></svg>')
    })).toThrow("active, external");
    expect(() => inspectCADDrawingUpload({
      filename: "external.svg", bytes: bytes('<svg><path d="M0 0" fill="url(https://bad)"/></svg>')
    })).toThrow("external or executable");
  });

  it("parses DXF units, entity count and bounds before upload", () => {
    const result = inspectCADDrawingUpload({
      filename: "bracket.dxf", declaredMimeType: "application/dxf", bytes: bytes(dxf)
    });
    expect(result).toMatchObject({
      format: "DXF", units: "mm", entityCount: 1,
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 0 }
    });
  });

  it("rejects spoofed formats, malformed PDFs, unsafe filenames and oversized files", () => {
    expect(() => inspectCADDrawingUpload({ filename: "fake.svg", bytes: bytes("%PDF-1.7\n%%EOF") }))
      .toThrow("PDF filename or media type");
    expect(() => inspectCADDrawingUpload({ filename: "missing-eof.pdf", bytes: bytes("%PDF-1.7\ncontent") }))
      .toThrow("EOF marker");
    expect(() => inspectCADDrawingUpload({ filename: "../drawing.dxf", bytes: bytes(dxf) }))
      .toThrow("filename is invalid");
    expect(() => inspectCADDrawingUpload({ filename: "large.pdf", bytes: new Uint8Array(4 * 1024 * 1024 + 1) }))
      .toThrow("4 MiB");
  });
});
