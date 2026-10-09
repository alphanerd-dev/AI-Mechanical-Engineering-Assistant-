# Phase G: Live Model and Workspace Acceptance

## Goal

Verify the configured model transport boundary and workspace integration with deterministic acceptance tests before enabling a real external model in a deployment. This phase does not claim a live vendor endpoint was exercised unless an explicitly configured deployment test records that evidence.

## Acceptance scope

- Missing model URL or model name leaves the generator unconfigured; proposal generation fails closed.
- Invalid configured endpoint credentials and invalid explicit timeout values are rejected rather than silently normalized.
- Absent or blank timeout uses the documented 45-second default.
- The transport sends JSON-mode requests through the configured server-side endpoint and never accepts endpoint, model name, or credentials from browser request data.
- HTTP errors, unreachable endpoints, malformed transport responses, and malformed proposal JSON produce bounded errors and do not create a reasoning record.
- Model output continues through the controlled task reasoning validator. A model response cannot choose task/project/framework identity, claim VERIFIED, execute capabilities, approve actions, or transition task state.
- Existing workspace authorization, project isolation, persistence validation, and optimistic revision checks remain in force.

## Configuration hardening

The previous timeout parser silently replaced invalid explicit timeout values with the default. That made a configuration mistake appear valid. The parser now uses the default only when the variable is absent or blank; explicit values outside the supported integer range of 1000–120000 ms fail closed.

## Live deployment gate

A live-model acceptance run requires a configured deployment, an approved endpoint, and server-side credentials supplied through the deployment's secret manager. Tests must not use production credentials in repository fixtures. Record the model identifier, deployment revision, test timestamp, and pass/fail evidence without recording secrets or sensitive prompt content.

Until such a run is executed, status is **automated transport/configuration acceptance passed; live external-provider acceptance pending**.
