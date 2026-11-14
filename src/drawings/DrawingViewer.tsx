"use client";

import { useEffect, useRef, useState } from "react";
import { measureDXFDistance, parseDXF, type DXFDocument, type DXFEntity } from "./dxf";
import { sanitizeSVG } from "./svg-sanitizer";
import styles from "./DrawingViewer.module.css";

type DrawingState = {
  src: string;
  svgUrl: string | null;
  dxf: DXFDocument | null;
  error: string | null;
};

function arcPath(entity: Extract<DXFEntity, { type: "ARC" }>): string {
  const start = entity.startDegrees * Math.PI / 180;
  let end = entity.endDegrees * Math.PI / 180;
  while (end <= start) end += Math.PI * 2;
  const sx = entity.x + entity.radius * Math.cos(start);
  const sy = entity.y + entity.radius * Math.sin(start);
  const ex = entity.x + entity.radius * Math.cos(end);
  const ey = entity.y + entity.radius * Math.sin(end);
  const large = end - start > Math.PI ? 1 : 0;
  return "M " + sx + " " + sy + " A " + entity.radius + " " + entity.radius + " 0 " + large + " 1 " + ex + " " + ey;
}

function screenToDxfPoint(
  event: React.MouseEvent<SVGSVGElement>,
  svg: SVGSVGElement | null,
  group: SVGGElement | null
): [number, number] | null {
  if (!svg || !group) return null;
  const matrix = group.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const local = point.matrixTransform(matrix.inverse());
  return [local.x, local.y];
}

function DxfPreview({ document }: { document: DXFDocument }) {
  const bounds = document.bounds;
  const width = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const height = Math.max(bounds.maxY - bounds.minY, 1e-6);
  const padding = Math.max(width, height) * 0.04;
  const baseView = { x: bounds.minX - padding, y: -(bounds.maxY + padding), width: width + 2 * padding, height: height + 2 * padding };
  const [zoom, setZoom] = useState(1);
  const [hiddenLayers, setHiddenLayers] = useState<string[]>([]);
  const [measureMode, setMeasureMode] = useState(false);
  const [measureStart, setMeasureStart] = useState<[number, number] | null>(null);
  const [measureEnd, setMeasureEnd] = useState<[number, number] | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const groupRef = useRef<SVGGElement | null>(null);
  const layers = Array.from(new Set(document.entities.map((entity) => entity.layer))).sort();
  const viewBox = [
    baseView.x + baseView.width * (1 - 1 / zoom) / 2,
    baseView.y + baseView.height * (1 - 1 / zoom) / 2,
    baseView.width / zoom,
    baseView.height / zoom
  ].join(" ");
  const visibleEntities = document.entities.filter((entity) => !hiddenLayers.includes(entity.layer));
  const measured = measureStart && measureEnd ? measureDXFDistance(measureStart, measureEnd) : null;
  const unitLabel = document.units === "unitless" ? "drawing units" : document.units;

  const handleMeasureClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!measureMode) return;
    const next = screenToDxfPoint(event, svgRef.current, groupRef.current);
    if (!next) return;
    if (!measureStart || measureEnd) {
      setMeasureStart(next);
      setMeasureEnd(null);
      return;
    }
    setMeasureEnd(next);
  };

  return <div className={styles.drawingCanvas}>
    <div className={styles.drawingToolbar}>
      <button type="button" onClick={() => setZoom((value) => Math.min(8, value * 1.25))} aria-label="Zoom in drawing">Zoom in</button>
      <button type="button" onClick={() => setZoom((value) => Math.max(0.25, value / 1.25))} aria-label="Zoom out drawing">Zoom out</button>
      <button type="button" onClick={() => setZoom(1)}>Fit drawing</button>
      <button type="button" aria-pressed={measureMode} onClick={() => {
        setMeasureMode((value) => !value);
        setMeasureStart(null);
        setMeasureEnd(null);
      }}>{measureMode ? "Cancel measure" : "Measure distance"}</button>
    </div>
    {layers.length > 1 && <div className={styles.drawingLayers} role="group" aria-label="DXF layer visibility">
      <strong>Layers</strong>
      {layers.map((layer) => <label key={layer}>
        <input type="checkbox" checked={!hiddenLayers.includes(layer)} onChange={(event) => setHiddenLayers((current) =>
          event.target.checked ? current.filter((item) => item !== layer) : [...current, layer]
        )} />
        <span>{layer}</span>
      </label>)}
    </div>}
    {measureMode && <p className={styles.drawingMeasureHint} role="status">
      {measured
        ? "Distance: " + measured.distance.toFixed(3) + " " + unitLabel +
          " (ΔX " + measured.deltaX.toFixed(3) + ", ΔY " + measured.deltaY.toFixed(3) + ")"
        : measureStart ? "Select the second point." : "Select the first point, then the second point."}
    </p>}
    <svg ref={svgRef} viewBox={viewBox} role="img" aria-label="DXF drawing preview" onClick={handleMeasureClick}
      className={measureMode ? styles.measuringCanvas : undefined}>
      <g ref={groupRef} transform="scale(1 -1)" fill="none" stroke="currentColor" strokeWidth={Math.max(width, height) / 900} vectorEffect="non-scaling-stroke">
        {visibleEntities.map((entity, index) => {
          if (entity.type === "LINE") return <line key={index} x1={entity.x1} y1={entity.y1} x2={entity.x2} y2={entity.y2} />;
          if (entity.type === "CIRCLE") return <circle key={index} cx={entity.x} cy={entity.y} r={entity.radius} />;
          if (entity.type === "ARC") return <path key={index} d={arcPath(entity)} />;
          if (entity.type === "LWPOLYLINE") {
            const points = entity.points.map(([x, y]) => x + "," + y).join(" ");
            return <polyline key={index} points={points + (entity.closed && entity.points.length ? " " + entity.points[0][0] + "," + entity.points[0][1] : "")} />;
          }
          return <g key={index} transform={"translate(" + entity.x + " " + entity.y + ") scale(1 -1)"} stroke="none" fill="currentColor">
            <text fontSize={entity.height}>{entity.value}</text>
          </g>;
        })}
        {measureStart && <circle cx={measureStart[0]} cy={measureStart[1]} r={Math.max(width, height) / 160} fill="#42c8b4" stroke="none" />}
        {measureEnd && measureStart && <>
          <line x1={measureStart[0]} y1={measureStart[1]} x2={measureEnd[0]} y2={measureEnd[1]} stroke="#edc27a" strokeWidth={Math.max(width, height) / 300} />
          <circle cx={measureEnd[0]} cy={measureEnd[1]} r={Math.max(width, height) / 160} fill="#edc27a" stroke="none" />
        </>}
      </g>
    </svg>
    <footer>{visibleEntities.length.toLocaleString()} / {document.entities.length.toLocaleString()} visible entities · {document.units} · view-only; unsnapped pointer distance is not a dimension check</footer>
  </div>;
}

