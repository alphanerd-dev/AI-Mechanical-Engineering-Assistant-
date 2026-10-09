# V2.0.28 — Cross-domain completion and sensible heating

## Objective

Prove that the shared engineering-intent entry path can route multiple bounded domains into registered deterministic completion units without duplicating the orchestration, validation, evidence, and approval contracts.

This milestone retains the product boundary:

**AI proposes. Deterministic systems execute. Validation decides. Evidence proves.**

## Cross-domain acceptance matrix

The integration acceptance suite sends natural-language requests through `ENGINEERING.ENTER_FROM_INTENT` and verifies the same lifecycle for:

| Domain | Registered unit | Deterministic result | Acceptance condition |
|---|---|---|---|
| Mechanical | `ENGINEERING.COMPLETE_SHAFT` | Transmitted torque and minimum shaft sizing | Proposed diameter meets the calculated minimum |
| Electrical | `ENGINEERING.COMPLETE_DC_LOAD` | Steady-state DC power and resistance | Power stays within the explicit maximum |
| Thermal / energy | `ENGINEERING.COMPLETE_SENSIBLE_HEATING` | Specific sensible energy and heat duty | Duty stays within the explicit maximum and the energy-balance check passes |

For all three units, the common contract requires explicit inputs, deterministic execution, validation, structured calculation artifacts, traceable evidence, and authorized human approval before a passing result is closed as complete.

## Bounded thermal scope

Inputs:
- Mass flow rate, kg/s
- Constant specific heat capacity, J/(kg·K)
- Inlet temperature, °C
- Target outlet temperature, °C
- Maximum permitted sensible-heating duty, kW

Calculations:
- Specific sensible energy: `q (kJ/kg) = cp (J/(kg·K)) × (Tout − Tin) / 1000`
- Heating duty: `Qdot (kW) = massFlow (kg/s) × q (kJ/kg)`

The second capability consumes the first capability's deterministic output through the capability router. Inputs are not inferred by the calculation provider, and no missing input is filled with an assumed value.

## Validation and evidence rules

The unit fails closed when an input is missing or invalid, a provider fails, a provider returns incomplete output, the energy-balance check fails, or the calculated duty exceeds the explicit maximum. A limit failure returns a calculated artifact marked `FAIL`, emits no verification evidence, and leaves the project blocked.

On passing deterministic validation, the unit emits evidence for the specific-energy calculation, heat-duty calculation, and maximum-duty/energy-balance acceptance. The report remains `WAITING_APPROVAL`. Only an authorized approval with a non-empty reason can initiate final project verification; approval does not bypass failed verification.

## Explicit limitations

This is a bounded, steady-state, single-phase sensible-heating calculation with constant specific heat. It does not size or select a heat exchanger, model heat loss, address pressure-dependent properties, phase change, fouling, transient response, fluid-flow pressure drop, control systems, or certify equipment safety. Those require separate capabilities, explicit inputs, and appropriate validation.

The formula implementation and integration tests are reference engineering calculations, not substitutes for authoritative property data, standards review, detailed design, or professional verification.

## Provider acceptance evidence

The live reasoning provider was exercised against the V2.0.27 provider-provenance assertion on 2026-10-09 in [GitHub Actions run 37968017138](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/37968017138), successful attempt 2. The redacted artifact records all nine checks as true, including provider identity supplied by the host; the resulting reasoning record is `PROPOSED` and its validation status is `NOT_PERFORMED`. This confirms integration transport and trust-boundary behavior, not engineering correctness.

## Acceptance gate

- [x] Live external-provider acceptance records the V2.0.27 provider-provenance assertion.
- [x] Mechanical, electrical, and thermal requests pass through the same natural-intent entry.
- [x] A missing thermal input escalates instead of being invented.
- [x] Thermal limit violation fails closed and emits no evidence.
- [x] Passing results remain awaiting explicit authorized approval.
- [ ] Repository CI (unit tests, type-check/build, lint, and security checks) is green for this change.
