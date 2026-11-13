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

type State = { signedUrl: string | null; derivative: Derivative | null; error: string | null; loading: boolean };
type PreviewRequest = {
  projectId: string; completionId: string; sourceArtifactId: string;
};

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

function parseDerivativeRecord(value: unknown): Derivative | null {
  const record = readDerivativeErrorField(value);
  if (!record) return null;
  const converter = readDerivativeErrorField(record.converter);
  const tessellation = readDerivativeErrorField(record.tessellation);
  if (!converter || !tessellation) return null;
  if (typeof record.artifactId !== "string" || !record.artifactId.trim()) return null;
  if (typeof record.sourceArtifactId !== "string" || !record.sourceArtifactId.trim()) return null;
  if (typeof record.sourceArtifactSha256 !== "string" || !/^[a-f0-9]{64}$/.test(record.sourceArtifactSha256)) return null;
  if (typeof record.artifactSha256 !== "string" || !/^[a-f0-9]{64}$/.test(record.artifactSha256)) return null;
  if (typeof converter.providerId !== "string" || !converter.providerId.trim()) return null;
  if (typeof converter.version !== "string" || !converter.version.trim()) return null;
  if (!Number.isSafeInteger(record.modelRevision) || Number(record.modelRevision) < 1) return null;
  if (typeof tessellation.linearDeflectionMm !== "number" || !Number.isFinite(tessellation.linearDeflectionMm)) return null;
  if (typeof tessellation.angularDeflectionRad !== "number" || !Number.isFinite(tessellation.angularDeflectionRad)) return null;
  return {
    artifactId: record.artifactId,
    sourceArtifactId: record.sourceArtifactId,
    sourceArtifactSha256: record.sourceArtifactSha256,
    artifactSha256: record.artifactSha256,
    converter: { providerId: converter.providerId, version: converter.version },
    modelRevision: Number(record.modelRevision),
    tessellation: {
      linearDeflectionMm: tessellation.linearDeflectionMm,
      angularDeflectionRad: tessellation.angularDeflectionRad
    }
  };
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
  if (!response.ok || !result) throw new Error(displayDerivativeError(body));
  return result;
}

function useCADGeometryDerivative(props: PreviewRequest & { staleness: string; onRefresh: () => void }) {
  const [state, setState] = useState<State>({ signedUrl: null, derivative: null, error: null, loading: false });
  useEffect(() => {
    setState({ signedUrl: null, derivative: null, error: null, loading: false });
  }, [props.completionId, props.sourceArtifactId]);

  const generate = useCallback(async () => {
    if (state.loading || props.staleness !== "LATEST_ACCEPTED") return;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const result = await requestDisplayDerivative(props);
      setState({ ...result, error: null, loading: false });
      props.onRefresh();
    } catch (cause) {
      setState((current) => ({
        ...current, error: cause instanceof Error ? cause.message : "CAD display derivative generation failed.", loading: false
      }));
    }
  }, [props, state.loading]);

  const reset = useCallback(() => {
    setState((current) => ({ ...current, signedUrl: null, derivative: null, error: null }));
  }, []);
  return { state, generate, reset };
}

function DerivativeEmptyState({ state, unavailable, sourceKind, generate }: {
  state: State;
  unavailable: boolean;
  sourceKind: "SOLID" | "STEP";
  generate: () => Promise<void>;
}) {
  return <>
    <Box size={28} aria-hidden="true" />
    <strong>{state.loading ? "Generating display derivative…" : "Canonical geometry ready for preview"}</strong>
    <p>
      {unavailable
        ? "This completion is historical or its model link is unverifiable. Generate a new accepted completion before creating a current display derivative."
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

export default function CADGeometryDerivativePreview({ projectId, completionId, sourceArtifactId, sourceName, sourceKind, staleness, onRefresh }: {
  projectId: string;
  completionId: string;
  sourceArtifactId: string;
  sourceName: string;
  sourceKind: "SOLID" | "STEP";
  staleness: "LATEST_ACCEPTED" | "HISTORICAL" | "UNVERIFIABLE";
  onRefresh: () => void;
}) {
  const { state, generate, reset } = useCADGeometryDerivative({
    projectId, completionId, sourceArtifactId, staleness, onRefresh
  });
  const unavailable = staleness !== "LATEST_ACCEPTED";
  return <div className="viewportEmptyCopy">
    {!state.signedUrl
      ? <DerivativeEmptyState state={state} unavailable={unavailable} sourceKind={sourceKind} generate={generate} />
      : <DerivativeReadyState state={state} sourceName={sourceName} reset={reset} />}
  </div>;
}
