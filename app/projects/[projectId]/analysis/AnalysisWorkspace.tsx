"use client";

import { useEffect, useMemo, useState } from "react";

type EngineeringEvent = { id: string; timestamp: string; actor: string; action: string; input?: unknown; output?: unknown; evidence?: string[] };
type Requirement = { name: string; value?: number | string; unit?: string };
type Snapshot = { revision: number; project: { requirements: Requirement[]; events: EngineeringEvent[]; nextAction?: string } };
type Calculation = { powerKw: number; speedRpm: number; angularVelocityRadPerSecond: number; torqueNm: number; formula: string; informationStatus: "CALCULATED" };
type ApiBody = { snapshot?: Snapshot; revision?: number; result?: { calculation?: Calculation; eventId?: string }; error?: string };

async function readBody(response: Response): Promise<ApiBody> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Analysis request failed.");
  return body as ApiBody;
}
function seededNumber(requirements: Requirement[], test: RegExp, unit: string): string {
  const item = requirements.find((requirement) => test.test(requirement.name) && (!requirement.unit || requirement.unit.toLowerCase() === unit));
  if (!item || item.value === undefined) return "";
  const parsed = Number(item.value);
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : "";
}
function readCalculation(event: EngineeringEvent | undefined): Calculation | undefined {
  if (!event || typeof event.output !== "object" || event.output === null) return undefined;
  const value = event.output as Partial<Calculation>;
  if (typeof value.torqueNm !== "number" || typeof value.powerKw !== "number" || typeof value.speedRpm !== "number") return undefined;
  return value as Calculation;
}

