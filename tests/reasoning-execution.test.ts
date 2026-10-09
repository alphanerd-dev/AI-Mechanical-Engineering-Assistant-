import { describe, expect, it, vi } from "vitest";
import { routeTaskReasoning } from "../src/task-graph/index.js";
import { executeTaskReasoning } from "../src/task-graph/reasoning-execution.js";
import type { EngineeringTaskGraph } from "../src/task-graph/types.js";

const NOW = "2026-10-09T05:00:00.000Z";
function makeGraph(): EngineeringTaskGraph { return { id: "g", projectId: "p", revision: 1, tasks: [{ id: "t", projectId: "p", name: "Design framing", goal: "Frame a shaft design problem.", risk: "MEDIUM", input: { powerKw: 5 }, status: "PROPOSED", createdAt: NOW, updatedAt: NOW }] }; }
function routed() { return routeTaskReasoning(makeGraph(), "t", { taskType: "novel-design", requestedFramework: "first-principles", required: true, now: NOW }).graph; }
const proposal = { status: "PROPOSED", assumptions: ["Stated inputs are the current design basis."], output: { nextStep: "List constraints." }, limitations: ["No engineering validation has been performed."], evidenceReferences: [], requiredGates: [] };

describe("controlled reasoning execution", () => {
 it("records an advisory proposal without changing task status", async () => { const graph = routed(); const proposer = { propose: vi.fn(async () => proposal) }; const result = await executeTaskReasoning(graph, "t", proposer, { now: NOW, recordId: "r1" }); expect(result.record).toMatchObject({ taskId: "t", projectId: "p", frameworkId: "first-principles", frameworkVersion: "1.0.0", status: "PROPOSED", validationStatus: "NOT_PERFORMED" }); expect(result.graph.tasks[0].status).toBe("PROPOSED"); expect(result.graph.tasks[0].reasoning?.records).toHaveLength(1); });
 it("stops before provider call when a required value is missing", async () => { const graph = makeGraph(); graph.tasks[0].input["material-specification"] = ""; const registry = (await import("../src/reasoning-frameworks/index.js")).createDefaultReasoningFrameworkRegistry(); registry.register({ schemaVersion: 1, id: "design-review", version: "1.0.0", name: "Design Review", purpose: "Review constraints.", suitableFor: ["design-review"], requiredInputs: ["task", "material-specification"], outputKind: "REASONING_RECORD" }); const selected = routeTaskReasoning(graph, "t", { taskType: "design-review", requestedFramework: "design-review", requestedFrameworkVersion: "1.0.0", frameworkRegistry: registry, now: NOW }).graph; const proposer = { propose: vi.fn(async () => proposal) }; await expect(executeTaskReasoning(selected, "t", proposer, { frameworkRegistry: registry, now: NOW })).rejects.toThrow(/required inputs are missing/); expect(proposer.propose).not.toHaveBeenCalled(); });
 it("rejects malformed provider output", async () => { const proposer = { propose: vi.fn(async () => ({ status: "PROPOSED", output: "incomplete" })) }; await expect(executeTaskReasoning(routed(), "t", proposer, { now: NOW })).rejects.toThrow(/field assumptions/); });
});
