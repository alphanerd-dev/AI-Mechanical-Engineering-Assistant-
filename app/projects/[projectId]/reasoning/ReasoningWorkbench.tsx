"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { EngineeringTask, EngineeringTaskGraph } from "../../../../src/task-graph/types";
import type { FrameworkReasoningRecord, ReasoningFrameworkManifest } from "../../../../src/reasoning-frameworks/types";

type WorkbenchPayload = {
  projectId: string;
  taskGraph: EngineeringTaskGraph;
  workspaceRevision: number;
  frameworks: ReasoningFrameworkManifest[];
  storageMode: "DURABLE" | "DEMO_EPHEMERAL";
  persisted: boolean;
  modelConfigured: boolean;
};
type MutationPayload = {
  taskGraph: EngineeringTaskGraph;
  task?: EngineeringTask;
  record?: FrameworkReasoningRecord;
  workspaceRevision: number;
  storageMode: "DURABLE" | "DEMO_EPHEMERAL";
  persisted: boolean;
  error?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseInputJson(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Task inputs must be valid JSON.");
  }
  if (!isPlainObject(parsed)) throw new Error("Task inputs must be a JSON object, such as { \"problem-statement\": \"... \" }.");
  return parsed;
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = isPlainObject(body) && typeof body.error === "string"
      ? body.error
      : "The reasoning workbench request failed.";
    throw new Error(error);
  }
  return body as T;
}

