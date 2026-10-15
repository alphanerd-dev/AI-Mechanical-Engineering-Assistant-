import type { CapabilityStatus } from "../core/types.js";

export type ProviderAcceptanceState = "NOT_RUN" | "PASS" | "FAIL" | "BLOCKED";
export type LicenseReviewState = "UNREVIEWED" | "SOURCE_REVIEWED" | "CLEARED";
export type ProviderSecurityReviewState = "REVIEW_REQUIRED" | "IN_REVIEW" | "PASS" | "FAIL";

export interface ProviderPromotionManifest {
  schemaVersion: 1;
  providerId: string;
  providerVersion: string;
  status: CapabilityStatus;
  upstream: {
    repositoryUrl: string;
    revision: string;
    licenseSpdx: string;
    licenseTextUrl: string;
    licenseReview: LicenseReviewState;
    dependencyLicenseClosureReviewed: boolean;
    copyDisposition: "REFERENCE_ONLY" | "ADAPTER_ONLY" | "CLEARED_FOR_REUSE";
    adapterReviewUrl?: string;
  };
  runtime: {
    image: string;
    imageDigest?: string;
    packageVersion: string;
    timeoutMs: number;
    memoryLimitMb: number;
    cpuLimit: number;
    pidsLimit: number;
    networkAccess: "NONE" | "ALLOWLISTED" | "UNRESTRICTED";
    filesystem: "READ_ONLY_PLUS_ARTIFACTS" | "WRITABLE" | "UNRESTRICTED";
    runsUnprivileged: boolean;
  };
  acceptance: {
    suiteId: string;
    state: ProviderAcceptanceState;
    fixtureSha256?: string;
    workflowRunUrl?: string;
    artifactUrl?: string;
    analyticalReferencePassed: boolean;
    independentValidatorPassed: boolean;
  };
  securityReview: {
    state: ProviderSecurityReviewState;
    evidenceUrl?: string;
  };
  reviewerApproval?: {
    decision: "APPROVE" | "REJECT";
    reviewer: string;
    reviewedAt: string;
    evidenceUrl: string;
  };
  knownLimitations: string[];
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function isPinnedRevision(value: string): boolean {
  // Release tags can be moved; verification requires the exact upstream commit.
  return /^[a-f0-9]{40}$/i.test(value.trim());
}

/**
 * A provider can be marked VERIFIED only when its source, license closure,
 * runtime sandbox, shared known-answer benchmark, independent validation,
 * security review, and human approval all have durable evidence.
 */
export function providerPromotionBlockingReasons(manifest: ProviderPromotionManifest): string[] {
  const reasons: string[] = [];
  if (manifest.schemaVersion !== 1) reasons.push("Unsupported promotion manifest schema.");
  if (!manifest.providerId.trim()) reasons.push("Provider ID is required.");
  if (!manifest.providerVersion.trim()) reasons.push("Provider version is required.");
  if (!isHttpsUrl(manifest.upstream.repositoryUrl)) reasons.push("An HTTPS upstream repository URL is required.");
  if (!isPinnedRevision(manifest.upstream.revision)) reasons.push("Upstream revision must be pinned to an immutable 40-character commit SHA.");
  if (!manifest.upstream.licenseSpdx.trim() || !isHttpsUrl(manifest.upstream.licenseTextUrl)) reasons.push("A source license and license-text URL are required.");
  if (manifest.upstream.licenseReview !== "CLEARED") reasons.push("Legal review has not cleared the source license for the proposed use.");
  if (!manifest.upstream.dependencyLicenseClosureReviewed) reasons.push("Transitive dependency license review is incomplete.");
  if (manifest.upstream.copyDisposition === "REFERENCE_ONLY") {
    reasons.push("Upstream is reference-only; implement and review a native adapter before promotion.");
  }
  if (manifest.upstream.copyDisposition === "ADAPTER_ONLY" && !isHttpsUrl(manifest.upstream.adapterReviewUrl)) {
    reasons.push("Clean-room adapter disposition needs durable review evidence for the local adapter and source boundary.");
  }
  if (manifest.upstream.copyDisposition === "CLEARED_FOR_REUSE" &&
      manifest.upstream.licenseReview !== "CLEARED") {
    reasons.push("Code reuse cannot be promoted before license review is cleared.");
  }

  if (!manifest.runtime.image.trim() || !manifest.runtime.imageDigest?.match(/^sha256:[a-f0-9]{64}$/)) {
    reasons.push("The runtime image must be pinned by immutable SHA-256 digest.");
  }
  if (!manifest.runtime.packageVersion.trim()) reasons.push("The runtime package version must be pinned.");
  if (!Number.isInteger(manifest.runtime.timeoutMs) || manifest.runtime.timeoutMs < 1 || manifest.runtime.timeoutMs > 120_000) reasons.push("Runtime timeout must be bounded to 1–120000 ms.");
  if (!Number.isFinite(manifest.runtime.memoryLimitMb) || manifest.runtime.memoryLimitMb < 64) reasons.push("A meaningful runtime memory limit is required.");
  if (!Number.isFinite(manifest.runtime.cpuLimit) || manifest.runtime.cpuLimit <= 0 || manifest.runtime.cpuLimit > 8) reasons.push("Runtime CPU limit must be bounded.");
  if (!Number.isInteger(manifest.runtime.pidsLimit) || manifest.runtime.pidsLimit < 1 || manifest.runtime.pidsLimit > 512) reasons.push("Runtime process count must be bounded.");
  if (manifest.runtime.networkAccess !== "NONE") reasons.push("Provider runtime must have network access disabled unless a separately reviewed allowlist is approved.");
  if (manifest.runtime.filesystem !== "READ_ONLY_PLUS_ARTIFACTS") reasons.push("Provider runtime must use a read-only filesystem plus a bounded artifact mount.");
  if (!manifest.runtime.runsUnprivileged) reasons.push("Provider runtime must run unprivileged.");

  if (manifest.acceptance.state !== "PASS") reasons.push("The shared known-answer benchmark has not passed.");
  if (!/^[a-f0-9]{64}$/.test(manifest.acceptance.fixtureSha256 ?? "")) reasons.push("Benchmark fixture SHA-256 is missing or malformed.");
  if (!isHttpsUrl(manifest.acceptance.workflowRunUrl)) reasons.push("A durable successful benchmark workflow run URL is required.");
  if (!isHttpsUrl(manifest.acceptance.artifactUrl)) reasons.push("A retained benchmark result artifact URL is required.");
  if (!manifest.acceptance.analyticalReferencePassed) reasons.push("An independent analytical or trusted reference answer is required.");
  if (!manifest.acceptance.independentValidatorPassed) reasons.push("An independent validator acceptance result is required.");

  if (manifest.securityReview.state !== "PASS" || !isHttpsUrl(manifest.securityReview.evidenceUrl)) {
    reasons.push("Security review must pass with a durable evidence URL.");
  }
  if (manifest.reviewerApproval?.decision !== "APPROVE" ||
      !manifest.reviewerApproval.reviewer.trim() ||
      !Number.isFinite(Date.parse(manifest.reviewerApproval.reviewedAt)) ||
      !isHttpsUrl(manifest.reviewerApproval.evidenceUrl)) {
    reasons.push("Explicit reviewer approval with timestamp and evidence is required.");
  }
  if (!Array.isArray(manifest.knownLimitations)) reasons.push("Known limitations must be recorded.");
  return reasons;
}

export function providerExecutionBlocked(manifest: ProviderPromotionManifest): string | undefined {
  if (manifest.status === "BLOCKED") return "Provider is blocked by its promotion manifest.";
  if (manifest.status === "DEPRECATED") return "Provider is deprecated by its promotion manifest.";
  if (manifest.status === "VERIFIED" && providerPromotionBlockingReasons(manifest).length > 0) {
    return "Provider claims VERIFIED status without satisfying its promotion evidence gate.";
  }
  return undefined;
}

/** Initial inventory dispositions. These are research/pilot records, not certifications. */
export const PROVIDER_PROMOTION_INVENTORY: readonly ProviderPromotionManifest[] = [
  {
    schemaVersion: 1,
    providerId: "cad.build123d",
    providerVersion: "0.13.0",
    status: "PILOT",
    upstream: {
      repositoryUrl: "https://github.com/gumyr/build123d",
      revision: "v0.13.0",
      licenseSpdx: "Apache-2.0",
      licenseTextUrl: "https://github.com/gumyr/build123d/blob/v0.13.0/LICENSE",
      licenseReview: "SOURCE_REVIEWED",
      dependencyLicenseClosureReviewed: false,
      copyDisposition: "REFERENCE_ONLY",
    },
    runtime: {
      image: "python:3.12-slim + build123d",
      packageVersion: "build123d==0.13.0",
      timeoutMs: 60000,
      memoryLimitMb: 1024,
      cpuLimit: 2,
      pidsLimit: 128,
      networkAccess: "NONE",
      filesystem: "READ_ONLY_PLUS_ARTIFACTS",
      runsUnprivileged: true,
    },
    acceptance: {
      suiteId: "cad-geometry-neutral-v1",
      state: "NOT_RUN",
      analyticalReferencePassed: false,
      independentValidatorPassed: true,
    },
    securityReview: {
      state: "REVIEW_REQUIRED",
    },
    knownLimitations: [
      "Pinned package version but runtime image digest is not yet pinned.",
      "Shared analytical CAD/STEP round-trip benchmark is pending.",
      "Independent BREP validation exists, but it does not certify manufacturability or structural safety.",
      "Transitive dependency license and commercial redistribution review is incomplete.",
    ],
  },
  {
    schemaVersion: 1,
    providerId: "cadquery.benchmark",
    providerVersion: "2.8.0",
    status: "EXPERIMENTAL",
    upstream: {
      repositoryUrl: "https://github.com/CadQuery/cadquery",
      revision: "v2.8.0",
      licenseSpdx: "Apache-2.0",
      licenseTextUrl: "https://github.com/CadQuery/cadquery/blob/v2.8.0/LICENSE",
      licenseReview: "SOURCE_REVIEWED",
      dependencyLicenseClosureReviewed: false,
      copyDisposition: "REFERENCE_ONLY",
    },
    runtime: {
      image: "benchmark-only python:3.12-slim + CadQuery",
      packageVersion: "cadquery==2.8.0",
      timeoutMs: 60000,
      memoryLimitMb: 1024,
      cpuLimit: 2,
      pidsLimit: 128,
      networkAccess: "NONE",
      filesystem: "READ_ONLY_PLUS_ARTIFACTS",
      runsUnprivileged: true,
    },
    acceptance: {
      suiteId: "cad-geometry-neutral-v1",
      state: "NOT_RUN",
      analyticalReferencePassed: false,
      independentValidatorPassed: false,
    },
    securityReview: {
      state: "REVIEW_REQUIRED",
    },
    knownLimitations: [
      "Benchmark-only environment; not registered as an application provider.",
      "No provider promotion until shared CAD fixtures pass and runtime isolation, dependency/license closure, and review are completed.",
    ],
  },
  {
    schemaVersion: 1,
    providerId: "fea.gmsh-calculix.reference",
    providerVersion: "1.18",
    status: "PILOT",
    upstream: {
      repositoryUrl: "https://gitlab.onelab.info/gmsh/gmsh",
      revision: "4.15.0",
      licenseSpdx: "GPL-2.0-or-later WITH Gmsh-linking-exception",
      licenseTextUrl: "https://gmsh.info/doc/texinfo/gmsh.html#Licensing",
      licenseReview: "UNREVIEWED",
      dependencyLicenseClosureReviewed: false,
      copyDisposition: "REFERENCE_ONLY",
    },
    runtime: {
      image: "separate CalculiX/Gmsh worker",
      packageVersion: "Gmsh 4.15.0; CalculiX version separately recorded by worker",
      timeoutMs: 120000,
      memoryLimitMb: 1024,
      cpuLimit: 2,
      pidsLimit: 128,
      networkAccess: "NONE",
      filesystem: "READ_ONLY_PLUS_ARTIFACTS",
      runsUnprivileged: true,
    },
    acceptance: {
      suiteId: "fea-cantilever-known-answer-v1",
      state: "NOT_RUN",
      analyticalReferencePassed: false,
      independentValidatorPassed: false,
    },
    securityReview: {
      state: "REVIEW_REQUIRED",
    },
    knownLimitations: [
      "The existing CI smoke test proves worker protocol and solver execution only, not correctness against an independent structural reference answer.",
      "Gmsh is GPL-2.0-or-later with an upstream linking exception; closed-source redistribution/integration needs dedicated legal review.",
      "Do not promote or bundle until licensing, dependency closure, canonical analytical benchmarks, and mesh/solver/load provenance pass.",
    ],
  },
  {
    schemaVersion: 1,
    providerId: "maintenance.predictive-mcp.reference",
    providerVersion: "0.13.0",
    status: "EXPERIMENTAL",
    upstream: {
      repositoryUrl: "https://github.com/LGDiMaggio/predictive-maintenance-mcp",
      revision: "v0.13.0",
      licenseSpdx: "MIT",
      licenseTextUrl: "https://github.com/LGDiMaggio/predictive-maintenance-mcp/blob/main/LICENSE",
      licenseReview: "SOURCE_REVIEWED",
      dependencyLicenseClosureReviewed: false,
      copyDisposition: "REFERENCE_ONLY",
    },
    runtime: {
      image: "not integrated",
      packageVersion: "0.13.0",
      timeoutMs: 60000,
      memoryLimitMb: 1024,
      cpuLimit: 1,
      pidsLimit: 64,
      networkAccess: "NONE",
      filesystem: "READ_ONLY_PLUS_ARTIFACTS",
      runsUnprivileged: true,
    },
    acceptance: {
      suiteId: "maintenance-synthetic-signal-known-answer-v1",
      state: "NOT_RUN",
      analyticalReferencePassed: false,
      independentValidatorPassed: false,
    },
    securityReview: {
      state: "REVIEW_REQUIRED",
    },
    knownLimitations: [
      "No runtime integration or supported maintenance diagnosis is claimed.",
      "Upstream sample vibration data is CC BY-NC-SA 4.0 and must not be bundled in the commercial product without separate permission; use generated test signals or properly licensed customer data.",
      "Sensitivity, specificity, false-alarm rate, signal provenance, uncertainty, and out-of-distribution behavior need independent measurement.",
    ],
  },
];
