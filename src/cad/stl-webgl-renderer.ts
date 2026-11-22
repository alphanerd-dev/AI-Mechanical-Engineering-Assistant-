import type { STLMeshPreview } from "./stl-preview";
import {
  createDefaultCADViewportTransform,
  fitCADViewport,
  panCADViewport,
  resetCADViewport,
  rotateCADViewport,
  zoomCADViewport,
  type CADViewportTransform
} from "./viewport-transform";

/**
 * Bounded WebGL renderer for immutable, digest-verified display meshes.
 * Rendering remains display-only: this module never measures or validates geometry.
 */

export type StlViewportControls = {
  reset: () => void;
  fitToView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  rotateLeft: () => void;
  rotateRight: () => void;
  setVisible: (visible: boolean) => void;
  setSelected: (selected: boolean) => void;
};
type PreviewProgram = { program: WebGLProgram; vertex: WebGLShader; fragment: WebGLShader };

function readThemeRgb(variable: string): [number, number, number] {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  const match = value.match(/^#([0-9a-f]{6})$/i);
  if (!match) throw new Error(`The required design token ${variable} is unavailable.`);
  const hex = match[1];
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255) as [number, number, number];
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("WebGL could not create a shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  const message = gl.getShaderInfoLog(shader) || "A preview shader could not be compiled.";
  gl.deleteShader(shader);
  throw new Error(message);
}

function linkPreviewProgram(gl: WebGL2RenderingContext, vertex: WebGLShader, fragment: WebGLShader) {
  const program = gl.createProgram();
  if (!program) throw new Error("WebGL could not create a render program.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "The 3D preview program could not be linked.";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function createPreviewProgram(gl: WebGL2RenderingContext, accent: [number, number, number]): PreviewProgram {
  const vertexSource = [
    "#version 300 es\nin vec3 a_position;",
    "in vec3 a_normal;",
    "uniform vec2 u_rotation;",
    "uniform float u_zoom;",
    "uniform vec2 u_pan;",
    "uniform float u_aspect;",
    "out vec3 v_normal;",
    "vec3 rotateX(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }",
    "vec3 rotateY(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }",
    "void main() {",
    "  vec3 p = rotateX(rotateY(a_position, u_rotation.y), u_rotation.x);",
    "  v_normal = normalize(rotateX(rotateY(a_normal, u_rotation.y), u_rotation.x));",
    "  vec2 projected = p.xy;",
    "  if (u_aspect > 1.0) projected.x /= u_aspect; else projected.y *= u_aspect;",
    "  gl_Position = vec4(projected * u_zoom + u_pan, p.z * 0.48, 1.0);",
    "}",
  ].join("\n");
  const accentSource = accent.map((channel) => channel.toFixed(4)).join(", ");
  const fragmentSource = [
    "#version 300 es",
    "precision mediump float;",
    "in vec3 v_normal;",
    "uniform float u_selected;",
    "out vec4 outColor;",
    "void main() {",
    "  vec3 light = normalize(vec3(-0.45, 0.75, 1.0));",
    "  float diffuse = max(dot(normalize(v_normal), light), 0.0);",
    "  float shade = 0.32 + 0.68 * diffuse;",
    `  vec3 base = mix(vec3(${accentSource}), vec3(0.96, 0.72, 0.28), u_selected * 0.55);`,
    "  outColor = vec4(base * shade, 1.0);",
    "}",
  ].join("\n");
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  let fragment: WebGLShader | null = null;
  try {
    fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = linkPreviewProgram(gl, vertex, fragment);
    return { program, vertex, fragment };
  } catch (error) {
    if (fragment) gl.deleteShader(fragment);
    gl.deleteShader(vertex);
    throw error;
  }
}

export function createStlWebGLRenderer(
  canvas: HTMLCanvasElement,
  mesh: STLMeshPreview,
  onContextStatus?: (error: Error | null) => void,
): {
  controls: StlViewportControls;
  destroy: () => void;
} {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: true });
  if (!gl) throw new Error("WebGL 2 is unavailable in this browser. The CAD source record is still preserved.");

  let resources: PreviewProgram | null = null;
  let positionBuffer: WebGLBuffer | null = null;
  let normalBuffer: WebGLBuffer | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let rotationLocation: WebGLUniformLocation | null = null;
  let zoomLocation: WebGLUniformLocation | null = null;
  let panLocation: WebGLUniformLocation | null = null;
  let aspectLocation: WebGLUniformLocation | null = null;
  let selectedLocation: WebGLUniformLocation | null = null;
  let transform: CADViewportTransform = createDefaultCADViewportTransform();
  const pointers = new Map<number, { x: number; y: number }>();
  let gestureMode: "orbit" | "pan" | "pinch" = "orbit";
  let lastPinchDistance = 0;
  let lastPinchMidpoint = { x: 0, y: 0 };
  let visible = true;
  let selected = false;
  let contextLost = false;
  let contextRestoreTimer: number | null = null;

  const draw = () => {
    if (contextLost || gl.isContextLost()) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!resources || !visible) return;
    gl.useProgram(resources.program);
    if (rotationLocation) gl.uniform2f(rotationLocation, transform.rotationX, transform.rotationY);
    if (zoomLocation) gl.uniform1f(zoomLocation, transform.zoom);
    if (panLocation) gl.uniform2f(panLocation, transform.panX, transform.panY);
    if (aspectLocation) gl.uniform1f(aspectLocation, width / height);
    if (selectedLocation) gl.uniform1f(selectedLocation, selected ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.positions.length / 3);
  };

  const disposeResources = () => {
    if (positionBuffer) gl.deleteBuffer(positionBuffer);
    if (normalBuffer) gl.deleteBuffer(normalBuffer);
    if (resources) {
      gl.deleteProgram(resources.program);
      gl.deleteShader(resources.vertex);
      gl.deleteShader(resources.fragment);
    }
    positionBuffer = null;
    normalBuffer = null;
    resources = null;
    rotationLocation = null;
    zoomLocation = null;
    selectedLocation = null;
    panLocation = null;
    aspectLocation = null;
  };

  const initializeResources = () => {
    resources = createPreviewProgram(gl, readThemeRgb("--color-accent"));
    const positionLocation = gl.getAttribLocation(resources.program, "a_position");
    const normalLocation = gl.getAttribLocation(resources.program, "a_normal");
    rotationLocation = gl.getUniformLocation(resources.program, "u_rotation");
    zoomLocation = gl.getUniformLocation(resources.program, "u_zoom");
    panLocation = gl.getUniformLocation(resources.program, "u_pan");
    aspectLocation = gl.getUniformLocation(resources.program, "u_aspect");
    selectedLocation = gl.getUniformLocation(resources.program, "u_selected");
    if (positionLocation < 0 || normalLocation < 0 || !rotationLocation || !zoomLocation ||
        !panLocation || !aspectLocation || !selectedLocation) {
      throw new Error("The 3D preview shader bindings are incomplete.");
    }
    positionBuffer = gl.createBuffer();
    normalBuffer = gl.createBuffer();
    if (!positionBuffer || !normalBuffer) throw new Error("WebGL could not allocate mesh buffers.");
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(normalLocation);
    gl.vertexAttribPointer(normalLocation, 3, gl.FLOAT, false, 0, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
  };

  const reset = () => { transform = resetCADViewport(); draw(); };
  const fitToView = () => { transform = fitCADViewport(transform); draw(); };
  const zoomIn = () => { transform = zoomCADViewport(transform, 1.2); draw(); };
  const zoomOut = () => { transform = zoomCADViewport(transform, 1 / 1.2); draw(); };
  const pointerDistance = (points: { x: number; y: number }[]) =>
    Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  const pointerMidpoint = (points: { x: number; y: number }[]) => ({
    x: (points[0].x + points[1].x) / 2,
    y: (points[0].y + points[1].y) / 2
  });
  const pointerDown = (event: PointerEvent) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { canvas.setPointerCapture(event.pointerId); } catch {}
    if (pointers.size >= 2) {
      gestureMode = "pinch";
      const points = [...pointers.values()].slice(0, 2);
      lastPinchDistance = pointerDistance(points);
      lastPinchMidpoint = pointerMidpoint(points);
    } else {
      gestureMode = event.button === 2 || event.button === 1 || event.shiftKey ? "pan" : "orbit";
    }
  };
  const pointerMove = (event: PointerEvent) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      const points = [...pointers.values()].slice(0, 2);
      const distance = pointerDistance(points);
      const midpoint = pointerMidpoint(points);
      if (lastPinchDistance > 0 && distance > 0) {
        transform = zoomCADViewport(transform, distance / lastPinchDistance);
      }
      transform = panCADViewport(
        transform,
        midpoint.x - lastPinchMidpoint.x,
        midpoint.y - lastPinchMidpoint.y,
        canvas.clientWidth,
        canvas.clientHeight
      );
      lastPinchDistance = distance;
      lastPinchMidpoint = midpoint;
    } else {
      const deltaX = event.clientX - previous.x;
      const deltaY = event.clientY - previous.y;
      transform = gestureMode === "pan"
        ? panCADViewport(transform, deltaX, deltaY, canvas.clientWidth, canvas.clientHeight)
        : rotateCADViewport(transform, deltaX, deltaY);
    }
    draw();
  };
  const pointerUp = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    lastPinchDistance = 0;
    if (pointers.size === 1) gestureMode = "orbit";
    else if (pointers.size === 0) gestureMode = "orbit";
  };
  const wheel = (event: WheelEvent) => {
    event.preventDefault();
    transform = zoomCADViewport(transform, event.deltaY > 0 ? 0.9 : 1.1);
    draw();
  };
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === "Home") { fitToView(); return; }
    if (event.key === "+" || event.key === "=") { zoomIn(); event.preventDefault(); return; }
    if (event.key === "-") { zoomOut(); event.preventDefault(); return; }
    const panKeys: Record<string, [number, number]> = {
      ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16]
    };
    const delta = panKeys[event.key];
    if (!delta) return;
    event.preventDefault();
    if (event.shiftKey) {
      transform = panCADViewport(transform, delta[0], delta[1], canvas.clientWidth, canvas.clientHeight);
    } else {
      transform = rotateCADViewport(transform, delta[0] * 8, delta[1] * 8);
    }
    draw();
  };
  const contextMenu = (event: Event) => event.preventDefault();
  const contextLostHandler = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    onContextStatus?.(new Error("WebGL context lost. Attempting to restore the CAD display."));
    if (contextRestoreTimer !== null) window.clearTimeout(contextRestoreTimer);
    contextRestoreTimer = window.setTimeout(() => {
      if (contextLost) {
        onContextStatus?.(new Error("WebGL context restoration timed out. Reload the CAD preview to recover."));
      }
    }, 5000);
  };
  const contextRestoredHandler = () => {
    if (contextRestoreTimer !== null) window.clearTimeout(contextRestoreTimer);
    contextRestoreTimer = null;
    try {
      initializeResources();
      contextLost = false;
      draw();
      onContextStatus?.(null);
    } catch (cause) {
      contextLost = true;
      onContextStatus?.(cause instanceof Error ? cause : new Error("WebGL resources could not be restored."));
    }
  };

  const destroy = () => {
    if (contextRestoreTimer !== null) window.clearTimeout(contextRestoreTimer);
    contextRestoreTimer = null;
    resizeObserver?.disconnect();
    if (typeof ResizeObserver === "undefined") window.removeEventListener("resize", draw);
    canvas.removeEventListener("pointerdown", pointerDown);
    canvas.removeEventListener("pointermove", pointerMove);
    canvas.removeEventListener("pointerup", pointerUp);
    canvas.removeEventListener("pointercancel", pointerUp);
    canvas.removeEventListener("contextmenu", contextMenu);
    canvas.removeEventListener("wheel", wheel);
    canvas.removeEventListener("keydown", keyDown);
    canvas.removeEventListener("webglcontextlost", contextLostHandler);
    canvas.removeEventListener("webglcontextrestored", contextRestoredHandler);
    if (!gl.isContextLost()) disposeResources();
  };

  try {
    initializeResources();
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);
    canvas.addEventListener("contextmenu", contextMenu);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("keydown", keyDown);
    canvas.addEventListener("webglcontextlost", contextLostHandler);
    canvas.addEventListener("webglcontextrestored", contextRestoredHandler);
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(draw);
      resizeObserver.observe(canvas);
    } else {
      window.addEventListener("resize", draw);
    }
    draw();
    return {
      controls: {
        reset,
        fitToView,
        zoomIn,
        zoomOut,
        rotateLeft: () => { transform = rotateCADViewport(transform, -16, 0); draw(); },
        rotateRight: () => { transform = rotateCADViewport(transform, 16, 0); draw(); },
        setVisible: (nextVisible) => { visible = nextVisible; draw(); },
        setSelected: (nextSelected) => { selected = nextSelected; draw(); }
      },
      destroy,
    };
  } catch (error) {
    destroy();
    throw error;
  }
}
