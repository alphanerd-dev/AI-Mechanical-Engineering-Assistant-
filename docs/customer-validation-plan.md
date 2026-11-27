# Customer Validation and Pilot Plan

**Created:** 27 November 2026  
**Status:** Required before locking the first commercial workflow  
**Related strategy:** [Product Brief](product-brief.md)

## 1. Objective

Determine which recurring mechanical design/review workflow is painful, frequent, technically supportable and backed by a buyer. The purpose is to validate the problem and first workflow—not to collect feature requests or confirm a developer-selected solution.

The rotating-equipment / shaft design-review workflow is the leading hypothesis because the repository already has shaft calculations and geometry foundations. It is not yet a validated market decision.

## 2. Discovery sample

Conduct approximately **15 structured interviews** across:

- Small mechanical engineering consultancies.
- Machine builders and OEM suppliers.
- Relevant industrial engineering/service firms.

Interview both the people who perform the work (design/mechanical engineers) and the people who fund or approve it (engineering managers, owners or engineering leads). A user liking the product and a buyer committing budget are different signals.

## 3. Interview method

Ask about the **last real example**, not hypothetical feature preferences.

For each observed workflow, capture:

1. Trigger and engineering objective.
2. Required inputs, files, units, standards/design basis and source of each value.
3. Current software, calculations, templates, handoffs and manual steps.
4. Checks and review criteria that must be satisfied before acceptance.
5. Typical missing data, errors, rework, delays and failure modes.
6. Engineer and reviewer effort, elapsed time and frequency.
7. Consequence of an incorrect or incomplete result.
8. Who owns the budget, procurement path and security constraints.
9. Whether the team will provide a representative task and participate in a pilot.
10. Whether there is a concrete willingness to pay or procurement step.

Do not treat generic enthusiasm, a feature wishlist or an agreement to “stay in touch” as evidence of willingness to pay.

## 4. Compare workflow candidates

Compare the shaft design-review candidate with **at least two other recurring workflows** discovered in interviews. Do not preselect alternatives without observing the customer's actual work.

Score each candidate against:

| Criterion | Evidence to collect |
|---|---|
| Frequency | How often the task is performed |
| Pain and cost | Time, rework, delay, coordination and review effort |
| Acceptance clarity | Whether inputs, checks and reviewer acceptance criteria are explicit |
| Technical feasibility | Whether current deterministic calculations, geometry providers and evidence contracts can support it |
| Risk manageability | Consequence of error and feasibility of independent checks and human review |
| Repeatability | Similar enough across tasks/customers to support a reusable workflow |
| Buyer urgency | Named budget owner, current workaround and willingness to pilot/pay |
| Measurability | Ability to compare manual and product-assisted work fairly |

Select one workflow only when it is frequent, painful, measurable, technically supportable and a buyer agrees to pilot. Otherwise revise the wedge before expanding code.

## 5. Observe the workflow end to end

Observe at least one real task from request to accepted review package. Record:

- Inputs and where they originate.
- Steps, tools, handoffs and decisions.
- Calculation methods, standards and checks.
- Manual documentation and evidence preparation.
- Reviewer actions, rework and reasons for rejection.
- Active engineer time and elapsed time.
- Constraints on file handling, deployment, security and integration.

Obtain permission before recording or collecting customer data. Use anonymized task references for measurement; do not place customer names, contact details, credentials, confidential drawings or proprietary calculations in the repository.

## 6. Design-partner pilot

Recruit **2–3 design partners** after workflow selection. Run matched conventional and product-assisted tasks using the same input scope, design basis, acceptance criteria and reviewer expectations.

Measure both paths, including correction and review work:

- Engineer active minutes.
- Elapsed time from complete inputs to reviewable package.
- First-pass reviewer acceptance and material omissions.
- Rework count and severity.
- Input clarification cycles.
- Recovery from failures and preservation of valid work.
- Evidence and traceability completeness.
- Repeat use of the same workflow.
- Model, compute, infrastructure, license and support cost.
- Reviewer effort and any work shifted from the engineer to the reviewer.

Use the [Outcome Baseline](outcome-baseline.md) CLI for its supported fields and record additional reviewer/rework observations separately where the current schema does not represent them. Do not infer missing cost components or claim causal productivity gains from small, uncontrolled samples.

## 7. Pilot exit criteria

Proceed to narrow commercialisation only when:

- The same workflow is used more than once by a design partner.
- The responsible reviewer accepts the package against agreed criteria.
- Net effort or total cost improves after correction and review are included.
- Quality, evidence completeness and traceability do not regress.
- The solution fails visibly and safely on unsupported or incomplete cases.
- A buyer demonstrates credible paid-pilot interest or a concrete procurement step.
- Delivery, compute, support and integration costs are understood well enough to form a viable pricing hypothesis.

If the product is useful but not budget-worthy, revisit the workflow, buyer and economics. Do not broaden into unrelated capabilities to compensate.

## 8. Evidence and decision record

Maintain a private trial dataset outside the repository. Store only anonymized aggregate findings and the resulting decision in version-controlled documentation. The decision record should state:

- Workflow selected and alternatives considered.
- Customer segment, user and buyer evidence.
- Observed baseline and acceptance criteria.
- Pilot participants by anonymized role, not identity.
- Measured results and sample limitations.
- Paid-pilot signal and unresolved risks.
- Decision: proceed, revise workflow, or stop.

## 9. Non-goals

This plan is not a full market-size study, formal usability certification, safety case, solver qualification or proof of product-market fit. A small pilot supports a scoped decision; it does not establish universal performance or engineering correctness.