type LoadedDrawingPreview = {
  state: DrawingState;
  objectUrl: string | null;
};

async function fetchDrawingSource({ src, signal }: { src: string; signal: AbortSignal }): Promise<string | null> {
  const response = await fetch(src, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("The authorized drawing artifact could not be loaded.");
  const buffer = await response.arrayBuffer();
  if (signal.aborted) return null;
  if (buffer.byteLength < 1 || buffer.byteLength > 10 * 1024 * 1024) {
    throw new Error("Drawing artifact is empty or exceeds the 10 MiB preview limit.");
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
}

function isDxfFormat({ format }: { format: string }): boolean {
  return format === "application/dxf" || format === "image/vnd.dxf";
}

function createDrawingPreview({ src, format, source }: { src: string; format: string; source: string }): LoadedDrawingPreview {
  if (format === "image/svg+xml") {
    const safeSvg = sanitizeSVG(source);
    const objectUrl = URL.createObjectURL(new Blob([safeSvg], { type: "image/svg+xml" }));
    return { state: { src, svgUrl: objectUrl, dxf: null, error: null }, objectUrl };
  }
  if (isDxfFormat({ format })) {
    return { state: { src, svgUrl: null, dxf: parseDXF(source), error: null }, objectUrl: null };
  }
  throw new Error("This drawing format has no registered browser preview.");
}

async function loadDrawingPreview({ src, format, signal }: { src: string; format: string; signal: AbortSignal }): Promise<LoadedDrawingPreview | null> {
  const source = await fetchDrawingSource({ src, signal });
  if (source === null || signal.aborted) return null;
  return createDrawingPreview({ src, format, source });
}

function drawingErrorState({ src, cause }: { src: string; cause: unknown }): DrawingState {
  return {
    src, svgUrl: null, dxf: null,
    error: cause instanceof Error ? cause.message : "Drawing preview failed."
  };
}

function useDrawingState({ src, format }: { src: string; format: string }): DrawingState {
  const [state, setState] = useState<DrawingState>({ src: "", svgUrl: null, dxf: null, error: null });
  useEffect(() => {
    if (format === "application/pdf") return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void loadDrawingPreview({ src, format, signal: controller.signal })
      .then((loaded) => {
        if (!loaded || controller.signal.aborted) return;
        objectUrl = loaded.objectUrl;
        setState(loaded.state);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setState(drawingErrorState({ src, cause }));
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, format]);
  return state;
}

function PdfDrawingPreview({ src, label }: { src: string; label: string }) {
  return <div className={styles.drawingFrame}>
    <iframe title={"PDF drawing preview of " + label} src={src} loading="lazy" referrerPolicy="no-referrer" />
    <span>PDF preview · supplied by the browser&apos;s native PDF viewer · not a drafting validation</span>
  </div>;
}

function SvgDrawingPreview({ src, label }: { src: string; label: string }) {
  return <div className={styles.drawingCanvas}>
    <div
      className={styles.sanitizedSvgImage}
      role="img"
      aria-label={"Sanitized SVG drawing preview of " + label}
      style={{ backgroundImage: "url(" + JSON.stringify(src) + ")" }}
    />
    <footer>Sanitized SVG · preview only</footer>
  </div>;
}

export default function DrawingViewer({ src, mediaType, label }: {
  src: string;
  mediaType: string;
  label: string;
}) {
  const format = mediaType.toLowerCase();
  const state = useDrawingState({ src, format });
  if (format === "application/pdf") return <PdfDrawingPreview src={src} label={label} />;
  if (state.src !== src) return <div className={styles.drawingStatus} role="status">Loading drawing preview…</div>;
  if (state.error) return <div className={styles.drawingStatus} role="alert">{state.error}</div>;
  if (state.svgUrl) return <SvgDrawingPreview src={state.svgUrl} label={label} />;
  if (state.dxf) return <DxfPreview key={src} document={state.dxf} />;
  return <div className={styles.drawingStatus} role="status">No drawing preview is available.</div>;
}
