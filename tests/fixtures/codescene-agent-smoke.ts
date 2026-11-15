export type InspectionStatus = "accepted" | "rejected" | "pending";

export interface InspectionRecord {
  assetCode: string;
  status: InspectionStatus;
}

export function formatInspectionStatus(record: InspectionRecord): string {
  if (record.status === "accepted") {
    return `${record.assetCode.trim().toUpperCase()} — ACCEPTED`;
  }

  if (record.status === "rejected") {
    return `${record.assetCode.trim().toUpperCase()} — REJECTED`;
  }

  return `${record.assetCode.trim().toUpperCase()} — PENDING`;
}
