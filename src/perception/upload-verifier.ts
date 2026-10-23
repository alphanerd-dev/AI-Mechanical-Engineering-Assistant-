import { createHash, type Hash } from "node:crypto";
import {
  POINT_CLOUD_UPLOAD_MAX_BYTES,
  POINT_CLOUD_UPLOAD_MAX_POINTS,
  type PointCloudUploadFormat,
} from "./uploads.js";

export const POINT_CLOUD_MAX_HEADER_BYTES = 64 * 1024;
const MAX_XYZ_LINE_BYTES = 4096;

export type PointCloudUploadVerificationErrorCode =
  | "UPLOAD_SIZE_OUT_OF_RANGE"
  | "UPLOAD_EMPTY"
  | "UPLOAD_EXCEEDS_DECLARED_SIZE"
  | "UPLOAD_BYTE_SIZE_MISMATCH"
  | "POINT_CLOUD_HEADER_TOO_LARGE"
  | "POINT_CLOUD_HEADER_INVALID"
  | "POINT_CLOUD_FORMAT_MISMATCH"
  | "POINT_CLOUD_ENCODING_UNSUPPORTED"
  | "POINT_CLOUD_COORDINATE_FIELDS_MISSING"
  | "POINT_COUNT_OUT_OF_RANGE"
  | "XYZ_ENCODING_INVALID"
  | "XYZ_LINE_TOO_LONG"
  | "XYZ_COORDINATES_INVALID";

export class PointCloudUploadVerificationError extends Error {
  constructor(readonly code: PointCloudUploadVerificationErrorCode) {
    super(code);
    this.name = "PointCloudUploadVerificationError";
  }
}

export interface PointCloudUploadVerificationResult {
  format: PointCloudUploadFormat;
  byteSize: number;
  sha256: string;
  declaredPointCount: number;
  verification: "HASH_AND_FORMAT_HEADER_PREFLIGHT";
  inspectionStatus: "PENDING_OPEN3D_INSPECTION";
}

function fail(code: PointCloudUploadVerificationErrorCode): never {
  throw new PointCloudUploadVerificationError(code);
}

function pointCount(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value.trim())) fail("POINT_COUNT_OUT_OF_RANGE");
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 3 || count > POINT_CLOUD_UPLOAD_MAX_POINTS) {
    fail("POINT_COUNT_OUT_OF_RANGE");
  }
  return count;
}

function parsePlyHeader(header: string): number {
  const lines = header.replace(/\r/g, "").split("\n").map((line) => line.trim());
  if (lines[0] !== "ply") fail("POINT_CLOUD_FORMAT_MISMATCH");

  const formats = lines.filter((line) => line.startsWith("format "));
  if (formats.length !== 1) fail("POINT_CLOUD_HEADER_INVALID");
  if (!/^format (ascii|binary_little_endian|binary_big_endian) 1\.0$/.test(formats[0])) {
    fail("POINT_CLOUD_ENCODING_UNSUPPORTED");
  }

  const vertices = lines.filter((line) => /^element vertex \d+$/.test(line));
  if (vertices.length !== 1) fail("POINT_CLOUD_HEADER_INVALID");
  const declaredCount = pointCount(vertices[0].split(/\s+/)[2]);

  const coordinateFields = new Set<string>();
  let insideVertices = false;
  for (const line of lines) {
    if (/^element vertex \d+$/.test(line)) {
      insideVertices = true;
      continue;
    }
    if (/^element \w+ \d+$/.test(line)) {
      insideVertices = false;
      continue;
    }
    if (!insideVertices || !line.startsWith("property ")) continue;
    const fields = line.split(/\s+/);
    if (fields.length === 3 && ["x", "y", "z"].includes(fields[2])) {
      coordinateFields.add(fields[2]);
    }
  }
  if (coordinateFields.size !== 3) fail("POINT_CLOUD_COORDINATE_FIELDS_MISSING");
  return declaredCount;
}

