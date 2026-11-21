"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Box, LoaderCircle, RefreshCw } from "lucide-react";
import CADDisplayViewport from "./CADDisplayViewport";

type Derivative = {
  artifactId: string;
  sourceArtifactId: string;
  sourceArtifactSha256: string;
  artifactSha256: string;
  converter: { providerId: string; version: string };
  modelRevision: number;
  tessellation: { linearDeflectionMm: number; angularDeflectionRad: number };
};

type State = { signedUrl: string | null; derivative: Derivative | null; error: string | null; loading: boolean; stale: boolean; freshnessUnverified: boolean };
type PreviewRequest = {
  projectId: string; modelIdentityId: string; completionId: string; sourceArtifactId: string;
};
type DerivativeStatus =
  | { kind: "CURRENT"; signedUrl: string; derivative: Derivative }
  | { kind: "STALE" | "UNVERIFIABLE" | "MISSING" };
class StaleCADSourceError extends Error {}
class DerivativeFreshnessError extends Error {}

async function postDisplayDerivative(input: PreviewRequest): Promise<Response> {
  return fetch("/api/cad/geometry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...input, operation: "TESSELLATE",
      linearDeflectionMm: 0.1, angularDeflectionRad: 0.35
    }),
    cache: "no-store"
  });
}

function readDerivativeErrorField(body: unknown): Record<string, unknown> | null {
  if (body === null) return null;
  if (typeof body !== "object") return null;
  if (Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

function displayDerivativeError(body: unknown): string {
  const record = readDerivativeErrorField(body);
  if (!record) return "CAD display derivative generation failed.";
  if (typeof record.error === "string") return record.error;
  if (Array.isArray(record.errors)) {
    return record.errors.filter((item): item is string => typeof item === "string").join("; ");
  }
  return "CAD display derivative generation failed.";
}

function nonEmptyRecordString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (typeof value !== "string") return null;
  return value.trim() ? value : null;
}

interface DerivativeIdentity {
  artifactId: string;
  sourceArtifactId: string;
  sourceArtifactSha256: string;
  artifactSha256: string;
}

type PartialDerivativeIdentity = {
  artifactId: string | null;
  sourceArtifactId: string | null;
  sourceArtifactSha256: string | null;
  artifactSha256: string | null;
};

function sha256RecordString(record: Record<string, unknown>, key: string): string | null {
  const value = nonEmptyRecordString(record, key);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

function isCompleteDerivativeIdentity(value: PartialDerivativeIdentity): value is DerivativeIdentity {
  return Object.values(value).every(item => typeof item === "string" && item.length > 0);
}

function parseDerivativeIdentity(record: Record<string, unknown>): DerivativeIdentity | null {
  const identity: PartialDerivativeIdentity = {
    artifactId: nonEmptyRecordString(record, "artifactId"),
    sourceArtifactId: nonEmptyRecordString(record, "sourceArtifactId"),
    sourceArtifactSha256: sha256RecordString(record, "sourceArtifactSha256"),
    artifactSha256: sha256RecordString(record, "artifactSha256")
  };
  return isCompleteDerivativeIdentity(identity) ? identity : null;
}

function parseDerivativeConverter(value: unknown): Derivative["converter"] | null {
  const record = readDerivativeErrorField(value);
  if (!record) return null;
  const providerId = nonEmptyRecordString(record, "providerId");
  const version = nonEmptyRecordString(record, "version");
  if (!providerId || !version) return null;
  return { providerId, version };
}

function parseDerivativeRevision(value: unknown): number | null {
  if (!Number.isSafeInteger(value)) return null;
  const revision = Number(value);
  return revision >= 1 ? revision : null;
}

function parseDerivativeTessellation(value: unknown): Derivative["tessellation"] | null {
  const record = readDerivativeErrorField(value);
  if (!record) return null;
  const linearDeflectionMm = record.linearDeflectionMm;
  const angularDeflectionRad = record.angularDeflectionRad;
  if (typeof linearDeflectionMm !== "number" || !Number.isFinite(linearDeflectionMm)) return null;
  if (typeof angularDeflectionRad !== "number" || !Number.isFinite(angularDeflectionRad)) return null;
  return { linearDeflectionMm, angularDeflectionRad };
}

interface ParsedDerivativeParts {
  identity: DerivativeIdentity | null;
  converter: Derivative["converter"] | null;
  modelRevision: number | null;
  tessellation: Derivative["tessellation"] | null;
}

function isCompleteDerivativeParts(
  parts: ParsedDerivativeParts
): parts is {
  identity: DerivativeIdentity;
  converter: Derivative["converter"];
  modelRevision: number;
  tessellation: Derivative["tessellation"];
} {
  return Object.values(parts).every(value => value !== null);
}

function parseDerivativeRecord(value: unknown): Derivative | null {
  const record = readDerivativeErrorField(value);
  if (!record) return null;
  const parts: ParsedDerivativeParts = {
    identity: parseDerivativeIdentity(record),
    converter: parseDerivativeConverter(record.converter),
    modelRevision: parseDerivativeRevision(record.modelRevision),
    tessellation: parseDerivativeTessellation(record.tessellation)
  };
  return isCompleteDerivativeParts(parts)
    ? { ...parts.identity, converter: parts.converter, modelRevision: parts.modelRevision, tessellation: parts.tessellation }
    : null;
}

function parseDisplayDerivativeResponse(body: unknown): { signedUrl: string; derivative: Derivative } | null {
  const record = readDerivativeErrorField(body);
  if (!record) return null;
  if (typeof record.signedUrl !== "string" || !record.signedUrl.trim()) return null;
  const derivative = parseDerivativeRecord(record.derivative);
  if (!derivative) return null;
  return { signedUrl: record.signedUrl, derivative };
}

async function requestDisplayDerivative(input: PreviewRequest): Promise<{ signedUrl: string; derivative: Derivative }> {
  const response = await postDisplayDerivative(input);
  const body: unknown = await response.json().catch(() => ({}));
  const result = parseDisplayDerivativeResponse(body);
  if (response.status === 409) throw new StaleCADSourceError(displayDerivativeError(body));
  if (!response.ok || !result) throw new Error(displayDerivativeError(body));
  return result;
}

async function readCurrentDerivative(input: PreviewRequest, artifactId: string): Promise<DerivativeStatus> {
  if (!input.modelIdentityId) return { kind: "UNVERIFIABLE" };
  const query = new URLSearchParams({ projectId: input.projectId, modelIdentityId: input.modelIdentityId });
  const response = await fetch("/api/cad/geometry?" + query.toString(), { cache: "no-store" });
  const body: unknown = await response.json().catch(() => null);
  const record = readDerivativeErrorField(body);
  if (!response.ok || !record || !Array.isArray(record.derivatives)) {
    throw new DerivativeFreshnessError("The current CAD source revision could not be verified. The preview is hidden until verification succeeds.");
  }
  const row = record.derivatives.find((item) => readDerivativeErrorField(item)?.artifactId === artifactId);
  const derivativeRecord = readDerivativeErrorField(row);
  if (!derivativeRecord) return { kind: "MISSING" };
  if (derivativeRecord.state === "STALE") return { kind: "STALE" };
  if (derivativeRecord.state !== "CURRENT") return { kind: "UNVERIFIABLE" };
  if (typeof derivativeRecord.signedUrl !== "string" || !derivativeRecord.signedUrl.trim()) {
    return { kind: "UNVERIFIABLE" };
  }
  const derivative = parseDerivativeRecord(derivativeRecord);
  if (!derivative || derivative.artifactId !== artifactId ||
      derivative.sourceArtifactId !== input.sourceArtifactId) {
    return { kind: "UNVERIFIABLE" };
  }
  return { kind: "CURRENT", signedUrl: derivativeRecord.signedUrl, derivative };
}

function useCADGeometryDerivative(props: PreviewRequest & { staleness: string; onRefresh: () => void }) {
  const [state, setState] = useState<State>({
    signedUrl: null, derivative: null, error: null, loading: false, stale: false, freshnessUnverified: false
  });
  useEffect(() => {
    setState({
      signedUrl: null, derivative: null, error: null, loading: false, stale: false, freshnessUnverified: false
    });
  }, [props.completionId, props.modelIdentityId, props.sourceArtifactId]);

  const generate = useCallback(async () => {
    if (state.loading || state.stale || state.freshnessUnverified ||
        props.staleness !== "LATEST_ACCEPTED" || !props.modelIdentityId) return;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const generated = await requestDisplayDerivative(props);
      const current = await readCurrentDerivative(props, generated.derivative.artifactId);
      if (current.kind === "STALE") {
        throw new StaleCADSourceError("The source model revision changed during tessellation. Create a new accepted CAD completion before generating another preview.");
      }
      if (current.kind !== "CURRENT") {
        throw new DerivativeFreshnessError("The generated derivative could not be confirmed as current. The preview remains hidden.");
      }
      setState({
        signedUrl: current.signedUrl, derivative: current.derivative, error: null, loading: false,
        stale: false, freshnessUnverified: false
      });
      props.onRefresh();
    } catch (cause) {
      const stale = cause instanceof StaleCADSourceError;
      const freshnessUnverified = cause instanceof DerivativeFreshnessError;
      setState((current) => ({
        ...current,
        signedUrl: stale || freshnessUnverified ? null : current.signedUrl,
        derivative: stale || freshnessUnverified ? null : current.derivative,
        stale,
        freshnessUnverified,
        error: cause instanceof Error ? cause.message : "CAD display derivative generation failed.",
        loading: false
      }));
    }
  }, [props, state.loading, state.stale, state.freshnessUnverified]);

  const activeDerivativeId = state.derivative?.artifactId ?? null;
  useEffect(() => {
    if (!activeDerivativeId || !props.modelIdentityId) return;
    let active = true;
    const refresh = async () => {
      try {
        const current = await readCurrentDerivative(props, activeDerivativeId);
        if (!active) return;
        if (current.kind === "CURRENT") {
          setState((previous) => previous.derivative?.artifactId === activeDerivativeId ? {
            ...previous, signedUrl: current.signedUrl, derivative: current.derivative,
            stale: false, freshnessUnverified: false, error: null
          } : previous);
        } else if (current.kind === "STALE") {
          setState((previous) => previous.derivative?.artifactId === activeDerivativeId ? {
            ...previous, signedUrl: null, derivative: null, stale: true, freshnessUnverified: false,
            error: "The source model revision changed. This display derivative is stale; create a new accepted CAD completion before generating another preview."
          } : previous);
        } else {
          setState((previous) => previous.derivative?.artifactId === activeDerivativeId ? {
            ...previous, signedUrl: null, derivative: null, stale: false, freshnessUnverified: true,
            error: "The current source revision could not be confirmed. The preview is hidden until verification succeeds."
          } : previous);
        }
      } catch {
        if (!active) return;
        setState((previous) => previous.derivative?.artifactId === activeDerivativeId ? {
          ...previous, signedUrl: null, derivative: null, stale: false, freshnessUnverified: true,
          error: "The current source revision could not be confirmed. The preview is hidden until verification succeeds."
        } : previous);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [activeDerivativeId, props.projectId, props.modelIdentityId, props.sourceArtifactId]);

  const reset = useCallback(() => {
    setState((current) => ({
      ...current, signedUrl: null, derivative: null, error: null, stale: false, freshnessUnverified: false
    }));
  }, []);
  return { state, generate, reset };
}

function DerivativeEmptyState({ state, unavailable, unavailableMessage, sourceKind, generate }: {
  state: State;
  unavailable: boolean;
  unavailableMessage: string;
  sourceKind: "SOLID" | "STEP";
  generate: () => Promise<void>;
}) {
  return <>
    <Box size={28} aria-hidden="true" />
    <strong>{state.loading
      ? "Generating display derivative…"
      : state.stale
        ? "Source revision changed"
        : state.freshnessUnverified
          ? "Preview freshness unavailable"
          : unavailable
            ? "Preview unavailable"
            : "Canonical geometry ready for preview"}</strong>
    <p>
      {unavailable
        ? unavailableMessage
        : "Generate a digest-bound GLB display derivative from the accepted " + sourceKind + " artifact. This operation does not validate or approve geometry."}
    </p>
    {state.error && <p role="alert" className="moduleError"><AlertCircle size={13} />{state.error}</p>}
    <button type="button" className="button workspacePrimaryAction" onClick={() => void generate()} disabled={state.loading || unavailable}>
      {state.loading ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />}
      {state.loading ? "Processing geometry…" : "Generate 3D preview"}
    </button>
  </>;
}

function DerivativeReadyState({ state, sourceName, reset }: {
  state: State;
  sourceName: string;
  reset: () => void;
}) {
  if (!state.signedUrl || !state.derivative) return null;
  return <>
    <CADDisplayViewport
      src={state.signedUrl}
      label={sourceName}
      sourceArtifactId={state.derivative.sourceArtifactId}
      sourceArtifactSha256={state.derivative.sourceArtifactSha256}
      artifactSha256={state.derivative.artifactSha256}
    />
    <p className="moduleSmallNote">
      GLB · R{state.derivative.modelRevision} · {state.derivative.tessellation.linearDeflectionMm} mm linear deflection · {state.derivative.converter.providerId} {state.derivative.converter.version} · display only
    </p>
    <button type="button" className="button secondaryButton" onClick={reset}>Regenerate preview</button>
  </>;
}

export default function CADGeometryDerivativePreview({ projectId, modelIdentityId, completionId, sourceArtifactId, sourceName, sourceKind, staleness, onRefresh }: {
  projectId: string;
  modelIdentityId: string;
  completionId: string;
  sourceArtifactId: string;
  sourceName: string;
  sourceKind: "SOLID" | "STEP";
  staleness: "LATEST_ACCEPTED" | "HISTORICAL" | "UNVERIFIABLE";
  onRefresh: () => void;
}) {
  const { state, generate, reset } = useCADGeometryDerivative({
    projectId, modelIdentityId, completionId, sourceArtifactId, staleness, onRefresh
  });
  const unavailable = staleness !== "LATEST_ACCEPTED" || !modelIdentityId ||
    state.stale || state.freshnessUnverified;
  const unavailableMessage = !modelIdentityId
    ? "This completion has no model identity. Its source revision cannot be checked, so a display derivative cannot be generated."
    : state.stale
      ? "The source model revision changed. This derivative is stale; create a new accepted CAD completion before generating another preview."
      : state.freshnessUnverified
        ? "The current source revision could not be confirmed. The preview is hidden until verification succeeds."
        : "This completion is historical or its model link is unverifiable. Generate a new accepted completion before creating a current display derivative.";
  return <div className="viewportEmptyCopy">
    {!state.signedUrl
      ? <DerivativeEmptyState
          state={state}
          unavailable={unavailable}
          unavailableMessage={unavailableMessage}
          sourceKind={sourceKind}
          generate={generate}
        />
      : <DerivativeReadyState state={state} sourceName={sourceName} reset={reset} />}
  </div>;
}
