# UX and state contract

## Project lifecycle
1. Capture project name, objective, domain and default units.
2. Review the proposed brief, assumptions, missing inputs and success criteria.
3. Create exactly one project record only after explicit confirmation.
4. Initialize a project-scoped conversation with the stable project ID and confirmed brief.

## Conversation contract
- Each thread has a stable ID, scope (global/project), ordered messages, context references and timestamps.
- Switching threads loads that thread's messages and attached sources.
- Creating a thread creates a separate empty conversation; it must not erase another thread.
- Displayed project/artifact sources must match explicitly attached thread context.
- AI/tool status distinguishes proposed, awaiting input, executing, executed, validated, approved and failed.

## Engineering truth contract
- A running revision cannot be represented as completed.
- Solver completion does not imply validation; validation does not imply human approval.
- Every result/evidence item is bound to project, revision and run IDs.
- An approved baseline remains unchanged until a new revision is separately approved.
- Synthetic data is labelled as demo data.

## Settings and search
- Save reports success only after persistence succeeds; failures preserve edits and show actionable errors.
- Search filters actual destinations/content and closes on navigation.
- Status filters normalize synonyms while displaying canonical labels.
- API keys/secrets must never be stored in localStorage or bundled source.