export default function ReasoningWorkbench({ projectId }: { projectId: string }) {
  const [taskGraph, setTaskGraph] = useState<EngineeringTaskGraph>();
  const [frameworks, setFrameworks] = useState<ReasoningFrameworkManifest[]>([]);
  const [workspaceRevision, setWorkspaceRevision] = useState<number>(0);
  const [storageMode, setStorageMode] = useState<"DURABLE" | "DEMO_EPHEMERAL">("DURABLE");
  const [persisted, setPersisted] = useState(false);
  const [modelConfigured, setModelConfigured] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [taskType, setTaskType] = useState("novel-design");
  const [risk, setRisk] = useState<EngineeringTask["risk"]>("MEDIUM");
  const [uncertainty, setUncertainty] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [frameworkId, setFrameworkId] = useState("first-principles");
  const [newInputsJson, setNewInputsJson] = useState("{}");
  const [inputDraft, setInputDraft] = useState("{}");

  const selectedTask = useMemo(
    () => taskGraph?.tasks.find((task) => task.id === selectedTaskId),
    [taskGraph, selectedTaskId]
  );
  const routingDecision = selectedTask?.reasoning?.routingDecision;
  const selectedFramework = frameworks.find((framework) => framework.id === frameworkId);
  const selectedTaskFramework = frameworks.find((framework) =>
    framework.id === routingDecision?.frameworkId &&
    framework.version === routingDecision?.frameworkVersion
  );

  function applyWorkbenchPayload(payload: WorkbenchPayload | MutationPayload) {
    setTaskGraph(payload.taskGraph);
    setWorkspaceRevision(payload.workspaceRevision);
    setStorageMode(payload.storageMode);
    setPersisted(payload.persisted);
    if ("frameworks" in payload) {
      setFrameworks(payload.frameworks);
      if (payload.frameworks.length && !payload.frameworks.some((item) => item.id === frameworkId)) {
        setFrameworkId(payload.frameworks[0].id);
      }
    }
  }

  async function refresh() {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch(
        `/api/engineering/reasoning?projectId=${encodeURIComponent(projectId)}`,
        { cache: "no-store" }
      );
      const payload = await readApiResponse<WorkbenchPayload>(response);
      applyWorkbenchPayload(payload);
      setModelConfigured(payload.modelConfigured);
      setNotice(payload.storageMode === "DEMO_EPHEMERAL"
        ? "Demo mode: task graphs and reasoning records are held in process memory and may reset. Registered project workspaces use the durable database snapshot."
        : payload.persisted
          ? "Workspace loaded from the project snapshot."
          : "No workspace snapshot exists yet. The first task will initialize one in the project database.");
      if (payload.taskGraph.tasks.length && !payload.taskGraph.tasks.some((task) => task.id === selectedTaskId)) {
        setSelectedTaskId(payload.taskGraph.tasks[0].id);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the reasoning workbench.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // Project changes represent a new workspace boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (selectedTask) setInputDraft(JSON.stringify(selectedTask.input ?? {}, null, 2));
  }, [selectedTaskId, selectedTask?.updatedAt]);

  async function mutate(body: Record<string, unknown>): Promise<MutationPayload> {
    const response = await fetch("/api/engineering/reasoning", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, projectId })
    });
    const payload = await readApiResponse<MutationPayload>(response);
    applyWorkbenchPayload(payload);
    setPersisted(payload.persisted);
    setError(undefined);
    return payload;
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyAction) return;
    setError(undefined);
    setNotice(undefined);
    let input: Record<string, unknown>;
    try {
      input = parseInputJson(newInputsJson);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Task inputs are invalid.");
      return;
    }
    if (!selectedFramework) {
      setError("Choose a registered reasoning framework.");
      return;
    }

    setBusyAction("CREATE_TASK");
    try {
      const payload = await mutate({
        action: "CREATE_TASK",
        name,
        goal,
        taskType,
        risk,
        uncertainty,
        frameworkId: selectedFramework.id,
        frameworkVersion: selectedFramework.version,
        input
      });
      if (payload.task) {
        setSelectedTaskId(payload.task.id);
        setInputDraft(JSON.stringify(payload.task.input ?? {}, null, 2));
      }
      setName("");
      setGoal("");
      setNewInputsJson("{}");
      setNotice("Task created and routed. Review the selected framework and any missing required inputs before requesting a proposal.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the reasoning task.");
    } finally {
      setBusyAction(undefined);
    }
  }

  async function saveInputs(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTask || busyAction) return;
    let input: Record<string, unknown>;
    try {
      input = parseInputJson(inputDraft);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Task inputs are invalid.");
      return;
    }

    setBusyAction("UPDATE_INPUTS");
    setError(undefined);
    setNotice(undefined);
    try {
      await mutate({ action: "UPDATE_INPUTS", taskId: selectedTask.id, input });
      setNotice("Inputs saved and the task re-routed against its pinned framework version. Earlier reasoning records were invalidated because the input context changed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update task inputs.");
    } finally {
      setBusyAction(undefined);
    }
  }

  async function propose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTask || busyAction || !modelConfigured) return;
    setBusyAction("PROPOSE_REASONING");
    setError(undefined);
    setNotice(undefined);
    try {
      const payload = await mutate({ action: "PROPOSE_REASONING", taskId: selectedTask.id });
      const record = payload.record;
      setNotice(record
        ? `Advisory ${record.status.toLowerCase()} reasoning record saved. Engineering validation remains NOT PERFORMED.`
        : "The reasoning proposal was processed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not generate a reasoning proposal.");
    } finally {
      setBusyAction(undefined);
    }
  }

  return <section className="reasoningWorkbench">
    <div className="reasoningWorkbenchHeader">
      <div>
        <p className="eyebrow">CONTROLLED REASONING</p>
        <h2>Task reasoning workbench</h2>
        <p className="muted">Route a task to a version-pinned framework, review missing inputs, and attach an advisory proposal to the task graph.</p>
      </div>
      <div className="reasoningHeaderMeta">
        <span className="pill">REV {workspaceRevision}</span>
        <span className="pill">{modelConfigured ? "MODEL CONFIGURED" : "MODEL NOT CONFIGURED"}</span>
      </div>
    </div>

    {storageMode === "DEMO_EPHEMERAL" && <div className="notice">
      Demo mode is process-local and not durable. Use a registered project UUID to save reasoning records in the database-backed workspace snapshot.
    </div>}
    {!modelConfigured && <div className="reasoningInfo">
      <strong>Model transport not configured</strong>
      <p>Task creation, framework routing, and input review remain available. To request a generated proposal, configure the server-only <code>ENGINEERING_REASONING_MODEL_URL</code> and <code>ENGINEERING_REASONING_MODEL_NAME</code> values.</p>
    </div>}
    {notice && <div className="reasoningInfo" role="status">{notice}</div>}
    {error && <div className="notice" role="alert">{error}</div>}

    {loading ? <div className="panel"><p>Loading project task graph…</p></div> : <>
      <div className="reasoningWorkbenchGrid">
        <div className="reasoningColumn">
          <section className="panel reasoningPanel">
            <div className="panelTitle"><div><p className="eyebrow">01 / DEFINE</p><h3>Create a reasoning task</h3></div></div>
            <form onSubmit={createTask} className="reasoningForm">
              <label>Task name
                <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} placeholder="e.g. Investigate recurring seal failure" disabled={Boolean(busyAction)} />
              </label>
              <label>Task goal
                <textarea value={goal} onChange={(event) => setGoal(event.target.value)} required rows={3} maxLength={3000} placeholder="Describe the question the team needs to reason through." disabled={Boolean(busyAction)} />
              </label>
              <div className="reasoningFormRow">
                <label>Task type
                  <input value={taskType} onChange={(event) => setTaskType(event.target.value)} required maxLength={80} disabled={Boolean(busyAction)} />
                </label>
                <label>Risk
                  <select value={risk} onChange={(event) => setRisk(event.target.value as EngineeringTask["risk"])} disabled={Boolean(busyAction)}>
                    <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option>
                  </select>
                </label>
              </div>
              <div className="reasoningFormRow">
                <label>Uncertainty
                  <select value={uncertainty} onChange={(event) => setUncertainty(event.target.value as "LOW" | "MEDIUM" | "HIGH")} disabled={Boolean(busyAction)}>
                    <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option>
                  </select>
                </label>
                <label>Reasoning framework
                  <select value={frameworkId} onChange={(event) => setFrameworkId(event.target.value)} required disabled={Boolean(busyAction) || frameworks.length === 0}>
                    {frameworks.map((framework) => <option key={`${framework.id}@${framework.version}`} value={framework.id}>{framework.name} · v{framework.version}</option>)}
                  </select>
                </label>
              </div>
              {selectedFramework && <p className="reasoningHint"><strong>Purpose:</strong> {selectedFramework.purpose}<br /><strong>Required inputs:</strong> {selectedFramework.requiredInputs.join(", ") || "None declared"}; the non-empty task goal is supplied as the <code>task</code> input.</p>}
              <label>Initial task inputs (JSON object)
                <textarea value={newInputsJson} onChange={(event) => setNewInputsJson(event.target.value)} rows={4} spellCheck={false} className="codeField" disabled={Boolean(busyAction)} />
              </label>
              <button className="button" type="submit" disabled={Boolean(busyAction) || !frameworks.length}>{busyAction === "CREATE_TASK" ? "Creating task…" : "Create task and route"}</button>
            </form>
          </section>

          <section className="panel reasoningPanel">
            <div className="panelTitle"><div><p className="eyebrow">02 / SELECT</p><h3>Project tasks</h3></div><span className="pill">{taskGraph?.tasks.length ?? 0} TASKS</span></div>
            {!taskGraph?.tasks.length ? <p className="muted">No reasoning tasks have been added to this workspace.</p> : <div className="reasoningTaskList">
              {taskGraph.tasks.map((task) => {
                const decision = task.reasoning?.routingDecision;
                const recordCount = task.reasoning?.records?.length ?? 0;
                return <button
                  type="button"
                  key={task.id}
                  className={`reasoningTaskItem ${selectedTaskId === task.id ? "selected" : ""}`}
                  onClick={() => setSelectedTaskId(task.id)}
                >
                  <span className="reasoningTaskItemTop"><strong>{task.name}</strong><span className="pill">{task.status}</span></span>
                  <span>{task.goal}</span>
                  <span className="reasoningTaskItemBottom">
                    <small>{decision?.frameworkId ? `${decision.frameworkId}@${decision.frameworkVersion ?? "?"}` : "No framework pinned"}</small>
                    <small>{decision?.status ?? "NOT ROUTED"} · {recordCount} RECORD{recordCount === 1 ? "" : "S"}</small>
                  </span>
                </button>;
              })}
            </div>}
          </section>
        </div>

        <div className="reasoningColumn">
          <section className="panel reasoningPanel reasoningDetail">
            <div className="panelTitle"><div><p className="eyebrow">03 / REVIEW</p><h3>Selected task</h3></div></div>
            {!selectedTask ? <p className="muted">Create or select a task to inspect its routing decision, inputs, and reasoning records.</p> : <>
              <div className="reasoningTaskSummary">
                <div><span className="tag">TASK</span><h3>{selectedTask.name}</h3><p>{selectedTask.goal}</p></div>
                <div className="reasoningSummaryPills"><span className="pill">{selectedTask.status}</span><span className="pill">{selectedTask.risk} RISK</span></div>
              </div>
              <div className="reasoningRouteCard">
                <div className="reasoningRouteHeader"><strong>Framework route</strong><span className={`pill route-${routingDecision?.status?.toLowerCase() ?? "none"}`}>{routingDecision?.status ?? "NOT ROUTED"}</span></div>
                <p>{selectedTaskFramework?.name ?? routingDecision?.frameworkId ?? "No framework selected"}{routingDecision?.frameworkVersion ? ` · v${routingDecision.frameworkVersion}` : ""}</p>
                {(routingDecision?.reasons ?? []).map((reason, index) => <p className="muted" key={index}>{reason}</p>)}
                {Boolean(routingDecision?.missingInputs.length) && <div className="notice">Missing required inputs: {routingDecision?.missingInputs.join(", ")}. Add these values below; never guess them.</div>}
              </div>

              <form onSubmit={saveInputs} className="reasoningForm">
                <label>Task inputs (replace current JSON object)
                  <textarea value={inputDraft} onChange={(event) => setInputDraft(event.target.value)} rows={6} spellCheck={false} className="codeField" disabled={Boolean(busyAction)} />
                </label>
                <p className="reasoningHint">Saving inputs re-runs framework routing and clears prior reasoning records because the input context has changed.</p>
                <button className="button secondaryButton" type="submit" disabled={Boolean(busyAction) || !routingDecision?.frameworkId || !routingDecision?.frameworkVersion}>
                  {busyAction === "UPDATE_INPUTS" ? "Saving inputs…" : "Save inputs and re-route"}
                </button>
              </form>

              <form onSubmit={propose} className="reasoningProposalAction">
                <button className="button" type="submit" disabled={
                  Boolean(busyAction) ||
                  !modelConfigured ||
                  routingDecision?.status !== "SELECTED" ||
                  ["READY", "RUNNING", "COMPLETED", "VERIFIED"].includes(selectedTask.status)
                }>{busyAction === "PROPOSE_REASONING" ? "Generating proposal…" : "Generate reasoning proposal"}</button>
                <span className="muted">Creates an advisory record only. It does not execute engineering work or change task status.</span>
              </form>
            </>}
          </section>

          {selectedTask && <section className="panel reasoningPanel">
            <div className="panelTitle"><div><p className="eyebrow">04 / EVIDENCE BOUNDARY</p><h3>Reasoning records</h3></div><span className="pill">{selectedTask.reasoning?.records?.length ?? 0} RECORDS</span></div>
            {!(selectedTask.reasoning?.records?.length) ? <p className="muted">No proposal records have been attached to this task.</p> : <div className="reasoningRecordList">
              {[...(selectedTask.reasoning?.records ?? [])].reverse().map((record) => <article className="reasoningRecord" key={record.recordId}>
                <div className="reasoningRecordHeader"><div><strong>{record.status}</strong><span className="muted"> · {record.frameworkId}@{record.frameworkVersion}</span></div><small>{new Date(record.createdAt).toLocaleString()}</small></div>
                <div className="reasoningValidationBoundary"><strong>VALIDATION: NOT PERFORMED</strong><span>Advisory output; this record does not establish engineering correctness.</span></div>
                {record.output !== undefined && <div className="reasoningRecordSection"><h4>Proposal output</h4><pre>{JSON.stringify(record.output, null, 2)}</pre></div>}
                <RecordList title="Assumptions" values={record.assumptions} />
                <RecordList title="Limitations" values={record.limitations} />
                <RecordList title="Required gates" values={record.requiredGates} />
                <RecordList title="Evidence references (not validated)" values={record.evidenceReferences} />
              </article>)}
            </div>}
          </section>}
        </div>
      </div>
    </>}
  </section>;
}

function RecordList({ title, values }: { title: string; values: string[] }) {
  if (!values.length) return null;
  return <div className="reasoningRecordSection"><h4>{title}</h4><ul>{values.map((value, index) => <li key={index}>{value}</li>)}</ul></div>;
}
