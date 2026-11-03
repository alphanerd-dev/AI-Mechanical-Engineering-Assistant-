"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { parseSTLPreview, type STLMeshPreview } from "../../../../src/cad/stl-preview";
import { createStlWebGLRenderer, type StlViewportControls } from "../../../../src/cad/stl-webgl-renderer";
import styles from "./StlViewport.module.css";

type MeshLoadState = { src: string; mesh: STLMeshPreview | null; error: string | null };

function useStlMesh(src: string) {
  const [state, setState] = useState<MeshLoadState>({ src: "", mesh: null, error: null });
  useEffect(() => {
    const controller = new AbortController();
    void fetch(src, { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("The signed STL preview could not be downloaded.");
        return response.arrayBuffer();
      })
      .then((buffer) => {
        if (buffer.byteLength < 84 || buffer.byteLength > 100 * 1024 * 1024) {
          throw new Error("The STL file is empty or exceeds the 100 MiB preview limit.");
        }
        setState({ src, mesh: parseSTLPreview(buffer), error: null });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setState({ src, mesh: null, error: cause instanceof Error ? cause.message : "The STL preview could not be loaded." });
      });
    return () => controller.abort();
  }, [src]);
  const current = state.src === src;
  return { mesh: current ? state.mesh : null, error: current ? state.error : null, loading: !current };
}

function useStlRenderer(src: string, mesh: STLMeshPreview | null, canvasRef: RefObject<HTMLCanvasElement | null>) {
  const controlsRef = useRef<StlViewportControls | null>(null);
  const [failure, setFailure] = useState<{ src: string; message: string } | null>(null);
  useEffect(() => {
    if (!mesh || !canvasRef.current) return;
    const canvas = canvasRef.current;
    let renderer: ReturnType<typeof createStlWebGLRenderer> | null = null;
    let active = true;
    try {
      renderer = createStlWebGLRenderer(canvas, mesh);
      controlsRef.current = renderer.controls;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The 3D preview could not be rendered.";
      void Promise.resolve().then(() => {
        if (active) setFailure({ src, message });
      });
    }
    return () => {
      active = false;
      renderer?.destroy();
      controlsRef.current = null;
    };
  }, [canvasRef, mesh, src]);
  return { controlsRef, renderError: failure?.src === src ? failure.message : null };
}

function StlViewportFrame({ label, mesh, loading, loadError, renderError, controlsRef }: {
  label: string; mesh: STLMeshPreview | null; loading: boolean; loadError: string | null; renderError: string | null;
  controlsRef: { current: StlViewportControls | null };
}) {
  const canRender = Boolean(mesh && !loadError && !renderError);
  return <div className={styles.viewportRoot}>
    <canvas ref={canvasRef} className={styles.viewportCanvas} role="img" aria-label={"3D STL preview of " + label} tabIndex={0} />
    {loading && <div className={styles.viewportStatus} role="status">Loading STL geometry…</div>}
    {loadError && <div className={styles.viewportStatus} role="alert">{loadError}</div>}
    {renderError && <div className={styles.viewportStatus} role="alert">{renderError}</div>}
    {canRender && mesh && <div className={styles.viewportMeta}>
      <span className={styles.viewportMetaBadge}>{mesh.triangleCount.toLocaleString()} triangles · preview only</span>
      <div className={styles.viewportControls}>
        <button type="button" className="button secondaryButton" onClick={() => controlsRef.current?.rotateLeft()} aria-label="Rotate model left">Rotate left</button>
        <button type="button" className="button secondaryButton" onClick={() => controlsRef.current?.rotateRight()} aria-label="Rotate model right">Rotate right</button>
        <button type="button" className="button secondaryButton" onClick={() => controlsRef.current?.reset()}>Reset view</button>
      </div>
    </div>}
    {canRender && <span className={styles.viewportHint}>Drag to orbit · scroll to zoom · arrow keys to rotate</span>}
  </div>;
}

export default function StlViewport({ src, label }: { src: string; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const meshState = useStlMesh(src);
  const rendererState = useStlRenderer(src, meshState.mesh, canvasRef);
  return <StlViewportFrame label={label} canvasRef={canvasRef} mesh={meshState.mesh} loading={meshState.loading} loadError={meshState.error} renderError={rendererState.renderError} controlsRef={rendererState.controlsRef} />;
}
