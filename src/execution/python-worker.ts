import { spawn } from "node:child_process";
import { ExecutionBackendAdapter } from "./executor.js";
import { ExecutionRequest, ExecutionResult } from "./types.js";
import { PYTHON_NUMERICAL_WORKER_POLICY, validateWorkerRequest } from "./worker-policy.js";

export interface PythonWorkerClient {
  run(request: ExecutionRequest): Promise<ExecutionResult>;
}

export interface PythonProcessClientOptions {
  command?: string;
  workerPath?: string;
}

export class PythonProcessClient implements PythonWorkerClient {
  private readonly command: string;
  private readonly workerPath: string;

  constructor(options: PythonProcessClientOptions = {}) {
    this.command = options.command ?? "python3";
    this.workerPath = options.workerPath ?? "worker/python/worker.py";
  }

  run(request: ExecutionRequest): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const child = spawn(this.command, [this.workerPath], { stdio: ["pipe", "pipe", "pipe"], shell: false });
      let stdout = "";
      let stderr = "";
      let settled = false;

      const finish = (result: ExecutionResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish({ success: false, outputs: {}, warnings: ["Python worker timed out."], artifactIds: [] });
      }, Math.max(1, request.timeoutMs));

      child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

      child.on("error", (error) => {
        clearTimeout(timer);
        finish({ success: false, outputs: {}, warnings: ["Python worker could not start: " + error.message], artifactIds: [] });
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        if (settled) return;
        try {
          const payload = JSON.parse(stdout);
          if (payload && typeof payload.success === "boolean") {
            finish({
              success: payload.success,
              outputs: payload.outputs ?? {},
              warnings: [
                ...(Array.isArray(payload.warnings) ? payload.warnings : []),
                ...(stderr ? ["worker stderr: " + stderr.trim()] : [])
              ],
              artifactIds: Array.isArray(payload.artifactIds) ? payload.artifactIds : []
            });
            return;
          }
        } catch {}
        finish({ success: false, outputs: {}, warnings: ["Invalid Python worker response (exit " + (code ?? "unknown") + ")."], artifactIds: [] });
      });

      child.stdin.write(JSON.stringify({ capability: request.capability, inputs: request.inputs }) + "\n");
      child.stdin.end();
    });
  }
}

export class PythonWorkerAdapter implements ExecutionBackendAdapter {
  readonly id = "execution.python-worker";

  constructor(private readonly client: PythonWorkerClient) {}

  canExecute(request: ExecutionRequest): boolean {
    return request.backend === "python-worker" &&
      ["ANALYSIS.SHAFT_TORQUE", "ANALYSIS.SHAFT_SIZE"].includes(request.capability);
  }

  execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const errors = validateWorkerRequest(PYTHON_NUMERICAL_WORKER_POLICY, request.capability, request.timeoutMs);
    if (errors.length > 0) {
      return Promise.resolve({ success: false, outputs: {}, warnings: errors, artifactIds: [] });
    }
    return this.client.run(request);
  }
}
