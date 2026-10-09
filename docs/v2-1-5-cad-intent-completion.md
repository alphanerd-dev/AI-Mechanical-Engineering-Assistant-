# V2.1.5 — Bounded CAD intent-to-acceptance workflow

## Outcome

V2.1.5 connects the existing CAD execution, identity/provenance, and geometry-acceptance contracts into one explicit workflow. The first deterministic source generator supports cylindrical shafts and cylinders only.

Example supported request:

    Create a cylindrical shaft with a diameter of 30 mm and a length of 200 mm.

The parser requires explicit dimensions and units. It normalizes mm, cm, m, and inches to millimetres. The default permitted range for each dimension is 0.01 mm through 10,000 mm. It asks for missing or ambiguous values and returns UNSUPPORTED for shapes outside this first scope; it does not silently invent parameters or geometry.

## Execution lifecycle

1. Parse the natural-language request into a bounded, typed part specification.
2. Validate the server-resolved project ID, canonical model identity, and requirement IDs.
3. Generate deterministic build123d source from the validated dimensions. The source exports BREP, STEP, STL, and 3MF outputs and declares them through the worker's versioned artifact manifest.
4. Route CAD.CREATE_PART to the exact host-approved CAD provider. The workflow does not instantiate Docker or execute generated code in the web process.
5. Require the provider response to contain a solid artifact and provenance matching the project, model, execution, provider, backend, and exact source SHA-256.
6. Route CAD.VALIDATE_GEOMETRY to a distinct host-approved validation provider with the exact artifact identity, URI, and provenance supplied as the validation subject.
7. Create a validation receipt and pass it through the existing manifest-backed artifact bridge. Only a provenance-matched positive geometry result may produce ACCEPTED / VERIFIED evidence.

## Provider contract

The workflow depends on the existing CADCodeGenerator contract for source generation and CADCapabilityRouter for execution and validation. Host deployment configuration must explicitly declare the execution and validation providers AVAILABLE only after their respective runtimes and storage boundaries have been configured and checked.

The default IDs are cad.build123d for execution and cad.occt for validation. They can be changed by host configuration, but the providers must be distinct. A provider must return the artifact/provenance shape consumed by the existing CAD artifact manifest contract. A new CAD backend can be integrated by implementing that contract and supplying a matching source generator; the completion service itself does not hard-code a Docker transport.

## Failure semantics

- NEEDS_INPUT: dimensions are missing, ambiguous, invalid, or outside the supported range.
- UNSUPPORTED: the request requires a geometry family not currently implemented by the reference generator.
- BLOCKED: the required provider is not registered or is not explicitly available under host policy.
- FAILED: source generation, execution, or the provider's artifact/provenance contract failed.
- INCOMPLETE: CAD execution may have succeeded, but independent geometry validation or its receipt is missing/malformed. Artifacts remain unverified.
- REJECTED: the validator returned an explicit invalid geometry result. Evidence remains CALCULATED, not VERIFIED.
- ACCEPTED: independent validation passed and the artifact bundle bridge accepted a receipt bound to the exact solid and source digest.

## Verification

The acceptance suite in tests/cad-intent-completion.test.ts exercises parsing, unit conversion, missing input, ambiguity, size bounds, source generation, provider routing, successful end-to-end orchestration, validator unavailability, invalid geometry, and fail-closed behavior when execution is not explicitly available.

The workflow tests use fake executors and a fake validation adapter to verify application contracts. They do not claim that the deployed Docker image or a separately deployed OCCT/FreeCAD validator has run in production. The repository CI separately builds and smoke-tests the pinned build123d worker image.

## Current boundary

This milestone demonstrates the application-level intent → deterministic source → provider execution → independent validation → provenance-bound acceptance loop when host-provided providers are available. The initial natural-language generator is intentionally limited to cylinders/shafts. General bracket, housing, impeller, assembly, and unconstrained natural-language CAD generation remain unsupported until separately specified and tested. Durable shared artifact storage, a production OCCT/FreeCAD validation deployment, authorization, quotas, retention, and operational monitoring remain host/deployment responsibilities.
