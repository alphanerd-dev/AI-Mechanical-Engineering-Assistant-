"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Requirement = { id: string; name: string; value?: number | string; unit?: string; priority: string; verificationMethod?: string; status: string };
type EngineeringEvent = { id: string; timestamp: string; action: string; output?: unknown; evidence?: string[] };
type Snapshot = { revision: number; project: { requirements: Requirement[]; events: EngineeringEvent[]; assumptions: string[]; openQuestions: string[]; unresolvedRisks: string[] } };
type Assessment = { status: "BLOCKED" | "REVIEW_REQUIRED" | "PASS"; mustHaveCount: number; missingData: Array<{ id: string; name: string }>; awaitingEvidence: Array<{ id: string; name: string }> };
type Completion = { id: string; status: string; stage: string; raw_intent: string; created_at: string; evidence_records?: Array<{ id: string; status: string; type: string; claim: string }>; errors?: string[] };
type Readiness = { ready: boolean; status: string; checks: Array<{ name: string; status: string; detail: string }> };
type WorkspaceBody = { snapshot?: Snapshot; revision?: number; result?: { assessment?: Assessment; eventId?: string }; error?: string };
type ApiBody = { completions?: Completion[]; error?: string };

async function bodyOrThrow(response: Response): Promise<WorkspaceBody> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Workspace request failed.");
  return body as WorkspaceBody;
}
function completionTone(status: string) {
  return status === "ACCEPTED" || status === "VERIFIED" || status === "PASS" ? "projectState projectState-complete"
    : status === "BLOCKED" || status === "NEEDS_INPUT" || status === "INCOMPLETE" ? "projectState projectState-blocked"
    : "projectState";
}
function outputAssessment(event: EngineeringEvent | undefined): Assessment | undefined {
  if (!event || !event.output || typeof event.output !== "object") return undefined;
  const value = event.output as Partial<Assessment>;
  if (!["BLOCKED", "REVIEW_REQUIRED", "PASS"].includes(String(value.status))) return undefined;
  return value as Assessment;
}

