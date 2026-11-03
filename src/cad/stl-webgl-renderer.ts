import type { STLMeshPreview } from "./stl-preview";

/**
 * Isolated, bounded WebGL fallback for the existing STL-only preview path.
 * R3F/drei are not present in the current lockfile; keeping this renderer behind
 * a small lifecycle API allows a future R3F viewport without changing artifact
 * loading, project authorization, or validation boundaries.
 */

export type StlViewportControls = { reset: () => void; rotateLeft: () => void; rotateRight: () => void };
type PreviewProgram = { program: WebGLProgram; vertex: WebGLShader; fragment: WebGLShader };

function readThemeRgb(variable: string): [number, number, number] {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  const match = value.match(/^#([0-9a-f]{6})$/i);
  if (!match) throw new Error(`The required design token ${variable} is unavailable.`);
  const hex = match[1];
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255) as [number, number, number];
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("WebGL could not create a shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  const message = gl.getShaderInfoLog(shader) || "A preview shader could not be compiled.";
  gl.deleteShader(shader);
  throw new Error(message);
}

function linkPreviewProgram(gl: WebGLRenderingContext, vertex: WebGLShader, fragment: WebGLShader) {
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

function createPreviewProgram(gl: WebGLRenderingContext, accent: [number, number, number]): PreviewProgram {
  const vertexSource = [
    "attribute vec3 a_position;",
    "attribute vec3 a_normal;",
    "uniform vec2 u_rotation;",
    "uniform float u_zoom;",
    "varying vec3 v_normal;",
    "vec3 rotateX(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }",
    "vec3 rotateY(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }",
    "void main() {",
    "  vec3 p = rotateX(rotateY(a_position, u_rotation.y), u_rotation.x);",
    "  v_normal = normalize(rotateX(rotateY(a_normal, u_rotation.y), u_rotation.x));",
    "  gl_Position = vec4(p.xy * u_zoom, p.z * 0.48, 1.0);",
    "}",
  ].join("\n");
  const accentSource = accent.map((channel) => channel.toFixed(4)).join(", ");
  const fragmentSource = [
    "precision mediump float;",
    "varying vec3 v_normal;",
    "void main() {",
    "  vec3 light = normalize(vec3(-0.45, 0.75, 1.0));",
    "  float diffuse = max(dot(normalize(v_normal), light), 0.0);",
    "  float shade = 0.32 + 0.68 * diffuse;",
    `  vec3 base = vec3(${accentSource});`,
    "  gl_FragColor = vec4(base * shade, 1.0);",
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

export function createStlWebGLRenderer(canvas: HTMLCanvasElement, mesh: STLMeshPreview): {
  controls: StlViewportControls;
  destroy: () => void;
} {
  const gl = canvas.getContext("webgl", { antialias: true, alpha: true });
  if (!gl) throw new Error("WebGL is unavailable in this browser. The CAD source record is still preserved.");

  let resources: PreviewProgram | null = null;
  let positionBuffer: WebGLBuffer | null = null;
  let normalBuffer: WebGLBuffer | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let rotationX = -0.42;
  let rotationY = 0.62;
  let zoom = 0.78;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const destroy = () => {
    resizeObserver?.disconnect();
    if (typeof ResizeObserver === "undefined") window.removeEventListener("resize", draw);
    canvas.removeEventListener("pointerdown", pointerDown);
    canvas.removeEventListener("pointermove", pointerMove);
    canvas.removeEventListener("pointerup", pointerUp);
    canvas.removeEventListener("pointercancel", pointerUp);
    canvas.removeEventListener("wheel", wheel);
    canvas.removeEventListener("keydown", keyDown);
    if (positionBuffer) gl.deleteBuffer(positionBuffer);
    if (normalBuffer) gl.deleteBuffer(normalBuffer);
    if (resources) {
      gl.deleteProgram(resources.program);
      gl.deleteShader(resources.vertex);
      gl.deleteShader(resources.fragment);
    }
  };

  const draw = () => {
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
    if (!resources) return;
    gl.useProgram(resources.program);
    gl.uniform2f(rotationLocation!, rotationX, rotationY);
    gl.uniform1f(zoomLocation!, zoom);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.positions.length / 3);
  };

  let rotationLocation: WebGLUniformLocation | null = null;
  let zoomLocation: WebGLUniformLocation | null = null;
  const reset = () => { rotationX = -0.42; rotationY = 0.62; zoom = 0.78; draw(); };
  const pointerDown = (event: PointerEvent) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    rotationY += (event.clientX - lastX) * 0.009;
    rotationX = Math.max(-1.48, Math.min(1.48, rotationX + (event.clientY - lastY) * 0.009));
    lastX = event.clientX;
    lastY = event.clientY;
    draw();
  };
  const pointerUp = () => { dragging = false; };
  const wheel = (event: WheelEvent) => {
    event.preventDefault();
    zoom = Math.max(0.35, Math.min(2.0, zoom * (event.deltaY > 0 ? 0.9 : 1.1)));
    draw();
  };
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") rotationY -= 0.08;
    else if (event.key === "ArrowRight") rotationY += 0.08;
    else if (event.key === "ArrowUp") rotationX = Math.max(-1.48, rotationX - 0.08);
    else if (event.key === "ArrowDown") rotationX = Math.min(1.48, rotationX + 0.08);
    else if (event.key === "Home") { reset(); return; }
    else return;
    event.preventDefault();
    draw();
  };

  try {
    resources = createPreviewProgram(gl, readThemeRgb("--color-accent"));
    const positionLocation = gl.getAttribLocation(resources.program, "a_position");
    const normalLocation = gl.getAttribLocation(resources.program, "a_normal");
    rotationLocation = gl.getUniformLocation(resources.program, "u_rotation");
    zoomLocation = gl.getUniformLocation(resources.program, "u_zoom");
    if (positionLocation < 0 || normalLocation < 0 || !rotationLocation || !zoomLocation) {
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
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("keydown", keyDown);
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
        rotateLeft: () => { rotationY -= 0.14; draw(); },
        rotateRight: () => { rotationY += 0.14; draw(); },
      },
      destroy,
    };
  } catch (error) {
    destroy();
    throw error;
  }
}