export default function AnalysisWorkspace({ projectId }: { projectId: string }) {
  const [revision, setRevision] = useState(0);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [events, setEvents] = useState<EngineeringEvent[]>([]);
  const [powerKw, setPowerKw] = useState("");
  const [speedRpm, setSpeedRpm] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const demo = projectId === "demo";

  const lastCalculation = useMemo(() => {
    for (const event of [...events].reverse()) {
      if (event.action === "ANALYSIS.SHAFT_TORQUE") {
        const found = readCalculation(event);
        if (found) return { event, calculation: found };
      }
    }
    return undefined;
  }, [events]);

  useEffect(() => {
    let active = true;
    if (demo) { setLoading(false); return () => { active = false; }; }
    queueMicrotask(() => {
      if (!active) return;
      fetch(`/api/projects/${encodeURIComponent(projectId)}/workspace`, { cache: "no-store" })
        .then(async (response) => {
          const body = await readBody(response);
          if (!body.snapshot) throw new Error("The workspace response did not contain a snapshot.");
          if (!active) return;
          setRevision(body.revision ?? body.snapshot.revision);
          setRequirements(body.snapshot.project.requirements ?? []);
          setEvents(body.snapshot.project.events ?? []);
          setPowerKw(seededNumber(body.snapshot.project.requirements ?? [], /power|input rating/i, "kw"));
          setSpeedRpm(seededNumber(body.snapshot.project.requirements ?? [], /speed|rotation|rpm/i, "rpm"));
          setError("");
        })
        .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "The analysis workspace could not be loaded."); })
        .finally(() => { if (active) setLoading(false); });
    });
    return () => { active = false; };
  }, [projectId, demo]);

  async function runCalculation() {
    if (busy || demo) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const power = Number(powerKw);
      const speed = Number(speedRpm);
      if (!Number.isFinite(power) || power <= 0 || !Number.isFinite(speed) || speed <= 0) {
        throw new Error("Enter a positive power in kW and rotational speed in rpm.");
      }
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/workspace`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "RUN_SHAFT_TORQUE", expectedRevision: revision, powerKw: power, speedRpm: speed })
      });
      const body = await readBody(response);
      if (!body.snapshot || !body.result?.calculation) throw new Error("The calculation was not persisted with its evidence record.");
      setRevision(body.revision ?? body.snapshot.revision);
      setRequirements(body.snapshot.project.requirements ?? []);
      setEvents(body.snapshot.project.events ?? []);
      setNotice("Deterministic calculation persisted. Result status is CALCULATED, not independently verified or design-approved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Calculation failed.");
    } finally { setBusy(false); }
  }

  if (demo) return <section className="panel">
    <p className="projectNotice projectNoticeWarning">Demo sandbox: this illustration is not linked to a durable project record.</p>
    <div className="metrics"><div className="metric"><span>Power</span><strong>5 kW</strong></div><div className="metric"><span>Speed</span><strong>1500 rpm</strong></div><div className="metric"><span>Torque</span><strong>31.830989 N·m</strong></div></div>
    <p className="muted">T = P / ω; ω = 2πn/60. Illustrative preliminary calculation only.</p>
  </section>;

  return <section className="analysisWorkspace">
    {loading && <p className="muted">Loading the project snapshot…</p>}
    {error && <p className="projectError" role="alert">{error}</p>}
    {notice && <p className="projectNoticeText" role="status">{notice}</p>}
    <section className="panel">
      <p className="eyebrow">DETERMINISTIC CALCULATION</p><h2>Rotational shaft torque</h2>
      <p className="muted">The calculation is deterministic and persisted to the project timeline. It does not size a shaft or certify its safety.</p>
      <div className="projectFormRow">
        <label className="projectField">Transmitted power (kW)<input type="number" min="0.000001" max="1000000" step="any" value={powerKw} onChange={(event) => setPowerKw(event.target.value)} disabled={busy || loading} placeholder="Enter power in kW" /></label>
        <label className="projectField">Rotational speed (rpm)<input type="number" min="0.000001" max="10000000" step="any" value={speedRpm} onChange={(event) => setSpeedRpm(event.target.value)} disabled={busy || loading} placeholder="Enter speed in rpm" /></label>
      </div>
      <div className="calculationFormula"><code>T = P / ω</code><code>ω = 2πn / 60</code><span>Units: P in W · n in rpm · T in N·m</span></div>
      <button className="button" type="button" onClick={() => void runCalculation()} disabled={busy || loading || !(Number(powerKw) > 0) || !(Number(speedRpm) > 0)}>{busy ? "Calculating and saving…" : "Calculate torque and save evidence"}</button>
    </section>
    {lastCalculation && <section className="panel">
      <div className="projectListHeader"><div><p className="eyebrow">LATEST RESULT</p><h2>Torque calculation</h2></div><span className="projectState projectState-active">CALCULATED</span></div>
      <div className="metrics"><div className="metric"><span>Power</span><strong>{lastCalculation.calculation.powerKw} kW</strong></div><div className="metric"><span>Speed</span><strong>{lastCalculation.calculation.speedRpm} rpm</strong></div><div className="metric"><span>Angular velocity</span><strong>{lastCalculation.calculation.angularVelocityRadPerSecond} rad/s</strong></div><div className="metric"><span>Torque</span><strong>{lastCalculation.calculation.torqueNm} N·m</strong></div></div>
      <div className="calculationFormula"><p>{lastCalculation.calculation.formula}</p><small>Recorded {new Date(lastCalculation.event.timestamp).toLocaleString()} · Evidence ID: {lastCalculation.event.evidence?.[0] ?? lastCalculation.event.id}</small></div>
      <p className="projectNotice projectNoticeWarning">This is a calculated result, not verification of shaft strength. Sizing still requires the load arrangement, material, stress criterion, stress concentrations and design factor.</p>
    </section>}
    <section className="panel">
      <p className="eyebrow">PROJECT INPUTS</p><h2>Relevant requirements</h2>
      {requirements.length === 0 && <p className="muted">No project requirements have been saved yet. Add the relevant power and speed constraints in Requirements or enter them above for a preliminary calculation.</p>}
      {requirements.length > 0 && <ul className="workspaceSimpleList">{requirements.map((item, index) => <li key={`${item.name}-${index}`}>{item.name}: <strong>{item.value === undefined ? "Not specified" : String(item.value)} {item.unit ?? ""}</strong></li>)}</ul>}
    </section>
  </section>;
}
