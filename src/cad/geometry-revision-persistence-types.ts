export type Row = Record<string, unknown>;
export type Result<T> = { ok: true; value: T } | { ok: false; message: string; status: number };
export type Completion = {
  id: string; project_id: string; model_identity_id: string; execution_id: string;
  status: string; specification: unknown; artifact_records: unknown[]; evidence_records: unknown[];
  validation_receipt: unknown; storage_objects: unknown[]; created_by: string;
};
export type CanonicalSolid = { id: string; provenance: Row; objectPath: string };
export function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function failure<T>(message: string, status = 409): Result<T> {
  return { ok: false, message, status };
}
export class GeometryPersistenceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new GeometryPersistenceError(result.message, result.status);
  return result.value;
}

export interface GeometryRevisionQueryResult {
  data: unknown;
  error: unknown | null;
}
export interface GeometryRevisionQueryBuilder extends PromiseLike<GeometryRevisionQueryResult> {
  select(columns: string): GeometryRevisionQueryBuilder;
  eq(column: string, value: unknown): GeometryRevisionQueryBuilder;
  maybeSingle(): Promise<GeometryRevisionQueryResult>;
  order(column: string, options: { ascending: boolean }): GeometryRevisionQueryBuilder;
  limit(count: number): Promise<GeometryRevisionQueryResult>;
}
export interface GeometryRevisionDatabase {
  from(table: string): GeometryRevisionQueryBuilder;
  rpc(name: string, args: Record<string, unknown>): Promise<GeometryRevisionQueryResult>;
  storage: {
    from(bucket: string): {
      download(path: string): Promise<{ data: Blob | null; error: unknown | null }>;
    };
  };
}
