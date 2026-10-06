# Artifacts and Evidence

Engineering outputs are not just text. They are artifacts with provenance and validation state.

An artifact can be:
- CAD source
- solid geometry
- STEP/STL
- FEA model/result
- research evidence
- manufacturing process plan
- manufacturing inspection record
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

## Manufacturing evidence

Manufacturing checks use the dedicated MANUFACTURING_CHECK evidence type. A manufacturing measurement becomes VERIFIED only when its configured acceptance limits are satisfied and the resulting evidence is explicitly linked to the relevant manufacturing artifacts and requirements.

## Example

```json
{
  "kind": "MANUFACTURING_RECORD",
  "validationStatus": "PASS",
  "informationStatus": "VERIFIED",
  "backend": "manufacturing-core",
  "evidenceIds": ["inspection-check-001"]
}
```
