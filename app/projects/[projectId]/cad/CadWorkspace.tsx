"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type CADModel = { id: string; projectId: string; name: string; createdAt: string; updatedAt: string };
type CADArtifact = {
  id: string;
  kind: string;
  name: string;
  uri?: string;
  validationStatus?: string;
  informationStatus?: string;
  evidenceIds?: string[];
};
type CADCompletion = {
  id: string;
  status: string;
  stage: string;
  raw_intent: string;
  intent_resolution?: { status?: string; nextQuestion?: string; reason?: string };
  specification?: { name?: string; diameterMm?: number; lengthMm?: number };
  artifact_records?: CADArtifact[];
  evidence_records?: Array<{ id: string; status: string; type: string; claim: string }>;
  errors?: string[];
  warnings?: string[];
  created_at: string;
  storage_objects?: string[];
  signedUrls?: Record<string, string>;
};

const EXAMPLE = "Create a cylindrical shaft with a diameter of 30 mm and a length of 200 mm.";

function statusClass(status: string) {
  if (status === "ACCEPTED" || status === "VERIFIED" || status === "PASS") return "cadStatus cadStatusGood";
  if (status === "NEEDS_INPUT" || status === "INCOMPLETE" || status === "BLOCKED") return "cadStatus cadStatusWarn";
  if (status === "REJECTED" || status === "FAILED" || status === "UNSUPPORTED" || status === "FAIL") return "cadStatus cadStatusBad";
  return "cadStatus";
}

function signedUrlFor(uri: string | undefined, links: Record<string, string> | undefined) {
  const prefix = "storage://engineering-cad-artifacts/";
  if (!uri?.startsWith(prefix)) return undefined;
  return links?.[uri.slice(prefix.length)];
}

