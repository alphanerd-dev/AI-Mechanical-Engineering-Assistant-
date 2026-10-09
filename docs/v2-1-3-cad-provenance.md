# V2.1.3 — CAD artifact provenance and validation integration

## Objective

Close the trust gap between a successful CAD worker call and an engineering artifact that can support requirement verification. Bind each worker-reported output to a canonical project/model identity, host-authored provider identity, execution request and exact source-text digest. Accept geometry evidence only when it identifies the exact output artifact and matching source lineage.

## Provenance contract

- A model identity must validate and belong to the project that owns the execution.
- Execution request ID, source filename, source text, backend and host-authored provider ID are required before provenance is emitted.
- The request backend must match the worker result backend; unsuccessful executions contribute no artifact paths to the manifest.
- sourceSha256 is SHA-256 of the exact UTF-8 source string submitted for execution. It is not a hash of STEP, BREP, STL, 3MF or other output bytes.
- Output URIs come from the worker result and are provenance references, not proof that files still exist or that their contents are unchanged.
- Manifest artifacts remain UNVALIDATED until a separate validator issues a receipt that binds the exact artifact ID, project ID, model identity, backend and source digest.
- Geometry validation that lacks an explicit checker identity, a solid count or a valid timestamp is incomplete. Failed geometry is recorded as rejected/calculated evidence, never as VERIFIED.
- The legacy bridge remains for compatibility but cannot create VERIFIED artifacts or evidence because it has no source/model lineage.

## Validation gate

The manifest-backed artifact bundle builder produces an accepted bundle only when the validator receipt matches the manifest-bound solid artifact and its provenance. It returns INCOMPLETE without a bundle on lineage mismatch, missing provenance, or incomplete validator output. A structurally valid receipt with a failing geometry verdict returns a rejected bundle for diagnosis, with validationStatus FAIL and evidence status CALCULATED.

## Deliberate limitations

This milestone does not compute hashes of output files, prove that worker-reported paths exist, synchronize native CAD documents, validate revision parity, install a CAD runtime, or claim that passing solid topology proves full engineering safety or manufacturability. A trusted artifact store/worker must eventually provide output-byte digests and storage integrity checks.

## Verification

Acceptance tests cover deterministic provenance, source digests, failed-execution suppression, project/backend checks, exact artifact/source receipt binding, rejected geometry, incomplete validation, and downstream requirement verification.
