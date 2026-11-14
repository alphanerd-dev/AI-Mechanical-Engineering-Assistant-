const VERSIONS = {
  babylon: "9.35.0",
  three: "0.187.0"
};
const URLS = {
  babylon: "https://esm.sh/@babylonjs/core@" + VERSIONS.babylon + "?bundle",
  three: "https://cdn.jsdelivr.net/npm/three@" + VERSIONS.three + "/build/three.module.js"
};
const byId = (id) => document.getElementById(id);
let lastResult = null;

function setStatus(engine, status) { byId(engine + "-state").textContent = status; }
function writeMetrics(engine, value) { byId(engine + "-metrics").textContent = JSON.stringify(value, null, 2); }
function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}
function environment() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemoryGiB: navigator.deviceMemory ?? null,
    viewport: [innerWidth, innerHeight],
    webgl2: Boolean(document.createElement("canvas").getContext("webgl2")),
    jsHeapUsedBytes: performance.memory?.usedJSHeapSize ?? null,
    timestamp: new Date().toISOString()
  };
}
function instancePosition(index, count) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / cols);
  const x = (index % cols) - (cols - 1) / 2;
  const z = Math.floor(index / cols) - (rows - 1) / 2;
  return [x * 1.35, 0, z * 1.35];
}
function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundedOrNull(value, digits) {
  if (value === null) return null;
  return Number(value.toFixed(digits));
}

function averageFps(avgFrameMs) {
  if (!avgFrameMs || avgFrameMs <= 0) return null;
  return Number((1000 / avgFrameMs).toFixed(1));
}

function maximumOrNull(values) {
  if (!values.length) return null;
  return Math.max(...values);
}

function finishSummary({
  engine, started, frames, pickSamples, renderMs, initMs, count, contextLost, visibilityToggleCount
}) {
  const avgFrameMs = average(frames);
  const averagePickMs = average(pickSamples);
  return {
    engine,
    version: VERSIONS[engine],
    workloadInstances: count,
    webglVersion: 2,
    initializationMs: Number(initMs.toFixed(2)),
    firstRenderMs: Number(renderMs.toFixed(2)),
    sampleDurationMs: Number((performance.now() - started).toFixed(2)),
    frameCount: frames.length,
    avgFrameMs: roundedOrNull(avgFrameMs, 2),
    p50FrameMs: roundedOrNull(percentile(frames, 0.5), 2),
    p95FrameMs: roundedOrNull(percentile(frames, 0.95), 2),
    maxFrameMs: roundedOrNull(maximumOrNull(frames), 2),
    avgFps: averageFps(avgFrameMs),
    pickingSamples: pickSamples.length,
    avgPickMs: roundedOrNull(averagePickMs, 3),
    contextLostEvents: contextLost,
    visibilityToggleCount,
    jsHeapUsedBytesAfter: performance.memory?.usedJSHeapSize ?? null
  };
}

