import { z } from "zod";

const decisionSchema = z.object({
  projectId: z.string().uuid(),
  assessmentId: z.string().uuid(),
  decision: z.enum(["APPROVED","REJECTED"]),
  comment: z.string().max(1000).optional()
}).strict();

export type ManufacturingDecisionRequest = z.infer<typeof decisionSchema>;
export function parseManufacturingDecisionRequest(value: unknown): ManufacturingDecisionRequest | null {
  const parsed = decisionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
