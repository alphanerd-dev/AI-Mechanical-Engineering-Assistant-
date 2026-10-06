# Research Verification Gate

V1.5.2 adds an explicit boundary between research candidates and engineering memory.

## Rule

Research providers may return source-backed findings, but provider authority does not automatically make a claim verified.

Normal flow:

Research result -> ASSUMED finding -> verification method -> VERIFIED evidence -> project memory -> requirement traceability -> engineering decision

## Verification methods

- SOURCE_INSPECTION — inspect the underlying source; an evidence URI is required.
- INDEPENDENT_CALCULATION — independently reproduce a numerical or engineering result.
- MANUFACTURER_CONFIRMATION — confirm a product, material, or component claim with the manufacturer.
- HUMAN_REVIEW — an engineer explicitly reviews the claim and supporting context.

## Memory rule

EngineeringMemory.saveEvidence() rejects any evidence whose status is not VERIFIED.

Verified evidence may be linked to project requirements and is recorded in the engineering event timeline.

## Important limitation

This is a software verification gate, not proof that an engineering claim is physically correct. The verifier, method, source, notes, and evidence remain part of the audit trail.

## API

POST /api/research/verify evaluates a finding and returns the verification result. Production should later persist verification records in the project database and require appropriate approval for high-risk engineering decisions.
