"use client";

import { useEffect, useRef, useState } from "react";
import { parseCADDisplayGLB, type CADDisplayMeshPreview } from "../../../../src/cad/glb-preview";
import { createStlWebGLRenderer, type StlViewportControls } from "../../../../src/cad/stl-webgl-renderer";
import styles from "./StlViewport.module.css";

type State = { src: string; mesh: CADDisplayMeshPreview | null; error: string | null };

async function loadGLB(src: string, expectedSourceId: string, expectedSha256: string, signal: AbortSignal) {
  const response = await fetch(src, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("The signed display derivative could not be downloaded.");
  const buffer = await response.arrayBuffer();
  if (signal.aborted) return null;
  const mesh = parseCADDisplayGLB(buffer);
  if (mesh.sourceArtifactId !== expectedSourceId || mesh.sourceArtifactSha256 !== expectedSha256) {
    throw new Error("Display derivative lineage does not match the selected canonical source artifact.");
  }
  return mesh;
}

export default function CADDisplayViewport({ src, label, sourceArtifactId, sourceArtifactSha256 }: {
  src: string;
  label: string;
  sourceArtifactId: string;
  sourceArtifactSha256: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controlsRef = useRef<StlViewportControls | null>(null);
  const renderErrorRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<State>({ src: "", mesh: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    void loadGLB(src, sourceArtifactId, sourceArtifactSha256, controller.signal)
      .then((mesh) => {
        if (!controller.signal.aborted && mesh) setState({ src, mesh, error: null });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setState({
          src, mesh: null, error: cause instanceof Error ? cause.message : "Display derivative could not be loaded."
        });
      });
    return () => controller.abort();
  }, [src, sourceArtifactId, sourceArtifactSha256]);

  useEffect(() => {
    const mesh = state.src === src ? state.mesh : null;
    const canvas = canvasRef.current;
    const renderError = renderErrorRef.current;
    const root = rootRef.current;
    if (renderError) {
      renderError.hidden = true;
      renderError.textContent = "";
    }
    if (root) root.dataset.renderError = "false";
    if (!mesh || !canvas) return;
    let renderer: ReturnType<typeof createStlWebGLRenderer> | null = null;
    try {
      renderer = createStlWebGLRenderer(canvas, mesh);
      controlsRef.current = renderer.controls;
    } catch (cause) {
      if (renderError) {
        renderError.hidden = false;
        renderError.textContent = cause instanceof Error ? cause.message : "The display derivative could not be rendered.";
      }
      if (root) root.dataset.renderError = "true";
    }
    return () => {
      renderer?.destroy();
      controlsRef.current = null;
    };
  }, [src, state.mesh, state.src]);

  const mesh = state.src === src ? state.mesh : null;
  const error = state.src === src ? state.error : null;
  return <div ref={rootRef} className={styles.viewportRoot}>
    <canvas ref={canvasRef} className={styles.viewportCanvas} role="img" aria-label={"3D CAD display derivative preview of " + label} tabIndex={0} />
    {!mesh && !error && <div className={styles.viewportStatus} role="status">Loading verified display derivative…</div>}
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