export default function ValidationWorkspace({ projectId }: { projectId: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [revision, setRevision] = useState(0);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [readiness, setReadiness] = useState<Readiness>();
  const [assessment, setAssessment] = useState<Assessment>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const demo = projectId === "demo";

  const refresh = useCallback(async () => {
    const workspaceResponse = await fetch(`/api/projects/${encodeURIComponent(projectId)}/workspace`, { cache: "no-store" });
    const workspaceBody = await bodyOrThrow(workspaceResponse);
    if (!workspaceBody.snapshot) throw new Error("Workspace snapshot is missing.");
    setSnapshot(workspaceBody.snapshot);
    setRevision(workspaceBody.revision ?? workspaceBody.snapshot.revision);

    const [completionResponse, readinessResponse] = await Promise.all([
      fetch(`/api/cad/completions?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" }),
      fetch(`/api/cad/readiness?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" })
    ]);
    const completionBody = await completionResponse.json().catch(() => ({})) as ApiBody;
    if (completionResponse.ok) setCompletions(Array.isArray(completionBody.completions) ? completionBody.completions : []);
    else setCompletions([]);
    const readinessBody = await readinessResponse.json().catch(() => ({})) as Readiness;
    if (Array.isArray(readinessBody.checks)) setReadiness(readinessBody);
    else setReadiness(undefined);
    const events = workspaceBody.snapshot.project.events ?? [];
    for (const event of [...events].reverse()) {
      if (event.action === "VALIDATION.REQUIREMENT_COMPLETENESS") {
        setAssessment(outputAssessment(event));
        break;
      }
    }
    setError("");
  }, [projectId]);

  useEffect(() => {
    let active = true;
    if (demo) return () => { active = false; };
    queueMicrotask(() => {
      if (!active) return;
      refresh().catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "Validation records could not be loaded."); })
        .finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [refresh, demo]);

  async function runCheck() {
    if (busy || !snapshot || demo) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/workspace`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "CHECK_REQUIREMENTS", expectedRevision: revision })
      });
      const body = await bodyOrThrow(response);
      if (!body.snapshot || !body.result?.assessment) throw new Error("The requirements check did not return a recorded assessment.");
      setSnapshot(body.snapshot);
      setRevision(body.revision ?? body.snapshot.revision);
      setAssessment(body.result.assessment);
      setNotice("Completeness check recorded in the project timeline. It is not an engineering approval.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Completeness check failed.");
    } finally { setBusy(false); }
  }

  if (demo) return <section className="validationWorkspace">
    <p className="projectNotice projectNoticeWarning">Demo sandbox: these are example statuses, not live evidence.</p>
    <section className="panel"><EvidenceRow name="Torque calculation" kind="Illustrative calculation" state="CALCULATED" /><EvidenceRow name="Requirements completeness" kind="Review gate" state="BLOCKED" /><EvidenceRow name="Geometry validation" kind="OCCT evidence" state="NOT RUN" /></section>
  </section>;

  const requirements = snapshot?.project.requirements ?? [];
  const must = requirements.filter((item) => item.priority === "MUST");
  const calculatedEvents = (snapshot?.project.events ?? []).filter((event) => event.action.startsWith("ANALYSIS."));
  const validationEvents = (snapshot?.project.events ?? []).filter((event) => event.action.startsWith("VALIDATION."));

  return <section className="validationWorkspace">
    {loading && <p className="muted">Loading persisted validation records…</p>}
    {error && <p className="projectError" role="alert">{error}</p>}
    {notice && <p className="projectNoticeText" role="status">{notice}</p>}
    <section className="metrics">
      <div className="metric"><span>Requirements</span><strong>{requirements.length}</strong></div>
      <div className="metric"><span>Must-have</span><strong>{must.length}</strong></div>
      <div className="metric"><span>Recorded calculations</span><strong>{calculatedEvents.length}</strong></div>
      <div className="metric"><span>CAD attempts</span><strong>{completions.length}</strong></div>
    </section>
    <section className="panel">
      <div className="projectListHeader"><div><p className="eyebrow">REQUIREMENTS GATE</p><h2>Completeness and review state</h2></div><span className={completionTone(assessment?.status ?? "PENDING")}>{assessment?.status ?? "NOT CHECKED"}</span></div>
      <p className="muted">The check confirms whether required data and verification methods are defined. It does not itself prove a requirement has passed.</p>
      {assessment && <>
        <p>{assessment.mustHaveCount} MUST requirements assessed · {assessment.missingData.length} missing inputs · {assessment.awaitingEvidence.length} awaiting evidence/review.</p>
        {assessment.missingData.length > 0 && <ul className="workspaceSimpleList">{assessment.missingData.map((item) => <li key={item.id}><strong>{item.id}</strong> — {item.name}: add a value, unit and verification method.</li>)}</ul>}
        {assessment.awaitingEvidence.length > 0 && <ul className="workspaceSimpleList">{assessment.awaitingEvidence.map((item) => <li key={item.id}><strong>{item.id}</strong> — {item.name}: approval requires recorded evidence.</li>)}</ul>}
      </>}
      <button className="button" type="button" onClick={() => void runCheck()} disabled={busy || loading || !snapshot}>{busy ? "Checking…" : "Run and record completeness check"}</button>
    </section>
    <section className="panel">
      <div className="projectListHeader"><div><p className="eyebrow">CAD EXECUTION BOUNDARY</p><h2>Trusted runtime readiness</h2></div><span className={completionTone(readiness?.ready ? "PASS" : "BLOCKED")}>{readiness?.status ?? "UNKNOWN"}</span></div>
      <p className="muted">CAD execution is enabled only when the server reports all required checks as passing. The application will not label unvalidated geometry as accepted.</p>
      {readiness?.checks.length ? <div className="readinessChecks">{readiness.checks.map((check) => <div className="readinessCheck" key={check.name}><span className={completionTone(check.status)}>{check.status}</span><div><strong>{check.name.replaceAll("_", " ")}</strong><p>{check.detail}</p></div></div>)}</div> : <p className="muted">Readiness checks are unavailable. Open CAD to retry the diagnostic.</p>}
      <Link className="button secondaryButton" href={`/projects/${projectId}/cad`}>Open CAD workspace</Link>
    </section>
    <section className="panel">
      <p className="eyebrow">RECORDED EVIDENCE</p><h2>CAD completion history</h2>
      {completions.length === 0 && <p className="muted">No CAD completion records are available for this project yet.</p>}
      <div className="evidenceList">{completions.map((completion) => <article className="evidenceCard" key={completion.id}>
        <div className="projectListHeader"><div><strong>{completion.raw_intent}</strong><small>{new Date(completion.created_at).toLocaleString()} · {completion.stage}</small></div><span className={completionTone(completion.status)}>{completion.status}</span></div>
        {completion.evidence_records?.length ? completion.evidence_records.map((item) => <div className="readinessCheck" key={item.id}><span className={completionTone(item.status)}>{item.status}</span><div><strong>{item.type}</strong><p>{item.claim}</p></div></div>) : <p className="muted">No evidence records attached to this attempt.</p>}
        {completion.errors?.length ? <ul className="workspaceSimpleList">{completion.errors.map((item, index) => <li key={index}>{item}</li>)}</ul> : null}
      </article>)}</div>
    </section>
    <section className="panel">
      <p className="eyebrow">VALIDATION TIMELINE</p><h2>Recent recorded checks</h2>
      {validationEvents.length === 0 && <p className="muted">No validation checks have been recorded. Run the completeness check to begin the project audit trail.</p>}
      <div className="evidenceList">{[...validationEvents].reverse().map((event) => <div className="readinessCheck" key={event.id}><span className="projectState">{event.action}</span><div><strong>{new Date(event.timestamp).toLocaleString()}</strong><p>Evidence reference: {event.evidence?.[0] ?? event.id}</p></div></div>)}</div>
    </section>
  </section>;
}

function EvidenceRow({ name, kind, state }: { name: string; kind: string; state: string }) {
  return <div className="evidence"><div><b>{name}</b><small>{kind}</small></div><strong>{state}</strong></div>;
}
