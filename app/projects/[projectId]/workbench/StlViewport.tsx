"use client";

import { useEffect, useRef, useState } from "react";
import { parseSTLPreview, type STLMeshPreview } from "../../../../src/cad/stl-preview";
import { createStlWebGLRenderer, type StlViewportControls } from "../../../../src/cad/stl-webgl-renderer";
import styles from "./StlViewport.module.css";

export default function StlViewport({ src, label }: { src: string; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controlsRef = useRef<StlViewportControls | null>(null);
  const [loadState, setLoadState] = useState<{ src: string; mesh: STLMeshPreview | null; error: string | null }>({ src: "", mesh: null, error: null });
  const [renderFailure, setRenderFailure] = useState<{ src: string; message: string } | null>(null);
  const currentLoad = loadState.src === src;
  const mesh = currentLoad ? loadState.mesh : null;
  const loading = !currentLoad;
  const loadError = currentLoad ? loadState.error : null;
  const renderError = renderFailure?.src === src ? renderFailure.message : null;

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
        setLoadState({ src, mesh: parseSTLPreview(buffer), error: null });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setLoadState({ src, mesh: null, error: cause instanceof Error ? cause.message : "The STL preview could not be loaded." });
      });
    return () => controller.abort();
  }, [src]);

  useEffect(() => {
    if (!mesh) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: ReturnType<typeof createStlWebGLRenderer> | null = null;
    let active = true;
    try {
      renderer = createStlWebGLRenderer(canvas, mesh);
      controlsRef.current = renderer.controls;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The 3D preview could not be rendered.";
      void Promise.resolve().then(() => {
        if (active) setRenderFailure({ src, message });
      });
    }
    return () => {
      active = false;
      renderer?.destroy();
      controlsRef.current = null;
    };
  }, [mesh, src]);

  return (
    <div className={styles.viewportRoot}>
      <canvas ref={canvasRef} className={styles.viewportCanvas} role="img" aria-label={"3D STL preview of " + label} tabIndex={0} />
      {loading && <div className={styles.viewportStatus} role="status">Loading STL geometry…</div>}
      {loadError && <div className={styles.viewportStatus} role="alert">{loadError}</div>}
      {renderError && <div className={styles.viewportStatus} role="alert">{renderError}</div>}
      {mesh && !loadError && !renderError && (
        <div className={styles.viewportMeta}>
          <span className={styles.viewportMetaBadge}>{mesh.triangleCount.toLocaleString()} triangles · preview only</span>
          <div className={styles.viewportControls}>
            <button type="button" className="button secondaryButton" onClick={() => controlsRef.current?.rotateLeft()} aria-label="Rotate model left">Rotate left</button>
            <button type="button" className="button secondaryButton" onClick={() => controlsRef.current?.rotateRight()} aria-label="Rotate model right">Rotate right</button>
            <button type="button" className="button secondaryButton" onClick={() => controlsRef.current?.reset()}>Reset view</button>
          </div>
        </div>
      )}
      {mesh && <span className={styles.viewportHint}>Drag to orbit · scroll to zoom · arrow keys to rotate</span>}
    </div>
  );
}
