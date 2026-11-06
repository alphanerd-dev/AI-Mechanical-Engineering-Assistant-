"use client";

import { useEffect, useState } from "react";
import { isCalculationArtifactStale } from "../../../../src/artifacts/calculation-freshness";
import type { ShaftDesignWorkspaceState } from "../../../../src/workspace/shaft-design-state";
import { getShaftDesignDisplayAssumptions } from "../../../../src/workspace/shaft-design-presentation";

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
type Snapshot = { revision: number; project: { requirements: Requirement[]; events: EngineeringEvent[]; nextAction?: string }; artifacts?: PumpArtifact[]; shaftDesign?: ShaftDesignWorkspaceState };
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
  const [shaftDesignIdempotencyKey, setShaftDesignIdempotencyKey] = useState("");
  const [shaftDesign, setShaftDesign] = useState<ShaftDesignWorkspaceState>();
  const [shaftDesignDirty, setShaftDesignDirty] = useState(false);
  const [shaftDesignForm, setShaftDesignForm] = useState({
    bearingSpanMm: "",
    gearPositionFromLeftMm: "",
    pitchDiameterMm: "",
    pressureAngleDeg: "",
    axialLoadN: "",
    materialGrade: "",
    yieldStrengthMpa: "",
    ultimateTensileStrengthMpa: "",
    designFactor: "",
    bendingStressFactorKb: "",
    torsionalStressFactorKts: "",
    candidateDiameterMm: ""
  });
  const [powerKw, setPowerKw] = useState("");
  const [speedRpm, setSpeedRpm] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const demo = projectId === "demo";

  const shaftDesignIsLegacy = String(shaftDesign?.result.criterion ?? "") === "ASME_ELLIPTIC_STATIC_YIELD";
  const shaftDesignDisplayAssumptions = shaftDesign
    ? getShaftDesignDisplayAssumptions(shaftDesign.result)
    : [];
  const lastPumpArtifact = [...artifacts].reverse().find((artifact) => artifact.capability === "ANALYSIS.PUMP_HYDRAULIC_POWER");
  const lastPumpArtifactStale = Boolean(lastPumpArtifact) && isCalculationArtifactStale(lastPumpArtifact!, revision);

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
          setShaftDesign(body.snapshot.shaftDesign);
          setShaftDesignDirty(false);
          if (body.snapshot.shaftDesign) {
            const saved = body.snapshot.shaftDesign.input;
            setPowerKw(String(saved.powerKw));
            setSpeedRpm(String(saved.speedRpm));
            setShaftDesignForm({
              bearingSpanMm: String(saved.bearingSpanMm),
              gearPositionFromLeftMm: String(saved.gearPositionFromLeftMm),
              pitchDiameterMm: String(saved.pitchDiameterMm),
              pressureAngleDeg: String(saved.pressureAngleDeg),
              axialLoadN: String(saved.axialLoadN),
              materialGrade: saved.materialGrade,
              yieldStrengthMpa: String(saved.yieldStrengthMpa),
              ultimateTensileStrengthMpa: String(saved.ultimateTensileStrengthMpa),
              designFactor: String(saved.designFactor),
              bendingStressFactorKb: String(saved.bendingStressFactorKb),
              torsionalStressFactorKts: String(saved.torsionalStressFactorKts),
              candidateDiameterMm: saved.candidateDiameterMm === undefined ? "" : String(saved.candidateDiameterMm)
            });
          } else {
            setPowerKw(seededNumber(body.snapshot.project.requirements ?? [], /power|input rating/i, "kw"));
            setSpeedRpm(seededNumber(body.snapshot.project.requirements ?? [], /speed|rotation|rpm/i, "rpm"));
          }
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

  function updateShaftDesignField(field: keyof typeof shaftDesignForm, value: string) {
    setShaftDesignForm((current) => ({ ...current, [field]: value }));
    setShaftDesignDirty(true);
    setShaftDesignIdempotencyKey("");
  }

  async function runShaftDesign() {
    if (busy || demo) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const numericFields = {
        powerKw: Number(powerKw),
        speedRpm: Number(speedRpm),
        bearingSpanMm: Number(shaftDesignForm.bearingSpanMm),
        gearPositionFromLeftMm: Number(shaftDesignForm.gearPositionFromLeftMm),
        pitchDiameterMm: Number(shaftDesignForm.pitchDiameterMm),
        pressureAngleDeg: Number(shaftDesignForm.pressureAngleDeg),
        axialLoadN: Number(shaftDesignForm.axialLoadN),
        yieldStrengthMpa: Number(shaftDesignForm.yieldStrengthMpa),
        ultimateTensileStrengthMpa: Number(shaftDesignForm.ultimateTensileStrengthMpa),
        designFactor: Number(shaftDesignForm.designFactor),
        bendingStressFactorKb: Number(shaftDesignForm.bendingStressFactorKb),
        torsionalStressFactorKts: Number(shaftDesignForm.torsionalStressFactorKts)
      };
      if (!Object.values(numericFields).every(Number.isFinite) || !shaftDesignForm.materialGrade.trim() || !shaftDesignForm.axialLoadN.trim()) {
        throw new Error("Complete every shaft input with a valid number and a material grade. Axial load may be zero.");
      }
      const candidate = shaftDesignForm.candidateDiameterMm.trim()
        ? Number(shaftDesignForm.candidateDiameterMm)
        : undefined;
      if (candidate !== undefined && (!Number.isFinite(candidate) || candidate <= 0)) {
        throw new Error("Candidate diameter must be a positive number when supplied.");
      }
      const shaftInput = {
        ...numericFields,
        materialGrade: shaftDesignForm.materialGrade.trim(),
        ...(candidate === undefined ? {} : { candidateDiameterMm: candidate })
      };
      const idempotencyKey = shaftDesignIdempotencyKey || globalThis.crypto.randomUUID();
      setShaftDesignIdempotencyKey(idempotencyKey);
      const response = await fetch("/api/projects/" + encodeURIComponent(projectId) + "/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "ANALYSIS.SHAFT_STATIC_DESIGN",
          expectedRevision: revision,
          idempotencyKey,
          shaftInput
        })
      });
      const body = await readBody(response);
      if (!body.snapshot?.shaftDesign) throw new Error("The deterministic shaft design state was not persisted.");
      setRevision(body.revision ?? body.snapshot.revision);
      setRequirements(body.snapshot.project.requirements ?? []);
      setEvents(body.snapshot.project.events ?? []);
      setArtifacts(body.snapshot.artifacts ?? []);
      setShaftDesign(body.snapshot.shaftDesign);
      setShaftDesignDirty(false);
      setShaftDesignIdempotencyKey("");
      setNotice(body.snapshot.shaftDesign.result.passesStaticYield
        ? "Static-yield calculation saved. This is a capability-validated preliminary check, not fatigue verification, independent engineering verification or design approval."
        : "The calculation and failure finding were saved. The candidate diameter does not meet the stated static-yield design-factor criterion.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Shaft design calculation failed.");
    } finally {
      setBusy(false);
    }
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
        <label className="projectField">Transmitted power (kW)<input type="number" min="0.000001" max="1000000" step="any" value={powerKw} onChange={(event) => { setPowerKw(event.target.value); setShaftDesignDirty(true); setShaftDesignIdempotencyKey(""); }} disabled={busy || loading} placeholder="Enter power in kW" /></label>
        <label className="projectField">Rotational speed (rpm)<input type="number" min="0.000001" max="10000000" step="any" value={speedRpm} onChange={(event) => { setSpeedRpm(event.target.value); setShaftDesignDirty(true); setShaftDesignIdempotencyKey(""); }} disabled={busy || loading} placeholder="Enter speed in rpm" /></label>
      </div>
      <div className="calculationFormula"><code>T = P / ω</code><code>ω = 2πn / 60</code><span>Units: P in W · n in rpm · T in N·m</span></div>
      <button className="button" type="button" onClick={() => void runCalculation()} disabled={busy || loading || !(Number(powerKw) > 0) || !(Number(speedRpm) > 0)}>{busy ? "Calculating and saving…" : "Calculate torque and save evidence"}</button>
    </section>
    <section className="panel shaftDesignPanel">
      <p className="eyebrow">DETERMINISTIC ENGINEERING WORKFLOW · PILOT</p>
      <h2>Solid shaft static-yield design</h2>
      <p className="muted">Single gear load, simply supported shaft, axial force, bending and torsion. Inputs are saved with a revision-bound calculation artifact. This is not a complete shaft design or an ASME compliance assessment.</p>
      <div className="projectFormRow">
        <label className="projectField">Bearing span (mm)<input type="number" min="0.001" step="any" value={shaftDesignForm.bearingSpanMm} onChange={(event) => updateShaftDesignField("bearingSpanMm", event.target.value)} disabled={busy || loading} placeholder="e.g. 400" /></label>
        <label className="projectField">Gear position from left bearing (mm)<input type="number" min="0.001" step="any" value={shaftDesignForm.gearPositionFromLeftMm} onChange={(event) => updateShaftDesignField("gearPositionFromLeftMm", event.target.value)} disabled={busy || loading} placeholder="e.g. 150" /></label>
        <label className="projectField">Gear pitch diameter (mm)<input type="number" min="0.001" step="any" value={shaftDesignForm.pitchDiameterMm} onChange={(event) => updateShaftDesignField("pitchDiameterMm", event.target.value)} disabled={busy || loading} placeholder="e.g. 180" /></label>
        <label className="projectField">Pressure angle (degrees)<input type="number" min="0.001" max="89.999" step="any" value={shaftDesignForm.pressureAngleDeg} onChange={(event) => updateShaftDesignField("pressureAngleDeg", event.target.value)} disabled={busy || loading} placeholder="e.g. 20" /></label>
        <label className="projectField">Axial load (N)<input type="number" step="any" value={shaftDesignForm.axialLoadN} onChange={(event) => updateShaftDesignField("axialLoadN", event.target.value)} disabled={busy || loading} placeholder="Use 0 when absent" /></label>
        <label className="projectField">Material grade / condition<input type="text" maxLength={100} value={shaftDesignForm.materialGrade} onChange={(event) => updateShaftDesignField("materialGrade", event.target.value)} disabled={busy || loading} placeholder="e.g. AISI 4140" /></label>
        <label className="projectField">Yield strength Sy (MPa)<input type="number" min="0.001" step="any" value={shaftDesignForm.yieldStrengthMpa} onChange={(event) => updateShaftDesignField("yieldStrengthMpa", event.target.value)} disabled={busy || loading} placeholder="e.g. 415" /></label>
        <label className="projectField">Ultimate strength Sut (MPa)<input type="number" min="0.001" step="any" value={shaftDesignForm.ultimateTensileStrengthMpa} onChange={(event) => updateShaftDesignField("ultimateTensileStrengthMpa", event.target.value)} disabled={busy || loading} placeholder="e.g. 655" /></label>
        <label className="projectField">Design factor nd<input type="number" min="1" step="any" value={shaftDesignForm.designFactor} onChange={(event) => updateShaftDesignField("designFactor", event.target.value)} disabled={busy || loading} placeholder="e.g. 3" /></label>
        <label className="projectField">Bending stress multiplier Kb<input type="number" min="1" step="any" value={shaftDesignForm.bendingStressFactorKb} onChange={(event) => updateShaftDesignField("bendingStressFactorKb", event.target.value)} disabled={busy || loading} placeholder="e.g. 2" /></label>
        <label className="projectField">Torsional stress multiplier Kts<input type="number" min="1" step="any" value={shaftDesignForm.torsionalStressFactorKts} onChange={(event) => updateShaftDesignField("torsionalStressFactorKts", event.target.value)} disabled={busy || loading} placeholder="e.g. 1.6" /></label>
        <label className="projectField">Candidate diameter (mm, optional)<input type="number" min="0.001" step="any" value={shaftDesignForm.candidateDiameterMm} onChange={(event) => updateShaftDesignField("candidateDiameterMm", event.target.value)} disabled={busy || loading} placeholder="Defaults to preferred size" /></label>
      </div>
      <div className="calculationFormula">
        <code>sigma_VM = sqrt((sigma_a + sigma_b)^2 + 3 tau^2)</code>
        <code>sigma_VM &lt;= Sy / nd</code>
        <span>Power and speed are taken from the rotational shaft torque inputs above. Kb and Kts are explicit static stress multipliers, not fatigue factors.</span>
      </div>
      {demo && <p className="projectNotice projectNoticeWarning">The demo sandbox is read-only. Create or open a registered engineering project to calculate and persist a shaft design.</p>}
      <button className="button" type="button" onClick={() => void runShaftDesign()} disabled={busy || loading || demo || !(Number(powerKw) > 0) || !(Number(speedRpm) > 0)}>
        {demo ? "Registered project required" : busy ? "Calculating and saving…" : "Run static shaft design and persist state"}
      </button>
    </section>
    {shaftDesign && <section className="panel shaftDesignPanel">
      <div className="projectListHeader">
        <div><p className="eyebrow">{shaftDesignIsLegacy ? "LEGACY HISTORICAL SHAFT SNAPSHOT" : "VERSIONED SHAFT DESIGN STATE"} · REVISION {shaftDesign.designRevision}</p><h2>{shaftDesignIsLegacy ? "Historical Design Snapshot" : "Current Design State"}</h2></div>
        <div className="projectArtifactStatus">
          {shaftDesignIsLegacy
            ? <span className="projectState projectState-blocked">HISTORICAL · RECALCULATE</span>
            : <span className={shaftDesign.result.passesStaticYield ? "projectState projectState-active" : "projectState projectState-blocked"}>{shaftDesign.result.passesStaticYield ? "STATIC YIELD PASS" : "STATIC YIELD FAIL"}</span>}
          {shaftDesignDirty && <span className="projectState projectState-blocked">UNSAVED DRAFT</span>}
          {shaftDesign.workspaceRevision !== revision && <span className="projectState projectState-blocked">STALE</span>}
        </div>
      </div>
      {shaftDesignIsLegacy && <p className="projectNotice projectNoticeWarning" role="status">This immutable snapshot predates the criterion-label correction. Its stored numerical calculation used von Mises stress, but its old metadata incorrectly named the ASME elliptic criterion. The historical artifact is preserved for auditability; recalculate to create a current result. It is not an ASME elliptic assessment.</p>}
      <div className="metrics">
        <div className="metric"><span>Torque</span><strong>{shaftDesign.result.torqueNm.toFixed(3)} N·m</strong></div>
        <div className="metric"><span>Resultant gear force</span><strong>{shaftDesign.result.resultantTransverseForceN.toFixed(2)} N</strong></div>
        <div className="metric"><span>Maximum bending</span><strong>{shaftDesign.result.maximumBendingMomentNm.toFixed(3)} N·m</strong></div>
        <div className="metric"><span>Minimum / preferred diameter</span><strong>{shaftDesign.result.minimumDiameterMm.toFixed(3)} / {shaftDesign.result.preferredDiameterMm} mm</strong></div>
        <div className="metric"><span>Von Mises stress</span><strong>{shaftDesign.result.vonMisesStressMpa.toFixed(2)} MPa</strong></div>
        <div className="metric"><span>Achieved yield factor</span><strong>{shaftDesign.result.achievedYieldFactorOfSafety.toFixed(3)}</strong></div>
      </div>
      <div className="pumpPowerEvidence">
        <div><span>Power / speed</span><strong>{shaftDesign.input.powerKw} kW / {shaftDesign.input.speedRpm} rpm</strong></div>
        <div><span>Geometry / pressure angle</span><strong>{shaftDesign.input.bearingSpanMm} mm span · a {shaftDesign.input.gearPositionFromLeftMm} mm · b {(shaftDesign.input.bearingSpanMm - shaftDesign.input.gearPositionFromLeftMm).toFixed(2)} mm · dp {shaftDesign.input.pitchDiameterMm} mm · phi {shaftDesign.input.pressureAngleDeg}°</strong></div>
        <div><span>Gear forces</span><strong>Ft {shaftDesign.result.tangentialForceN.toFixed(2)} N · Fr {shaftDesign.result.radialForceN.toFixed(2)} N · Fa {shaftDesign.input.axialLoadN.toFixed(2)} N</strong></div>
        <div><span>Support reactions</span><strong>Left {shaftDesign.result.leftBearingReactionN.toFixed(2)} N · Right {shaftDesign.result.rightBearingReactionN.toFixed(2)} N</strong></div>
        <div><span>Material / strengths</span><strong>{shaftDesign.input.materialGrade} · Sy {shaftDesign.input.yieldStrengthMpa} MPa · Sut {shaftDesign.input.ultimateTensileStrengthMpa} MPa</strong></div>
        <div><span>Design factor / stress multipliers</span><strong>nd {shaftDesign.input.designFactor} · Kb {shaftDesign.input.bendingStressFactorKb} · Kts {shaftDesign.input.torsionalStressFactorKts}</strong></div>
        <div><span>Stress components</span><strong>Axial {shaftDesign.result.axialStressMpa.toFixed(2)} MPa · bending {shaftDesign.result.bendingStressMpa.toFixed(2)} MPa · torsion {shaftDesign.result.torsionalShearStressMpa.toFixed(2)} MPa</strong></div>
        <div><span>Principal stresses</span><strong>σ₁ {shaftDesign.result.principalStress1Mpa.toFixed(2)} MPa · σ₂ {shaftDesign.result.principalStress2Mpa.toFixed(2)} MPa</strong></div>
        <div><span>Candidate diameter / bending location</span><strong>{shaftDesign.result.candidateDiameterMm} mm / x = {shaftDesign.result.bendingMomentLocationMm} mm</strong></div>
        <div><span>Artifact ID</span><code>{shaftDesign.artifactId}</code></div>
        <div><span>Workspace source / saved revision</span><strong>{shaftDesign.sourceWorkspaceRevision} / {shaftDesign.workspaceRevision}</strong></div>
        <div><span>Input SHA-256</span><code>{shaftDesign.inputSha256}</code></div>
        <div><span>Result SHA-256</span><code>{shaftDesign.resultSha256}</code></div>
      </div>
      {shaftDesignDirty && <p className="projectNotice projectNoticeWarning" role="status">The form contains unsaved input changes. The results below still describe the last persisted design revision; run the calculation again to update them.</p>}
      {shaftDesign.workspaceRevision !== revision && <p className="projectNotice projectNoticeWarning" role="status">This saved design was calculated at workspace revision {shaftDesign.workspaceRevision}; the current workspace is revision {revision}. Treat the result as historical until rerun against the current revision.</p>}
      <ul className="workspaceSimpleList">{shaftDesignDisplayAssumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}</ul>
      <ul className="workspaceSimpleList">{shaftDesign.result.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>
      <p className="projectNotice projectNoticeWarning">A passing result only validates this stated static-yield model. It is not fatigue verification, independent engineering verification, human approval, or design release.</p>
    </section>}
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
      <div className="projectListHeader">
        <div><p className="eyebrow">PERSISTED CALCULATION ARTIFACT</p><h2>Pump power result</h2></div>
        <div className="projectArtifactStatus">
          <span className={`projectState ${lastPumpArtifact.validationStatus === "VALIDATED" ? "projectState-active" : "projectState-blocked"}`}>{lastPumpArtifact.validationStatus}</span>
          {lastPumpArtifactStale && <span className="projectState projectState-blocked">STALE</span>}
        </div>
      </div>
      {lastPumpArtifactStale && <p className="projectNotice projectNoticeWarning" role="status">This artifact was saved at workspace revision {lastPumpArtifact.workspaceRevision}, but the current workspace is revision {revision}. Its validation receipt remains historical evidence for the original inputs; rerun the calculation against the current workspace before relying on this result.</p>}
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