function parsePcdHeader(header: string): number {
  const lines = header.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines[0] || !/^#\s*\.PCD\b/i.test(lines[0])) fail("POINT_CLOUD_FORMAT_MISMATCH");

  const fieldsLines = lines.filter((line) => /^FIELDS?\s+/i.test(line));
  if (fieldsLines.length !== 1) fail("POINT_CLOUD_HEADER_INVALID");
  const fieldNames = fieldsLines[0].split(/\s+/).slice(1);
  if (!["x", "y", "z"].every((axis) => fieldNames.includes(axis))) {
    fail("POINT_CLOUD_COORDINATE_FIELDS_MISSING");
  }

  const dataLines = lines.filter((line) => /^DATA\s+/i.test(line));
  if (dataLines.length !== 1) fail("POINT_CLOUD_HEADER_INVALID");
  if (!/^DATA (ascii|binary|binary_compressed)$/i.test(dataLines[0])) {
    fail("POINT_CLOUD_ENCODING_UNSUPPORTED");
  }

  const pointsLines = lines.filter((line) => /^POINTS\s+/i.test(line));
  let rawCount: string | undefined;
  if (pointsLines.length > 1) fail("POINT_CLOUD_HEADER_INVALID");
  if (pointsLines.length === 1) {
    const parts = pointsLines[0].split(/\s+/);
    if (parts.length !== 2) fail("POINT_CLOUD_HEADER_INVALID");
    rawCount = parts[1];
  } else {
    const widthLines = lines.filter((line) => /^WIDTH\s+/i.test(line));
    const heightLines = lines.filter((line) => /^HEIGHT\s+/i.test(line));
    if (widthLines.length !== 1 || heightLines.length !== 1) fail("POINT_CLOUD_HEADER_INVALID");
    const widthRaw = widthLines[0].split(/\s+/)[1];
    const heightRaw = heightLines[0].split(/\s+/)[1];
    if (!widthRaw || !/^\d+$/.test(widthRaw) || !heightRaw || !/^\d+$/.test(heightRaw)) {
      fail("POINT_COUNT_OUT_OF_RANGE");
    }
    const width = Number(widthRaw);
    const height = Number(heightRaw);
    const total = width * height;
    if (!Number.isSafeInteger(width) || width < 1 ||
        !Number.isSafeInteger(height) || height < 1 ||
        !Number.isSafeInteger(total) || total < 3 || total > POINT_CLOUD_UPLOAD_MAX_POINTS) {
      fail("POINT_COUNT_OUT_OF_RANGE");
    }
    rawCount = String(total);
  }
  return pointCount(rawCount);
}

/**
 * Incrementally hashes a completed Supabase Storage object and applies a bounded
 * container-format/point-count preflight. It deliberately does not label the cloud
 * MEASURED or VERIFIED: the isolated Open3D worker must inspect actual coordinates.
 */
