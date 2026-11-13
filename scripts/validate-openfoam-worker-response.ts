import { readFileSync } from "node:fs";
import { OpenFOAMLaminarChannelRequest, OpenFOAMLaminarChannelResult } from "../src/cfd/types.js";
import { OpenFOAMProvider } from "../src/providers/openfoam.js";

const requestPath = process.argv[2] ?? ".openfoam-smoke/request.json";
const resultPath = process.argv[3] ?? ".openfoam-smoke/response.json";
const request = JSON.parse(readFileSync(requestPath, "utf8")) as OpenFOAMLaminarChannelRequest;
const result = JSON.parse(readFileSync(resultPath, "utf8")) as OpenFOAMLaminarChannelResult;

const provider = new OpenFOAMProvider({
  runLaminarChannel: async () => result
});
const response = await provider.execute({
  capability: "ANALYSIS.CFD_LAMINAR_CHANNEL",
  risk: "HIGH",
  input: request as unknown as Record<string, unknown>
});

if (!response.success) {
  throw new Error(response.error ?? "OpenFOAM numerical acceptance failed.");
}
const output = response.output as {
  result: OpenFOAMLaminarChannelResult;
  validation: { status: string; blockingReasons: string[]; normalizedProfileRmse?: number; massFluxRelativeError?: number };
};
if (output.validation.status !== "PASS") {
  throw new Error(`OpenFOAM numerical validation failed: ${output.validation.blockingReasons.join("; ")}`);
}
console.log(JSON.stringify({
  status: output.validation.status,
  solverVersion: output.result.solverVersion,
  reynoldsNumber: (output.result as OpenFOAMLaminarChannelResult).solverVersion,
  meshCells: output.result.meshCells,
  normalizedProfileRmse: output.validation.normalizedProfileRmse,
  massFluxRelativeError: output.validation.massFluxRelativeError,
  artifactCount: output.result.artifacts.length
}));
