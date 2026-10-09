import { CADPartSpecification, validateCADPartSpecification } from "../cad/intent.js";
import { CADCodeBackend, CADCodeGenerator } from "./cad-code.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pythonNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error("CAD dimensions must be finite numbers.");
  return Number(value.toFixed(9)).toString();
}

/**
 * Deterministic source generator for the first supported CAD intent contract.
 * It accepts validated parameters, never accepts executable source from user input,
 * and exports the worker's explicit artifact manifest.
 */
export class Build123dIntentCodeGenerator implements CADCodeGenerator {
  async generate(input: Record<string, unknown>): Promise<{ source: string; backend: CADCodeBackend; filename: string }> {
    const candidate = isRecord(input) && isRecord(input.specification) ? input.specification : input;
    const validation = validateCADPartSpecification(candidate);
    if (!validation.valid) {
      throw new Error("CAD specification was rejected: " + validation.errors.join(" "));
    }

    const specification = candidate as unknown as CADPartSpecification;
    const radiusMm = pythonNumber(specification.diameterMm / 2);
    const lengthMm = pythonNumber(specification.lengthMm);
    const name = specification.name;

    const source = [
      "from pathlib import Path",
      "import json",
      "import os",
      "from build123d import Align, Cylinder, Mesher, export_brep, export_step, export_stl",
      "",
      "output_dir = Path(os.environ['CAD_ARTIFACT_DIR'])",
      "part = Cylinder(radius=" + radiusMm + ", height=" + lengthMm + ", align=(Align.CENTER, Align.CENTER, Align.MIN))",
      "export_brep(part, output_dir / 'part.brep')",
      "export_step(part, output_dir / 'part.step')",
      "export_stl(part, output_dir / 'part.stl')",
      "mesher = Mesher()",
      "mesher.add_shape(part)",
      "mesher.write(output_dir / 'part.3mf')",
      "manifest = {",
      "    'schemaVersion': 1,",
      "    'artifacts': {",
      "        'solidArtifactPath': 'part.brep',",
      "        'stepArtifactPath': 'part.step',",
      "        'stlArtifactPath': 'part.stl',",
      "        'threeMfArtifactPath': 'part.3mf',",
      "    },",
      "}",
      "(output_dir / 'cad-artifacts.json').write_text(json.dumps(manifest), encoding='utf-8')",
      ""
    ].join("\n");

    return {
      source: "# Deterministic " + name + " generator; dimensions are millimetres.\n" + source,
      backend: "build123d",
      filename: name + ".py"
    };
  }
}