export class PointCloudUploadVerifier {
  private readonly hash: Hash = createHash("sha256");
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });
  private header = Buffer.alloc(0);
  private headerParsed = false;
  private declaredPointCount: number | null = null;
  private xyzRemainder = "";
  private xyzPointCount = 0;
  private totalBytes = 0;
  private finished = false;

  constructor(
    private readonly format: PointCloudUploadFormat,
    private readonly expectedByteSize: number,
  ) {
    if (!["PLY", "PCD", "XYZ"].includes(format)) fail("POINT_CLOUD_FORMAT_MISMATCH");
    if (!Number.isSafeInteger(expectedByteSize) ||
        expectedByteSize < 1 ||
        expectedByteSize > POINT_CLOUD_UPLOAD_MAX_BYTES) {
      fail("UPLOAD_SIZE_OUT_OF_RANGE");
    }
    if (format === "XYZ") this.headerParsed = true;
  }

  push(chunk: Uint8Array): void {
    if (this.finished) fail("UPLOAD_EMPTY");
    if (!(chunk instanceof Uint8Array)) fail("UPLOAD_EMPTY");
    if (chunk.byteLength === 0) return;

    this.totalBytes += chunk.byteLength;
    if (this.totalBytes > POINT_CLOUD_UPLOAD_MAX_BYTES) fail("UPLOAD_SIZE_OUT_OF_RANGE");
    if (this.totalBytes > this.expectedByteSize) fail("UPLOAD_EXCEEDS_DECLARED_SIZE");
    this.hash.update(chunk);

    if (this.format === "XYZ") {
      this.consumeXyzBytes(chunk, true);
    } else if (!this.headerParsed) {
      this.captureHeader(chunk);
    }
  }

  finish(): PointCloudUploadVerificationResult {
    if (this.finished) fail("UPLOAD_EMPTY");
    this.finished = true;
    if (this.totalBytes < 1) fail("UPLOAD_EMPTY");
    if (this.totalBytes !== this.expectedByteSize) fail("UPLOAD_BYTE_SIZE_MISMATCH");

    if (this.format === "XYZ") {
      this.consumeXyzBytes(new Uint8Array(), false);
      if (this.xyzRemainder.length > 0) {
        this.consumeXyzLine(this.xyzRemainder);
        this.xyzRemainder = "";
      }
      if (this.xyzPointCount < 3) fail("POINT_COUNT_OUT_OF_RANGE");
      this.declaredPointCount = this.xyzPointCount;
    } else if (!this.headerParsed || this.declaredPointCount === null) {
      fail("POINT_CLOUD_HEADER_INVALID");
    }

    return {
      format: this.format,
      byteSize: this.totalBytes,
      sha256: this.hash.digest("hex"),
      declaredPointCount: this.declaredPointCount!,
      verification: "HASH_AND_FORMAT_HEADER_PREFLIGHT",
      inspectionStatus: "PENDING_OPEN3D_INSPECTION",
    };
  }

  private captureHeader(chunk: Uint8Array): void {
    const remaining = POINT_CLOUD_MAX_HEADER_BYTES + 1 - this.header.length;
    if (remaining <= 0) fail("POINT_CLOUD_HEADER_TOO_LARGE");
    const take = Buffer.from(chunk.subarray(0, remaining));
    this.header = Buffer.concat([this.header, take]);

    const text = this.header.toString("latin1");
    const terminator = this.format === "PLY"
      ? /(?:^|\r?\n)end_header[ \t]*\r?\n/i.exec(text)
      : /(?:^|\r?\n)DATA[ \t]+[^\r\n]+(?:\r?\n)/i.exec(text);

    if (terminator) {
      const headerEnd = terminator.index + terminator[0].length;
      if (headerEnd > POINT_CLOUD_MAX_HEADER_BYTES) fail("POINT_CLOUD_HEADER_TOO_LARGE");
      const headerText = text.slice(0, headerEnd);
      this.declaredPointCount = this.format === "PLY"
        ? parsePlyHeader(headerText)
        : parsePcdHeader(headerText);
      this.headerParsed = true;
      return;
    }
    if (this.header.length >= POINT_CLOUD_MAX_HEADER_BYTES) fail("POINT_CLOUD_HEADER_TOO_LARGE");
  }

  private consumeXyzBytes(chunk: Uint8Array, streaming: boolean): void {
    let text: string;
    try {
      text = this.decoder.decode(chunk, { stream: streaming });
    } catch {
      fail("XYZ_ENCODING_INVALID");
    }
    const lines = (this.xyzRemainder + text).split("\n");
    this.xyzRemainder = lines.pop() ?? "";
    if (Buffer.byteLength(this.xyzRemainder, "utf8") > MAX_XYZ_LINE_BYTES) {
      fail("XYZ_LINE_TOO_LONG");
    }
    for (const line of lines) this.consumeXyzLine(line);
  }

  private consumeXyzLine(rawLine: string): void {
    const line = rawLine.replace(/\r$/, "").trim();
    if (!line || line.startsWith("#")) return;
    if (Buffer.byteLength(line, "utf8") > MAX_XYZ_LINE_BYTES) fail("XYZ_LINE_TOO_LONG");
    const values = line.split(/\s+/);
    if (values.length !== 3) fail("XYZ_COORDINATES_INVALID");
    const coordinates = values.map((value) => Number(value));
    if (coordinates.some((value) => !Number.isFinite(value))) fail("XYZ_COORDINATES_INVALID");
    this.xyzPointCount += 1;
    if (this.xyzPointCount > POINT_CLOUD_UPLOAD_MAX_POINTS) fail("POINT_COUNT_OUT_OF_RANGE");
  }
}
