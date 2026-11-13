"use client";

import { useEffect, useRef, useState } from "react";
import { parseCADDisplayGLB, type CADDisplayMeshPreview } from "../../../../src/cad/glb-preview";
import { createStlWebGLRenderer, type StlViewportControls } from "../../../../src/cad/stl-webgl-renderer";
import styles from "./StlViewport.module.css";

type MeshLoadState = { key: string; mesh: CADDisplayMeshPreview | null; error: string | null };

async function loadGLB(
  src: string,
  expectedSourceId: string,
  expectedSourceSha256: string,
  expectedArtifactSha256: string,
  signal: AbortSignal
) {
  const response = await fetch(src, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("The signed display derivative could not be downloaded.");
  const buffer = await response.arrayBuffer();
  if (signal.aborted) return null;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const actualArtifactSha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (actualArtifactSha256 !== expectedArtifactSha256) {
    throw new Error("Display derivative bytes do not match the registered artifact SHA-256 digest.");
  }
  const mesh = parseCADDisplayGLB(buffer);
  if (mesh.sourceArtifactId !== expectedSourceId || mesh.sourceArtifactSha256 !== expectedSourceSha256) {
    throw new Error("Display derivative lineage does not match the selected canonical source artifact.");
  }
  return mesh;
}

function useCADDisplayMesh(props: {
  src: string; sourceArtifactId: string; sourceArtifactSha256: string; artifactSha256: string;
}) {
  const key = [props.src, props.sourceArtifactId, props.sourceArtifactSha256, props.artifactSha256].join(":");
  const [state, setState] = useState<MeshLoadState>({ key: "", mesh: null, error: null });
  useEffect(() => {
    if (!props.src) return;
    const controller = new AbortController();
    void loadGLB(props.src, props.sourceArtifactId, props.sourceArtifactSha256, props.artifactSha256, controller.signal)
      .then((mesh) => {
        if (!controller.signal.aborted && mesh) setState({ key, mesh, error: null });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setState({
          key, mesh: null, error: cause instanceof Error ? cause.message : "Display derivative could not be loaded."
        });
      });
    return () => controller.abort();
  }, [key, props.src, props.sourceArtifactId, props.sourceArtifactSha256, props.artifactSha256]);
  const matches = state.key === key;
  return {
    mesh: matches ? state.mesh : null,
    error: matches ? state.error : null,
    loading: !matches
  };
}

function useCADDisplayRenderer(mesh: CADDisplayMeshPreview | null, identity: string) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controlsRef = useRef<StlViewportControls | null>(null);
  const renderErrorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const status = renderErrorRef.current;
    const root = rootRef.current;
    if (status) {
      status.hidden = true;
      status.textContent = "";
    }
    if (root) root.dataset.renderError = "false";
    const canvas = canvasRef.current;
    if (!mesh || !canvas) return;
    let renderer: ReturnType<typeof createStlWebGLRenderer> | null = null;
    try {
      renderer = createStlWebGLRenderer(canvas, mesh);
      controlsRef.current = renderer.controls;
    } catch (cause) {
      if (status) {
        status.hidden = false;
        status.textContent = cause instanceof Error ? cause.message : "The display derivative could not be rendered.";
      }
      if (root) root.dataset.renderError = "true";
    }
    return () => {
      renderer?.destroy();
      controlsRef.current = null;
    };
  }, [mesh, identity]);
  return { rootRef, canvasRef, controlsRef, renderErrorRef };
}

export default function CADDisplayViewport({ src, label, sourceArtifactId, sourceArtifactSha256, artifactSha256 }: {
  src: string;
  label: string;
  sourceArtifactId: string;
  sourceArtifactSha256: string;
  artifactSha256: string;
}) {
  const { mesh, error, loading } = useCADDisplayMesh({ src, sourceArtifactId, sourceArtifactSha256, artifactSha256 });
  const identity = [src, sourceArtifactId, sourceArtifactSha256, artifactSha256].join(":");
  const { rootRef, canvasRef, controlsRef, renderErrorRef } = useCADDisplayRenderer(mesh, identity);
  return <div ref={rootRef} className={styles.viewportRoot}>
    <canvas ref={canvasRef} className={styles.viewportCanvas} role="img" aria-label={"3D CAD display derivative preview of " + label} tabIndex={0} />
    {!mesh && !error && loading && <div className={styles.viewportStatus} role="status">Loading verified display derivative…</div>}
    {error && <div className={styles.viewportStatus} role="alert">{error}</div>}
    <div ref={renderErrorRef} className={styles.viewportStatus} role="alert" hidden />
    {mesh && !error && <div className={styles.viewportMeta}>
      <span className={styles.viewportMetaBadge}>{mesh.triangleCount.toLocaleString()} triangles · display derivative · preview only</span>
      <div className={styles.viewportControls}>
        <button type="button" className="button secondaryButton" onClick={() => controlsRef.current?.rotateLeft()} aria-label="Rotate model left">Rotate left</button>
        <button type="button" className="button secondaryButton" onClick={() => controlsRef.current?.rotateRight()} aria-label="Rotate model right">Rotate right</button>
        <button type="button" className="button secondaryButton" onClick={() => controlsRef.current?.reset()}>Reset view</button>
      </div>
    </div>}
    {mesh && !error && <span className={styles.viewportHint}>Drag to orbit · scroll to zoom · arrow keys to rotate</span>}
  </div>;
}
