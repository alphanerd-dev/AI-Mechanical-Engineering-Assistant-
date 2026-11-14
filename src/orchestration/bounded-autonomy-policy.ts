import type {CapabilityRisk} from "../core/types.js";

export const BOUNDED_AUTONOMY_HARD_LIMITS={
  maxSteps:25,
  maxTaskExecutions:10,
  maxDelegations:10,
  maxRisk:"HIGH" as CapabilityRisk,
  maxTaskGraphSize:500
} as const;
