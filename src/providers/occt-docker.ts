import { DockerOCCTValidatorExecutor, DockerOCCTValidatorOptions } from "../execution/docker-occt-validator.js";
import { OcctProvider } from "./occt.js";

/**
 * Host-side factory for the concrete isolated OCCT BREP validator.
 * The runtime image must be provisioned and the worker script path must come from
 * trusted deployment configuration, never from the engineering request.
 */
export function createDockerOCCTValidationProvider(options: DockerOCCTValidatorOptions): OcctProvider {
  return new OcctProvider(new DockerOCCTValidatorExecutor(options));
}
