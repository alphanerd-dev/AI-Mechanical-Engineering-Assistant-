"use client";

import { useEffect, useState } from "react";

type EngineeringEvent = { id: string; timestamp: string; actor: string; action: string; input?: unknown; output?: unknown; evidence?: string[]; artifactIds?: string[] };
type Requirement = { name: string; value?: number | string; unit?: string };
type PumpArtifact = {
  id: string; projectId: string; name: string; capability: string; sourceRevision: number; workspaceRevision: number;
  executionStatus: "COMPLETED" | "FAILED"; validationStatus: "VALIDATED" | "FAILED" | "INCOMPLETE";
  approvalStatus: "NOT_REQUESTED" | "WAITING_APPROVAL" | "APPROVED" | "REJECTED";
  verificationStatus: "NOT_VERIFIED" | "VERIFIED";
  inputs: { density: { value: number; unit: string }; flowRate: { value: number; unit: string }; head: { value: number; unit: string }; efficiencyPercent: number };
  outputs: { hydraulicPowerW: number; hydraulicPowerKw: number; shaftPowerW: number; shaftPowerKw: number; hydraulicEquation: string; shaftEquation: string; assumptions: string[] };
  inputSha256: string; outputSha256: string;
  validationReceipt: { id: string; result: "PASS" | "FAIL" | "INCOMPLETE"; validatorId: string; validatorVersion: string; checks: string[]; warnings: string[]; inputSha256: string; outputSha256: string; validatedAt: string };
};
type Snapshot = { revision: number; project: { requirements: Requirement[]; events: EngineeringEvent[]; nextAction?: string }; artifacts?: PumpArtifact[] };
type Calculation = { powerKw: number; speedRpm: number; angularVelocityRadPerSecond: number; torqueNm: number; formula: string; informationStatus: "CALCULATED" };
type PumpCalculation = { hydraulicPowerW: number; hydraulicPowerKw: number; shaftPowerW: number; shaftPowerKw: number; hydraulicEquation: string; shaftEquation: string; assumptions: string[]; informationStatus: "CALCULATED" };
type ApiBody = { snapshot?: Snapshot; revision?: number; result?: { calculation?: Calculation | PumpCalculation; eventId?: string; artifact?: PumpArtifact; validation?: { result: "PASS" | "FAIL" | "INCOMPLETE"; warnings: string[] } }; error?: string };

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
  const [artifacts, setArtifacts] = useState<PumpArtifact[]>([]);
  const [density, setDensity] = useState("");
  const [densityUnit, setDensityUnit] = useState("kg/m3");
  const [flowRate, setFlowRate] = useState("");
  const [flowRateUnit, setFlowRateUnit] = useState("L/s");
  const [head, setHead] = useState("");
  const [headUnit, setHeadUnit] = useState("m");
  const [efficiencyPercent, setEfficiencyPercent] = useState("");
  const [pumpIdempotencyKey, setPumpIdempotencyKey] = useState("");
  const [powerKw, setPowerKw] = useState("");
  const [speedRpm, setSpeedRpm] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const demo = projectId === "demo";

  const lastPumpArtifact = [...artifacts].reverse().find((artifact) => artifact.capability === "ANALYSIS.PUMP_HYDRAULIC_POWER");

  const lastCalculation = (() => {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event.action === "ANALYSIS.SHAFT_TORQUE") {
        const found = readCalculation(event);
        if (found) return { event, calculation: found };
      }
    }
    return undefined;
  })();

  useEffect(() => {
    let active = true;
    if (demo) return () => { active = false; };
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
          setArtifacts(body.snapshot.artifacts ?? []);
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
      setArtifacts(body.snapshot.artifacts ?? []);
      setNotice("Deterministic calculation persisted. Result status is CALCULATED, not independently verified or design-approved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Calculation failed.");
    } finally { setBusy(false); }
  }

  async function runPumpCalculation() {
    if (busy || demo) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const pumpInput = {
        density: { value: Number(density), unit: densityUnit },
        flowRate: { value: Number(flowRate), unit: flowRateUnit },
        head: { value: Number(head), unit: headUnit },
        efficiencyPercent: Number(efficiencyPercent)
      };
      // Retain this key after ambiguous network failures; clear it only after input changes or a confirmed response.
      const idempotencyKey = pumpIdempotencyKey || globalThis.crypto.randomUUID();
      setPumpIdempotencyKey(idempotencyKey);
      if (![pumpInput.density.value, pumpInput.flowRate.value, pumpInput.head.value, pumpInput.efficiencyPercent].every(Number.isFinite)) {
        throw new Error("Enter numeric values for density, flow rate, head, and efficiency.");
      }
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/workspace`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "RUN_PUMP_HYDRAULIC_POWER", expectedRevision: revision, idempotencyKey, pumpInput })
      });
      const body = await readBody(response);
      if (!body.snapshot || !body.result?.artifact) throw new Error("The calculation artifact was not persisted.");
      setRevision(body.revision ?? body.snapshot.revision);
      setRequirements(body.snapshot.project.requirements ?? []);
      setEvents(body.snapshot.project.events ?? []);
      setArtifacts(body.snapshot.artifacts ?? []);
      setPumpIdempotencyKey("");
      setNotice(body.result.artifact.validationStatus === "VALIDATED"
        ? "Pump calculation saved. Capability-specific checks passed; the result is not independently verified or design-approved."
        : "The run completed but validation did not pass. Inspect the saved findings before relying on this result.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Pump calculation failed.");
    } finally {
      setBusy(false);
    }
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
    <section className="panel pumpPowerPanel">
      <p className="eyebrow">DETERMINISTIC FLUIDS CALCULATION · PILOT</p>
      <h2>Pump hydraulic and shaft power</h2>
      <p className="muted">Uses Pₕ = ρgQH and Pshaft = Pₕ/η. Enter every value with an explicit unit. A passing calculation check does not select a pump or approve a design.</p>
      <div className="pumpPowerForm">
        <label className="projectField">Fluid density
          <div className="pumpPowerFieldWithUnit"><input type="number" min="0.000001" step="any" value={density} onChange={(event) => { setDensity(event.target.value); setPumpIdempotencyKey(""); }} disabled={busy || loading} placeholder="e.g. 1000" /><select aria-label="Density unit" className="pumpPowerUnit" value={densityUnit} onChange={(event) => { setDensityUnit(event.target.value); setPumpIdempotencyKey(""); }} disabled={busy || loading}><option value="kg/m3">kg/m³</option><option value="g/cm3">g/cm³</option></select></div>
        </label>
        <label className="projectField">Volume flow rate
          <div className="pumpPowerFieldWithUnit"><input type="number" min="0.000001" step="any" value={flowRate} onChange={(event) => { setFlowRate(event.target.value); setPumpIdempotencyKey(""); }} disabled={busy || loading} placeholder="e.g. 20" /><select aria-label="Flow rate unit" className="pumpPowerUnit" value={flowRateUnit} onChange={(event) => { setFlowRateUnit(event.target.value); setPumpIdempotencyKey(""); }} disabled={busy || loading}><option value="m3/s">m³/s</option><option value="L/s">L/s</option><option value="m3/h">m³/h</option></select></div>
        </label>
        <label className="projectField">Total dynamic head
          <div className="pumpPowerFieldWithUnit"><input type="number" min="0.000001" step="any" value={head} onChange={(event) => { setHead(event.target.value); setPumpIdempotencyKey(""); }} disabled={busy || loading} placeholder="e.g. 20" /><select aria-label="Head unit" className="pumpPowerUnit" value={headUnit} onChange={(event) => { setHeadUnit(event.target.value); setPumpIdempotencyKey(""); }} disabled={busy || loading}><option value="m">m</option><option value="ft">ft</option></select></div>
        </label>
        <label className="projectField">Pump efficiency (%)
          <input type="number" min="0.000001" max="100" step="any" value={efficiencyPercent} onChange={(event) => { setEfficiencyPercent(event.target.value); setPumpIdempotencyKey(""); }} disabled={busy || loading} placeholder="e.g. 75" />
        </label>
      </div>
      <div className="calculationFormula"><code>Pₕ = ρgQH</code><code>Pshaft = Pₕ / η</code><span>SI calculation core · g = 9.80665 m/s²</span></div>
      <button className="button" type="button" onClick={() => void runPumpCalculation()} disabled={busy || loading || !(Number(density) > 0) || !(Number(flowRate) > 0) || !(Number(head) > 0) || !(Number(efficiencyPercent) > 0) || Number(efficiencyPercent) > 100}>{busy ? "Calculating and saving…" : "Calculate power and save artifact"}</button>
    </section>
    {lastPumpArtifact && <section className="panel pumpPowerPanel">
      <div className="projectListHeader"><div><p className="eyebrow">PERSISTED CALCULATION ARTIFACT</p><h2>Pump power result</h2></div><span className="projectState projectState-active">{lastPumpArtifact.validationStatus}</span></div>
      <div className="metrics"><div className="metric"><span>Hydraulic power</span><strong>{lastPumpArtifact.outputs.hydraulicPowerKw.toFixed(4)} kW</strong></div><div className="metric"><span>Estimated shaft power</span><strong>{lastPumpArtifact.outputs.shaftPowerKw.toFixed(4)} kW</strong></div></div>
      <p className="muted">{lastPumpArtifact.outputs.hydraulicEquation} · {lastPumpArtifact.outputs.shaftEquation}</p>
      <div className="pumpPowerEvidence">
        <div><span>Execution</span><strong>{lastPumpArtifact.executionStatus}</strong></div>
        <div><span>Capability validation</span><strong>{lastPumpArtifact.validationReceipt.result} · {lastPumpArtifact.validationReceipt.checks.length} checks</strong></div>
        <div><span>Human approval</span><strong>{lastPumpArtifact.approvalStatus}</strong></div>
        <div><span>Engineering verification</span><strong>{lastPumpArtifact.verificationStatus}</strong></div>
        <div><span>Artifact ID</span><code>{lastPumpArtifact.id}</code></div>
        <div><span>Source / saved revision</span><strong>{lastPumpArtifact.sourceRevision} / {lastPumpArtifact.workspaceRevision}</strong></div>
        <div><span>Input SHA-256</span><code>{lastPumpArtifact.inputSha256}</code></div>
        <div><span>Output SHA-256</span><code>{lastPumpArtifact.outputSha256}</code></div>
        <div><span>Receipt SHA-256 bindings</span><strong>{lastPumpArtifact.validationReceipt.inputSha256 === lastPumpArtifact.inputSha256 && lastPumpArtifact.validationReceipt.outputSha256 === lastPumpArtifact.outputSha256 ? "MATCH" : "MISMATCH"}</strong></div>
      </div>
      {lastPumpArtifact.validationReceipt.warnings.length > 0 && <p className="projectError" role="alert">{lastPumpArtifact.validationReceipt.warnings.join(" ")}</p>}
      <ul className="workspaceSimpleList">{lastPumpArtifact.outputs.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}</ul>
      <p className="projectNotice projectNoticeWarning">Validation covers input conversion and the stated equations only. It does not prove pump selection, NPSH/cavitation margin, duty-point suitability, piping losses, motor sizing, or system performance.</p>
    </section>}
    <section className="panel">
      <p className="eyebrow">PROJECT INPUTS</p><h2>Relevant requirements</h2>
      {requirements.length === 0 && <p className="muted">No project requirements have been saved yet. Add the relevant power and speed constraints in Requirements or enter them above for a preliminary calculation.</p>}
      {requirements.length > 0 && <ul className="workspaceSimpleList">{requirements.map((item, index) => <li key={`${item.name}-${index}`}>{item.name}: <strong>{item.value === undefined ? "Not specified" : String(item.value)} {item.unit ?? ""}</strong></li>)}</ul>}
    </section>
  </section>;
}
