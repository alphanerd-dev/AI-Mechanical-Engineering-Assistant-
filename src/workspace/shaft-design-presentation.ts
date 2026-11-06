type ShaftDesignPresentationResult = {
  criterion?: string;
  assumptions: string[];
};

const LEGACY_ASME_LABEL = "ASME_ELLIPTIC_STATIC_YIELD";

export function getShaftDesignDisplayAssumptions(result: ShaftDesignPresentationResult): string[] {
  if (result.criterion !== LEGACY_ASME_LABEL) return result.assumptions;
  return [
    ...result.assumptions.filter((assumption) => !assumption.includes("ASME elliptic static-yield criterion")),
    "Historical metadata correction: this stored result used the von Mises static-yield calculation; it was not an ASME elliptic assessment. Recalculate to create a current result."
  ];
}
