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

async function requestDisplayDerivative(input: PreviewRequest): Promise<{ signedUrl: string; derivative: Derivative }> {
  const response = await fetch("/api/cad/geometry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...input, operation: "TESSELLATE",
      linearDeflectionMm: 0.1, angularDeflectionRad: 0.35
    }),
    cache: "no-store"
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.derivative || typeof body.signedUrl !== "string") {
    const message = typeof body.error === "string" ? body.error :
      Array.isArray(body.errors) ? body.errors.join("; ") : "CAD display derivative generation failed.";
    throw new Error(message);
  }
  return { signedUrl: body.signedUrl, derivative: body.derivative as Derivative };
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
    {!state.signedUrl && <Box size={28} aria-hidden="true" />}
    {!state.signedUrl && <strong>{state.loading ? "Generating display derivative…" : "Canonical geometry ready for preview"}</strong>}
    {!state.signedUrl && <p>
      {unavailable
        ? "This completion is historical or its model link is unverifiable. Generate a new accepted completion before creating a current display derivative."
        : "Generate a digest-bound GLB display derivative from the accepted " + sourceKind + " artifact. This operation does not validate or approve geometry."}
    </p>}
    {state.error && <p role="alert" className="moduleError"><AlertCircle size={13} />{state.error}</p>}
    {!state.signedUrl && <button type="button" className="button workspacePrimaryAction" onClick={() => void generate()} disabled={state.loading || unavailable}>
      {state.loading ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />}
      {state.loading ? "Processing geometry…" : "Generate 3D preview"}
    </button>}
    {state.signedUrl && state.derivative && <>
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
    </>}
  </div>;
}
