import { parseCADPartIntent } from "../src/cad/intent.js";
import { Build123dIntentCodeGenerator } from "../src/providers/build123d-intent-generator.js";

const resolution = parseCADPartIntent(
  "Create a cylindrical shaft with a diameter of 30 mm and a length of 200 mm."
);
if (resolution.status !== "READY") {
  throw new Error("CAD smoke intent was not resolved: " + (
    resolution.status === "NEEDS_INPUT" ? resolution.nextQuestion : resolution.reason
  ));
}

const generated = await new Build123dIntentCodeGenerator().generate({
  specification: resolution.specification
});
process.stdout.write(JSON.stringify({
  id: "v2-1-5-cad-intent-smoke",
  backend: generated.backend,
  source: generated.source,
  filename: generated.filename,
  timeoutMs: 30_000
}));