export default function CadWorkspace({ projectId }: { projectId: string }) {
  const [models, setModels] = useState<CADModel[]>([]);
  const [completions, setCompletions] = useState<CADCompletion[]>([]);
  const [modelId, setModelId] = useState("");
  const [modelName, setModelName] = useState("New CAD model");
  const [intent, setIntent] = useState(EXAMPLE);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const [modelsResponse, completionsResponse] = await Promise.all([
      fetch("/api/cad/models?projectId=" + encodeURIComponent(projectId), { cache: "no-store" }),
      fetch("/api/cad/completions?projectId=" + encodeURIComponent(projectId), { cache: "no-store" })
    ]);
    const modelsBody = await modelsResponse.json().catch(() => ({}));
    const completionsBody = await completionsResponse.json().catch(() => ({}));
    if (!modelsResponse.ok) throw new Error(typeof modelsBody.error === "string" ? modelsBody.error : "CAD models could not be loaded.");
    if (!completionsResponse.ok) throw new Error(typeof completionsBody.error === "string" ? completionsBody.error : "CAD completion history could not be loaded.");
    const nextModels = Array.isArray(modelsBody.models) ? modelsBody.models as CADModel[] : [];
    setModels(nextModels);
    setCompletions(Array.isArray(completionsBody.completions) ? completionsBody.completions as CADCompletion[] : []);
    setModelId((current) => nextModels.some((model) => model.id === current) ? current : (nextModels[0]?.id ?? ""));
  }, [projectId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    refresh().catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : "CAD workspace could not be loaded.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  async function createModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !modelName.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/cad/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, name: modelName.trim() })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "CAD model identity could not be created.");
      const model = body.model as CADModel;
      setModels((current) => [model, ...current.filter((item) => item.id !== model.id)]);
      setModelId(model.id);
      setModelName("");
      setNotice("Canonical CAD model identity created and stored in this project.");
      await refresh();
      setModelId(model.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "CAD model creation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runCompletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !modelId || !intent.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/cad/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, modelIdentityId: modelId, rawIntent: intent.trim() })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "CAD completion request failed.");
      const completion = body.completion as CADCompletion | undefined;
      if (completion?.status === "ACCEPTED" && body.verified === true) {
        setNotice("Accepted. The solid was independently validated and its evidence and artifacts were persisted.");
      } else if (completion?.status === "NEEDS_INPUT") {
        setNotice(completion.intent_resolution?.nextQuestion ?? "More dimensional input is required before geometry generation.");
      } else if (completion?.status === "UNSUPPORTED") {
        setNotice(completion.intent_resolution?.reason ?? "This reference workflow does not support that geometry yet.");
      } else if (completion) {
        setNotice("Attempt recorded as " + completion.status + ". No unverified artifact was presented as accepted.");
      } else {
        setNotice("Request completed; reload the history to inspect the stored record.");
      }
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "CAD completion failed.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="cadWorkspace">
    <div className="cadIntro">
      <div>
        <p className="eyebrow">V2.1.6 · CAD COMPLETION WORKSPACE</p>
        <h2>From engineering intent to verified geometry</h2>
        <p className="muted">Supported reference path: cylindrical shafts and cylinders with explicit dimensions and units. Unsupported or ambiguous requests stop before generation.</p>
      </div>
      <span className="pill">{loading ? "LOADING" : "PROJECT SCOPED"}</span>
    </div>

    {error && <div className="notice cadError" role="alert">{error}</div>}
    {notice && <div className="cadNotice" role="status">{notice}</div>}

    <div className="cadWorkspaceGrid">
      <section className="panel">
        <p className="eyebrow">STEP 01</p>
        <h3>Canonical model identity</h3>
        <p className="muted">Store one project-scoped identity first. Native CAD vendor references can be linked later.</p>
        <label className="cadField">Select model
          <select value={modelId} onChange={(event) => setModelId(event.target.value)} disabled={busy || loading}>
            <option value="">Select a model…</option>
            {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
          </select>
        </label>
        <form className="cadModelForm" onSubmit={createModel}>
          <label className="cadField">New model name
            <input value={modelName} onChange={(event) => setModelName(event.target.value)} maxLength={160} placeholder="e.g. Transmission shaft" disabled={busy} />
          </label>
          <button className="button secondaryButton" type="submit" disabled={busy || !modelName.trim()}>{busy ? "Working…" : "Create model"}</button>
        </form>
        <div className="cadDivider" />
        <p className="cadSmall"><strong>Models in this project:</strong> {models.length}</p>
      </section>

      <section className="panel">
        <p className="eyebrow">STEP 02</p>
        <h3>Describe the part</h3>
        <p className="muted">Use explicit dimensions and units. The initial generator handles cylinders only; it does not infer missing sizes.</p>
        <form className="cadRunForm" onSubmit={runCompletion}>
          <label className="cadField">Engineering intent
            <textarea value={intent} onChange={(event) => setIntent(event.target.value)} maxLength={5000} rows={5} disabled={busy} placeholder="Describe shape, diameter and length with units…" />
          </label>
          <div className="cadExamples">
            <span>Example: “shaft, 30 mm diameter, 200 mm length”</span>
            <button type="button" className="cadTextButton" onClick={() => setIntent(EXAMPLE)} disabled={busy}>Use example</button>
          </div>
          <button className="button" type="submit" disabled={busy || loading || !modelId || !intent.trim()}>{busy ? "Executing verified workflow…" : "Generate and validate CAD"}</button>
          {!modelId && <p className="cadSmall">Create or select a model before sending a CAD request.</p>}
        </form>
      </section>
    </div>

    <section className="panel cadHistory">
      <div className="cadHistoryHeader">
        <div><p className="eyebrow">STEP 03</p><h3>Completion history and evidence</h3></div>
        <button className="button secondaryButton" type="button" onClick={() => refresh().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Refresh failed."))} disabled={loading || busy}>Refresh</button>
      </div>
      {loading && <p className="muted">Loading the project's persisted CAD history…</p>}
      {!loading && completions.length === 0 && <p className="muted">No CAD requests have been recorded for this project yet.</p>}
      <div className="cadCompletionList">
        {completions.map((completion) => {
          const artifacts = Array.isArray(completion.artifact_records) ? completion.artifact_records : [];
          const evidence = Array.isArray(completion.evidence_records) ? completion.evidence_records : [];
          return <article className="cadCompletionCard" key={completion.id}>
            <div className="cadCompletionHeader">
              <div><span className="cadSmall">{new Date(completion.created_at).toLocaleString()}</span><h4>{completion.raw_intent}</h4></div>
              <span className={statusClass(completion.status)}>{completion.status}</span>
            </div>
            <div className="cadSummary">
              <span>Stage: <strong>{completion.stage}</strong></span>
              {completion.specification && <span>{completion.specification.name ?? "cylinder"} · Ø{completion.specification.diameterMm} mm × {completion.specification.lengthMm} mm</span>}
              <span>Verified evidence: <strong>{evidence.filter((item) => item.status === "VERIFIED").length}</strong></span>
            </div>
            {completion.intent_resolution?.nextQuestion && <p className="cadFollowup">{completion.intent_resolution.nextQuestion}</p>}
            {completion.errors?.length ? <div className="cadMessageList"><strong>Errors</strong>{completion.errors.map((item, index) => <p key={index}>{item}</p>)}</div> : null}
            {completion.warnings?.length ? <div className="cadMessageList"><strong>Warnings</strong>{completion.warnings.map((item, index) => <p key={index}>{item}</p>)}</div> : null}
            {artifacts.length > 0 && <div className="cadArtifacts">
              <strong>Persisted artifacts</strong>
              {artifacts.map((artifact) => {
                const link = signedUrlFor(artifact.uri, completion.signedUrls);
                return <div className="cadArtifactRow" key={artifact.id}>
                  <div><span>{artifact.kind}</span><b>{artifact.name}</b><small>{artifact.informationStatus ?? "CALCULATED"} · {artifact.validationStatus ?? "UNVALIDATED"}</small></div>
                  {link ? <a className="cadDownloadLink" href={link} target="_blank" rel="noreferrer">Open artifact ↗</a> : <span className="cadSmall">No download link</span>}
                </div>;
              })}
            </div>}
            {evidence.length > 0 && <div className="cadEvidenceList">
              <strong>Evidence records</strong>
              {evidence.map((item) => <div className="cadArtifactRow" key={item.id}>
                <div><span>{item.type}</span><b>{item.claim}</b></div>
                <span className={statusClass(item.status)}>{item.status}</span>
              </div>)}
            </div>}
          </article>;
        })}
      </div>
    </section>
  </section>;
}
