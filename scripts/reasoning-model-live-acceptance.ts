import { appendFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { createConfiguredReasoningGenerator, ModelTransportError } from "../src/reasoning-frameworks/openai-compatible-generator.js";
import { ModelBackedTaskReasoningProposer } from "../src/reasoning-frameworks/model-adapter.js";
import type { ModelReasoningGenerator } from "../src/reasoning-frameworks/model-adapter.js";
import { executeTaskReasoning } from "../src/task-graph/reasoning-execution.js";
import { routeTaskReasoning } from "../src/task-graph/reasoning.js";
import type { EngineeringTaskGraph } from "../src/task-graph/types.js";

const ADVISORY_LIMITATION =
  "Reasoning output is advisory and does not establish engineering correctness.";

interface AcceptanceEvidence {
  schemaVersion: 1;
  test: "reasoning-model-live-acceptance";
  outcome: "PASSED" | "FAILED";
  timestamp: string;
  durationMs: number;
  deploymentRevision: string;
  model: string;
  checks: Record<string, boolean>;
  recordStatus?: string;
  validationStatus?: string;
  failureCategory?: string;
  failureMessage?: string;
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const timestamp = new Date(startedAt).toISOString();
  const model = process.env.ENGINEERING_REASONING_MODEL_NAME?.trim() ?? "";
  const evidence: AcceptanceEvidence = {
    schemaVersion: 1,
    test: "reasoning-model-live-acceptance",
    outcome: "FAILED",
    timestamp,
    durationMs: 0,
    deploymentRevision:
      process.env.ENGINEERING_REASONING_ACCEPTANCE_DEPLOYMENT_REVISION ??
      process.env.GITHUB_SHA ??
      "local",
    model: model || "unconfigured",
    checks: {
      configurationPresent: false,
      realEndpointCalled: false,
      proposalReturned: false,
      proposalAcceptedByControlledValidator: false,
      trustedIdentityPreserved: false,
      validationNotClaimed: false,
      taskStateUnchanged: false,
      advisoryLimitationPresent: false,
      providerIdentityRecorded: false
    }
  };
  const outputPath =
    process.env.ENGINEERING_REASONING_ACCEPTANCE_OUTPUT_PATH ??
    "reasoning-model-live-acceptance.json";

  try {
    if (!process.env.ENGINEERING_REASONING_MODEL_URL?.trim() || !model) {
      throw new Error(
        "ENGINEERING_REASONING_MODEL_URL and ENGINEERING_REASONING_MODEL_NAME must be configured in the acceptance environment."
      );
    }

    const liveFetch: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      evidence.checks.realEndpointCalled = true;
      return response;
    };
    const configured = createConfiguredReasoningGenerator(process.env, liveFetch);
    if (!configured) {
      throw new Error("The configured reasoning model generator is unavailable.");
    }
    evidence.checks.configurationPresent = true;
    const generator: ModelReasoningGenerator = {
      async generate(request) {
        const proposal = await configured.generate(request);
        evidence.checks.proposalReturned = true;
        return proposal;
      }
    };

    const projectId = "live-model-acceptance-project";
    const taskId = "live-model-acceptance-task";
    const now = new Date().toISOString();
    const initialGraph: EngineeringTaskGraph = {
      id: "live-model-acceptance-graph",
      projectId,
      revision: 1,
      tasks: [
        {
          id: taskId,
          projectId,
          name: "Live model transport acceptance",
          goal:
            "Propose a concise checklist for validating a model API integration. Use only this request; do not perform engineering calculations or claim that tests have passed.",
          risk: "LOW",
          input: {
            requestedOutput:
              "An advisory checklist with explicit limitations and next gates."
          },
          status: "PROPOSED",
          createdAt: now,
          updatedAt: now
        }
      ]
    };

    const routed = routeTaskReasoning(initialGraph, taskId, {
      taskType: "problem-framing",
      requestedFramework: "first-principles",
      requestedFrameworkVersion: "1.0.0",
      required: true,
      now
    });
    if (routed.decision.status !== "SELECTED") {
      throw new Error("The live acceptance task could not select its pinned reasoning framework.");
    }

    const result = await executeTaskReasoning(
      routed.graph,
      taskId,
      new ModelBackedTaskReasoningProposer(generator),
      {
        now,
        recordId: `live-model-acceptance-${startedAt}`,
        trustedEvidenceReferences: [],
        provenance: {
          mode: "MODEL_BACKED",
          providerId: "openai-compatible-http",
          modelId: model,
          deploymentRevision: evidence.deploymentRevision
        }
      }
    );
    evidence.checks.proposalAcceptedByControlledValidator = true;
    evidence.recordStatus = result.record.status;
    evidence.validationStatus = result.record.validationStatus;

    if (result.record.status !== "PROPOSED" || result.record.output === undefined) {
      throw new Error("The live model did not return a complete PROPOSED reasoning record.");
    }

    evidence.checks.trustedIdentityPreserved =
      result.record.projectId === projectId &&
      result.record.taskId === taskId &&
      result.record.frameworkId === "first-principles" &&
      result.record.frameworkVersion === "1.0.0";
    if (!evidence.checks.trustedIdentityPreserved) {
      throw new Error("The accepted record did not preserve trusted project/task/framework identity.");
    }

    evidence.checks.providerIdentityRecorded =
      result.record.provenance?.mode === "MODEL_BACKED" &&
      result.record.provenance.providerId === "openai-compatible-http" &&
      result.record.provenance.modelId === model &&
      result.record.provenance.deploymentRevision === evidence.deploymentRevision;
    if (!evidence.checks.providerIdentityRecorded) {
      throw new Error("The reasoning record did not preserve host-authored provider provenance.");
    }

    evidence.checks.validationNotClaimed =
      result.record.validationStatus === "NOT_PERFORMED";
    if (!evidence.checks.validationNotClaimed) {
      throw new Error("The reasoning record incorrectly claimed engineering validation.");
    }

    evidence.checks.taskStateUnchanged =
      result.graph.tasks.find((candidate) => candidate.id === taskId)?.status === "PROPOSED";
    if (!evidence.checks.taskStateUnchanged) {
      throw new Error("The reasoning proposal changed task lifecycle state.");
    }

    evidence.checks.advisoryLimitationPresent =
      result.record.limitations.includes(ADVISORY_LIMITATION);
    if (!evidence.checks.advisoryLimitationPresent) {
      throw new Error("The accepted reasoning record is missing the mandatory advisory limitation.");
    }

    evidence.outcome = "PASSED";
  } catch (error) {
    evidence.outcome = "FAILED";
    evidence.failureCategory =
      error instanceof ModelTransportError
        ? "MODEL_TRANSPORT_ERROR"
        : error instanceof Error
          ? error.name
          : "UNKNOWN_ERROR";
    evidence.failureMessage =
      error instanceof Error
        ? error.message.slice(0, 320)
        : "Live model acceptance failed with an unknown error.";
  } finally {
    evidence.durationMs = Date.now() - startedAt;
    const serialized = JSON.stringify(evidence, null, 2);
    try {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, serialized + "\n", { encoding: "utf8", mode: 0o600 });
    } catch {
      console.error("Could not write the redacted live acceptance evidence file.");
      evidence.outcome = "FAILED";
      evidence.failureCategory = "EVIDENCE_WRITE_ERROR";
      evidence.failureMessage = "The redacted acceptance evidence file could not be written.";
    }

    const line = `[REASONING_MODEL_LIVE_ACCEPTANCE] ${JSON.stringify(evidence)}`;
    if (evidence.outcome === "PASSED") console.log(line);
    else console.error(line);

    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (summaryPath) {
      const summary = [
        "## Live reasoning model acceptance",
        "",
        `- **Outcome:** ${evidence.outcome}`,
        `- **Model:** ${evidence.model}`,
        `- **Deployment revision:** ${evidence.deploymentRevision}`,
        `- **Test timestamp:** ${evidence.timestamp}`,
        `- **Duration:** ${evidence.durationMs} ms`,
        `- **Record status:** ${evidence.recordStatus ?? "not produced"}`,
        `- **Validation status:** ${evidence.validationStatus ?? "not produced"}`,
        evidence.failureMessage ? `- **Failure:** ${evidence.failureMessage}` : "",
        "",
        "No API key, raw prompt, or full model output is recorded in this summary.",
        ""
      ].filter(Boolean).join("\n");
      try {
        await appendFile(summaryPath, summary, "utf8");
      } catch {
        console.error("Could not append the live acceptance summary.");
      }
    }
  }

  if (evidence.outcome !== "PASSED") process.exitCode = 1;
}

await main();
