# Artifacts and Evidence

Engineering outputs are not just text. They are artifacts with provenance and validation state.

An artifact can be:
- CAD source
- solid geometry
- STEP/STL
- FEA model/result
- research evidence
- PLM record

Evidence records explain why a value or artifact should be trusted.

## Trust model

Use:
- KNOWN
- ASSUMED
- ESTIMATED
- CALCULATED
- MEASURED
- VERIFIED

A release-critical claim should not be treated as VERIFIED merely because an LLM generated it.

## Example

```json
{
  "kind": "STEP",
  "validationStatus": "PASS",
  "informationStatus": "VERIFIED",
  "backend": "cad.occt",
  "evidenceIds": ["geometry-check-001"]
}
```
