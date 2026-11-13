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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controlsRef = useRef<StlViewportControls | null>(null);
  const [state, setState] = useState<State>({ src: "", mesh: null, error: null });
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setState({ src: "", mesh: null, error: null });
    setRenderError(null);
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
    if (!mesh || !canvas) return;
    let renderer: ReturnType<typeof createStlWebGLRenderer>["renderer"] | null = null;
    try {
      renderer = createStlWebGLRenderer(canvas, mesh);
      controlsRef.current = renderer.controls;
    } catch (cause) {
      setRenderError(cause instanceof Error ? cause.message : "The display derivative could not be rendered.");
    }
    return () => {
      renderer?.destroy();
      controlsRef.current = null;
    };
  }, [src, state.mesh, state.src]);

  const mesh = state.src === src ? state.mesh : null;
  const error = state.src === src ? state.error : null;
  return <div className={styles.viewportRoot}>
    <canvas ref={canvasRef} className={styles.viewportCanvas} role="img" aria-label={"3D CAD display derivative preview of " + label} tabIndex={0} />
    {!mesh && !error && <div className={styles.viewportStatus} role="status">Loading verified display derivative…</div>}
    {error && <div className={styles.viewportStatus} role="alert">{error}</div>}
    {renderError && <div className={styles.viewportStatus} role="alert">{renderError}</div>}
    {mesh && !error && !renderError && <div className={styles.viewportMeta}>
      <span className={styles.viewportMetaBadge}>{mesh.triangleCount.toLocaleString()} triangles · display derivative · preview only</span>
      <div className={styles.viewportControls}>
        <button type="button" className="button secondaryButton" onClick={() => controlsRef.current?.rotateLeft()} aria-label="Rotate model left">Rotate left</button>
        <button type="button" className="button secondaryButton" onClick={() => controlsRef.current?.rotateRight()} aria-label="Rotate model right">Rotate right</button>
        <button type="button" className="button secondaryButton" onClick={() => controlsRef.current?.reset()}>Reset view</button>
      </div>
    </div>}
    {mesh && !error && !renderError && <span className={styles.viewportHint}>Drag to orbit · scroll to zoom · arrow keys to rotate</span>}
  </div>;
}