async function importEngines() {
  const started = performance.now();
  const [B, T] = await Promise.all([import(URLS.babylon), import(URLS.three)]);
  return { B, T, importMs: performance.now() - started };
}
function createThreeScene(T, canvas, count) {
  const startInit = performance.now();
  const renderer = new T.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  const gl = renderer.getContext();
  if (!(gl instanceof WebGL2RenderingContext)) throw new Error("Three.js did not create a WebGL 2 context.");
  renderer.setPixelRatio(1);
  renderer.setSize(canvas.clientWidth || 960, canvas.clientHeight || 540, false);
  const scene = new T.Scene();
  scene.background = new T.Color(0x08111a);
  const camera = new T.PerspectiveCamera(52, (canvas.clientWidth || 960) / (canvas.clientHeight || 540), 0.1, 10000);
  camera.position.set(Math.max(10, Math.sqrt(count) * 1.7), Math.max(7, Math.sqrt(count) * 1.1), Math.max(10, Math.sqrt(count) * 1.7));
  camera.lookAt(0, 0, 0);
  scene.add(new T.HemisphereLight(0xdceefa, 0x1b2a36, 2));
  const light = new T.DirectionalLight(0xffffff, 2.2);
  light.position.set(4, 9, 6);
  scene.add(light);
  const geometry = new T.BoxGeometry(0.9, 0.9, 0.9);
  const material = new T.MeshStandardMaterial({ color: 0x42c8b4, roughness: 0.55, metalness: 0.1 });
  const mesh = new T.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(T.StaticDrawUsage);
  const object = new T.Object3D();
  for (let index = 0; index < count; index += 1) {
    const [x, y, z] = instancePosition(index, count);
    object.position.set(x, y, z);
    object.updateMatrix();
    mesh.setMatrixAt(index, object.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
  const initMs = performance.now() - startInit;
  const firstRenderStart = performance.now();
  renderer.render(scene, camera);
  return {
    renderer, scene, camera, geometry, material, mesh,
    initMs, renderMs: performance.now() - firstRenderStart
  };
}

async function sampleThreeScene(context) {
  const { T, canvas, setup, count, durationMs } = context;
  const raycaster = new T.Raycaster();
  const pointer = new T.Vector2(0, 0);
  const frames = [];
  const picks = [];
  let contextLost = 0;
  let visibilityToggleCount = 0;
  let lastVisibilityToggle = 0;
  const onLost = (event) => { event.preventDefault(); contextLost += 1; };
  canvas.addEventListener("webglcontextlost", onLost);
  const sampleStart = performance.now();
  let last = sampleStart;
  try {
    await new Promise((resolve) => {
      const tick = (now) => {
        frames.push(now - last);
        last = now;
        const angle = (now - sampleStart) * 0.00011;
        setup.camera.position.set(
          Math.cos(angle) * Math.max(10, Math.sqrt(count) * 2),
          setup.camera.position.y,
          Math.sin(angle) * Math.max(10, Math.sqrt(count) * 2)
        );
        setup.camera.lookAt(0, 0, 0);
        if (now - lastVisibilityToggle >= 400) {
          setup.mesh.visible = !setup.mesh.visible;
          lastVisibilityToggle = now;
          visibilityToggleCount += 1;
        }
        setup.renderer.render(setup.scene, setup.camera);
        const pickStart = performance.now();
        raycaster.setFromCamera(pointer, setup.camera);
        raycaster.intersectObject(setup.mesh, false);
        picks.push(performance.now() - pickStart);
        if (now - sampleStart < durationMs) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  } finally {
    canvas.removeEventListener("webglcontextlost", onLost);
  }
  return { sampleStart, frames, picks, contextLost, visibilityToggleCount };
}

async function runThree(T, canvas, count, durationMs) {
  const setup = createThreeScene(T, canvas, count);
  try {
    const sample = await sampleThreeScene({ T, canvas, setup, count, durationMs });
    return finishSummary({
      engine: "three", started: sample.sampleStart, frames: sample.frames, pickSamples: sample.picks,
      renderMs: setup.renderMs, initMs: setup.initMs, count,
      contextLost: sample.contextLost, visibilityToggleCount: sample.visibilityToggleCount
    });
  } finally {
    setup.renderer.dispose();
    setup.geometry.dispose();
    setup.material.dispose();
  }
}

async function runBabylon(B, canvas, count, durationMs) {
  const startInit = performance.now();
  const engine = new B.Engine(canvas, false, { preserveDrawingBuffer: false, stencil: true, disableWebGL2Support: false });
  if (engine.webGLVersion < 2) { engine.dispose(); throw new Error("Babylon.js did not create a WebGL 2 context."); }
  const scene = new B.Scene(engine);
  scene.clearColor = new B.Color4(8 / 255, 17 / 255, 26 / 255, 1);
  const camera = new B.ArcRotateCamera("camera", Math.PI / 4, 1.05, Math.max(14, Math.sqrt(count) * 3.2), B.Vector3.Zero(), scene);
  camera.lowerRadiusLimit = 1;
  camera.attachControl(canvas, true);
  const light = new B.HemisphericLight("hemisphere", new B.Vector3(0, 1, 0), scene);
  light.intensity = 1.6;
  const mesh = B.MeshBuilder.CreateBox("instances", { size: 0.9 }, scene);
  const material = new B.StandardMaterial("material", scene);
  material.diffuseColor = new B.Color3(0x42 / 255, 0xc8 / 255, 0xb4 / 255);
  mesh.material = material;
  const matrices = new Float32Array(count * 16);
  for (let index = 0; index < count; index += 1) {
    const [x, y, z] = instancePosition(index, count);
    B.Matrix.Translation(x, y, z).copyToArray(matrices, index * 16);
  }
  mesh.thinInstanceSetBuffer("matrix", matrices, 16, true);
  mesh.thinInstanceEnablePicking = true;
  const initMs = performance.now() - startInit;
  const firstStart = performance.now();
  scene.render();
  const renderMs = performance.now() - firstStart;
  const frames = [];
  const picks = [];
  let contextLost = 0;
  let visibilityToggleCount = 0;
  let lastVisibilityToggle = 0;
  const onLost = () => { contextLost += 1; };
  canvas.addEventListener("webglcontextlost", onLost);
  const sampleStart = performance.now();
  let last = sampleStart;
  await new Promise((resolve) => {
    const tick = () => {
      const now = performance.now();
      frames.push(now - last);
      last = now;
      camera.alpha += 0.0015;
      if (now - lastVisibilityToggle >= 400) {
        mesh.setEnabled(!mesh.isEnabled());
        lastVisibilityToggle = now;
        visibilityToggleCount += 1;
      }
      scene.render();
      const pickStart = performance.now();
      scene.pick(canvas.clientWidth / 2, canvas.clientHeight / 2, (candidate) => candidate === mesh);
      picks.push(performance.now() - pickStart);
      if (now - sampleStart < durationMs) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  const summary = finishSummary({
    engine: "babylon", started: sampleStart, frames, pickSamples: picks, renderMs, initMs,
    count, contextLost, visibilityToggleCount
  });
  canvas.removeEventListener("webglcontextlost", onLost);
  scene.dispose();
  engine.dispose();
  return summary;
}
let nextFirstEngine = "babylon";
function resetBenchmarkUI() {
  byId("run").disabled = true;
  byId("export").disabled = true;
  byId("babylon-metrics").textContent = "Loading engine modules…";
  byId("three-metrics").textContent = "Loading engine modules…";
  setStatus("babylon", "Loading");
  setStatus("three", "Loading");
}

function assertWebGL2Available() {
  const probe = document.createElement("canvas").getContext("webgl2");
  if (!probe) throw new Error("This browser/device does not expose WebGL 2. Benchmark aborted.");
}

async function runEngine(engine, context) {
  setStatus(engine, "Running");
  const result = engine === "babylon"
    ? await runBabylon(context.B, byId("babylon"), context.count, context.duration)
    : await runThree(context.T, byId("three"), context.count, context.duration);
  setStatus(engine, "Complete");
  writeMetrics(engine, { ...result, sharedEngineImportMs: Number(context.importMs.toFixed(2)) });
  return result;
}

async function runBothEngines(context) {
  const firstEngine = nextFirstEngine;
  const secondEngine = firstEngine === "babylon" ? "three" : "babylon";
  nextFirstEngine = secondEngine;
  const firstResult = await runEngine(firstEngine, context);
  const secondResult = await runEngine(secondEngine, context);
  return {
    firstEngine,
    secondEngine,
    results: {
      babylon: firstEngine === "babylon" ? firstResult : secondResult,
      three: firstEngine === "three" ? firstResult : secondResult
    }
  };
}

function createBenchmarkResult(context, runResults) {
  return {
    schemaVersion: 1,
    environment: environment(),
    engineVersions: VERSIONS,
    workload: context.count,
    sampleDurationMs: context.duration,
    importMs: context.importMs,
    runOrder: [runResults.firstEngine, runResults.secondEngine],
    results: [runResults.results.babylon, runResults.results.three]
  };
}

function showBenchmarkFailure(error) {
  const message = error instanceof Error ? error.message : "Benchmark failed.";
  setStatus("babylon", "Failed");
  setStatus("three", "Failed");
  byId("babylon-metrics").textContent = message;
  byId("three-metrics").textContent = message;
}

function showBenchmarkResult(result) {
  byId("environment").textContent = "Environment: " + JSON.stringify(result.environment);
  byId("export").disabled = false;
}

async function run() {
  resetBenchmarkUI();
  try {
    assertWebGL2Available();
    const engines = await importEngines();
    const context = {
      ...engines,
      count: Number(byId("workload").value),
      duration: Number(byId("duration").value)
    };
    const runResults = await runBothEngines(context);
    lastResult = createBenchmarkResult(context, runResults);
    showBenchmarkResult(lastResult);
  } catch (error) {
    showBenchmarkFailure(error);
  } finally {
    byId("run").disabled = false;
  }
}

byId("run").addEventListener("click", () => void run());
byId("export").addEventListener("click", () => {
  if (!lastResult) return;
  const blob = new Blob([JSON.stringify(lastResult, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "cad-renderer-benchmark-" + lastResult.workload + "-" + new Date().toISOString().replaceAll(":", "-") + ".json";
  anchor.click();
  URL.revokeObjectURL(url);
});
byId("environment").textContent = "Detected environment: " + JSON.stringify(environment());
