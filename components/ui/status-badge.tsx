import { Badge, type BadgeProps } from "@/components/ui/badge";

export type EngineeringStatus =
  | "draft"
  | "proposed"
  | "awaiting-input"
  | "executing"
  | "executed"
  | "validated"
  | "approved"
  | "blocked"
  | "failed"
  | "provisional";

const statusPresentation: Record<EngineeringStatus, { label: string; variant: NonNullable<BadgeProps["variant"]> }> = {
  draft: { label: "Draft", variant: "muted" },
  proposed: { label: "Proposed", variant: "default" },
  "awaiting-input": { label: "Awaiting input", variant: "warning" },
  executing: { label: "Executing", variant: "info" },
  executed: { label: "Executed", variant: "secondary" },
  validated: { label: "Validated", variant: "info" },
  approved: { label: "Approved", variant: "success" },
  blocked: { label: "Blocked", variant: "warning" },
  failed: { label: "Failed", variant: "danger" },
  provisional: { label: "Provisional", variant: "warning" },
};

/** A textual engineering state; execution, validation, and approval stay distinct. */
export function StatusBadge({
  status,
  label,
  children,
  ...props
}: Omit<BadgeProps, "variant"> & {
  status: EngineeringStatus;
  label?: string;
}) {
  const presentation = statusPresentation[status];
  return (
    <Badge variant={presentation.variant} data-status={status} {...props}>
      {label ?? children ?? presentation.label}
    </Badge>
  );
}
