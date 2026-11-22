import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sourceHtml = readFileSync(new URL("../benchmarks/renderers/index.html", import.meta.url), "utf8");
const publicHtml = readFileSync(new URL("../public/benchmarks/renderers/index.html", import.meta.url), "utf8");
const sourceScript = readFileSync(new URL("../benchmarks/renderers/benchmark.mjs", import.meta.url), "utf8");
const publicScript = readFileSync(new URL("../public/benchmarks/renderers/benchmark.mjs", import.meta.url), "utf8");
const sourceStyles = readFileSync(new URL("../benchmarks/renderers/styles.css", import.meta.url), "utf8");
const publicStyles = readFileSync(new URL("../public/benchmarks/renderers/styles.css", import.meta.url), "utf8");

describe("M2.3 published renderer benchmark", () => {
  it("serves the canonical benchmark page and script without stale public copies", () => {
    expect(publicHtml).toBe(sourceHtml);
    expect(publicScript).toBe(sourceScript);
    expect(publicStyles).toBe(sourceStyles);
  });

  it("retains five paired WebGL2 trials, raw metrics and context-recovery evidence", () => {
    expect(sourceScript).toContain('const PAIRED_TRIALS = 5;');
    expect(sourceScript).toContain('webgl2: Boolean(gl)');
    expect(sourceScript).toContain('frameIntervalsMs:');
    expect(sourceScript).toContain('pickLatenciesMs:');
    expect(sourceScript).toContain('contextRecoveryPassed:');
    expect(sourceHtml).toContain('CAD viewport renderer benchmark');
    expect(sourceHtml).toContain('Do not choose a production engine until physical desktop/Android gates pass.');
  });
});
