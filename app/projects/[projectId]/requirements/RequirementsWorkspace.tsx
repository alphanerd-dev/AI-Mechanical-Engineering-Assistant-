"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Requirement, RequirementPriority } from "../../../../src/core/types.js";

type Snapshot = {
  revision: number;
  project: { requirements: Requirement[]; assumptions: string[]; openQuestions: string[] };
};
type WorkspaceResponse = { snapshot?: Snapshot; revision?: number; error?: string; result?: unknown };

async function readBody(response: Response): Promise<WorkspaceResponse> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Workspace request failed.");
  return body as WorkspaceResponse;
}
function rowValue(value: number | string | undefined) { return value === undefined ? "" : String(value); }

export default function RequirementsWorkspace({ projectId }: { projectId: string }) {
  const [revision, setRevision] = useState(0);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [assumptionsText, setAssumptionsText] = useState("");
  const [questionsText, setQuestionsText] = useState("");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [priority, setPriority] = useState<RequirementPriority>("MUST");
  const [verificationMethod, setVerificationMethod] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/workspace`, { cache: "no-store" });
    const body = await readBody(response);
    if (!body.snapshot) throw new Error("The workspace response did not contain a snapshot.");
    setRevision(body.revision ?? body.snapshot.revision);
    setRequirements(body.snapshot.project.requirements ?? []);
    setAssumptionsText((body.snapshot.project.assumptions ?? []).join("\n"));
    setQuestionsText((body.snapshot.project.openQuestions ?? []).join("\n"));
    setError("");
  }

  useEffect(() => {
    let active = true;
    if (projectId === "demo") return () => { active = false; };
    queueMicrotask(() => {
      if (!active) return;
      load().catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Requirements could not be loaded.");
      }).finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function save(operation: string, values: Record<string, unknown>, successText: string) {
    if (busy || projectId === "demo") return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/workspace`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation, expectedRevision: revision, ...values })
      });
      const body = await readBody(response);
      if (!body.snapshot) throw new Error("The saved workspace response did not include its snapshot.");
      setRevision(body.revision ?? body.snapshot.revision);
      setRequirements(body.snapshot.project.requirements ?? []);
      setAssumptionsText((body.snapshot.project.assumptions ?? []).join("\n"));
      setQuestionsText((body.snapshot.project.openQuestions ?? []).join("\n"));
      setNotice(successText);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Workspace changes could not be saved.");
    } finally { setBusy(false); }
  }

  function addRequirement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (projectId === "demo" || !name.trim()) return;
    const newRequirement: Requirement = {
      id: `REQ-${crypto.randomUUID()}`,
      name: name.trim(),
      priority,
      status: "OPEN",
      ...(value.trim() ? { value: value.trim() } : {}),
      ...(unit.trim() ? { unit: unit.trim() } : {}),
      ...(verificationMethod.trim() ? { verificationMethod: verificationMethod.trim() } : {})
    };
    setRequirements((current) => [...current, newRequirement]);
    setName(""); setValue(""); setUnit(""); setVerificationMethod("");
    setNotice("Requirement added to the local draft. Save requirements to persist it.");
  }

  const readOnly = projectId === "demo";
  return <section className="requirementsWorkspace">
    {readOnly && <p className="projectNotice projectNoticeWarning">Demo sandbox: the rows below are illustrative examples and are not saved to Supabase.</p>}
    {error && <p className="projectError" role="alert">{error}</p>}
    {notice && <p className="projectNoticeText" role="status">{notice}</p>}
    {loading && <p className="muted">Loading persisted requirements…</p>}

    <section className="panel">
      <div className="projectListHeader"><div><p className="eyebrow">REQUIREMENT REGISTER</p><h2>Design constraints</h2></div><span className="projectState">Revision {revision || "—"}</span></div>
      {!loading && requirements.length === 0 && <p className="muted">No requirements have been recorded yet. Capture each constraint with its unit and a verification method.</p>}
      <div className="requirementsTableWrap"><table className="requirementsTable">
        <thead><tr><th>ID</th><th>Requirement</th><th>Target</th><th>Priority</th><th>Verification method</th>{!readOnly && <th>Draft</th>}</tr></thead>
        <tbody>
          {(readOnly ? [
            { id: "REQ-001", name: "Transmit power", value: "5", unit: "kW", priority: "MUST", verificationMethod: "Nameplate / calculation", status: "OPEN" },
            { id: "REQ-002", name: "Operating speed", value: "1500", unit: "rpm", priority: "MUST", verificationMethod: "Nameplate / tachometer", status: "OPEN" },
            { id: "REQ-003", name: "Material", value: "OPEN", priority: "MUST", verificationMethod: "Material certificate", status: "OPEN" }
          ] as Requirement[] : requirements).map((item) => <tr key={item.id}>
            <td><code>{item.id}</code></td><td>{item.name}</td><td>{rowValue(item.value)} {item.unit ?? ""}</td><td><span className="tag">{item.priority}</span></td><td>{item.verificationMethod ?? "Not defined"}</td>
            {!readOnly && <td><button type="button" className="textButton" onClick={() => setRequirements((current) => current.filter((entry) => entry.id !== item.id))} disabled={busy}>Remove</button></td>}
          </tr>)}
        </tbody>
      </table></div>
      {!readOnly && <div className="requirementsActions"><button type="button" className="button" onClick={() => void save("UPDATE_REQUIREMENTS", { requirements }, "Requirements saved to the project workspace.")} disabled={busy || loading}>{busy ? "Saving…" : "Save requirements"}</button><span className="muted">Saving records a revision. Values remain unverified until supported by evidence.</span></div>}
    </section>

    {!readOnly && <section className="panel">
      <p className="eyebrow">ADD CONSTRAINT</p><h2>New requirement</h2>
      <form className="projectForm" onSubmit={addRequirement}>
        <label className="projectField">Requirement name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required placeholder="e.g. Maximum shaft deflection" disabled={busy} /></label>
        <div className="projectFormRow">
          <label className="projectField">Target value<input value={value} onChange={(event) => setValue(event.target.value)} maxLength={160} placeholder="e.g. 0.5" disabled={busy} /></label>
          <label className="projectField">Unit<input value={unit} onChange={(event) => setUnit(event.target.value)} maxLength={40} placeholder="e.g. mm" disabled={busy} /></label>
          <label className="projectField">Priority<select value={priority} onChange={(event) => setPriority(event.target.value as RequirementPriority)} disabled={busy}><option value="MUST">MUST</option><option value="SHOULD">SHOULD</option><option value="COULD">COULD</option></select></label>
        </div>
        <label className="projectField">Verification method<input value={verificationMethod} onChange={(event) => setVerificationMethod(event.target.value)} maxLength={240} placeholder="e.g. FEA with defined load cases" disabled={busy} /></label>
        <button className="button secondaryButton" type="submit" disabled={busy || !name.trim()}>Add to draft</button>
      </form>
    </section>}

    {!readOnly && <section className="panel">
      <p className="eyebrow">ENGINEERING CONTEXT</p><h2>Assumptions and open questions</h2>
      <p className="muted">Use one entry per line. Keep assumptions distinct from measured or verified facts.</p>
      <div className="projectFormRow projectFormRowText">
        <label className="projectField">Assumptions<textarea value={assumptionsText} onChange={(event) => setAssumptionsText(event.target.value)} rows={5} maxLength={10000} disabled={busy} placeholder="One explicitly stated assumption per line" /></label>
        <label className="projectField">Open questions<textarea value={questionsText} onChange={(event) => setQuestionsText(event.target.value)} rows={5} maxLength={10000} disabled={busy} placeholder="One unresolved question per line" /></label>
      </div>
      <div className="requirementsActions">
        <button className="button secondaryButton" type="button" onClick={() => void save("UPDATE_ASSUMPTIONS", { assumptions: assumptionsText.split("\n").map((item) => item.trim()).filter(Boolean) }, "Assumptions saved.")} disabled={busy || loading}>Save assumptions</button>
        <button className="button secondaryButton" type="button" onClick={() => void save("UPDATE_OPEN_QUESTIONS", { questions: questionsText.split("\n").map((item) => item.trim()).filter(Boolean) }, "Open questions saved.")} disabled={busy || loading}>Save questions</button>
      </div>
    </section>}
  </section>;
}
