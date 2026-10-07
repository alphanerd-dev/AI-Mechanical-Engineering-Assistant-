# V2.0.6 — Identity and authorization boundary

V2.0.6 establishes the security boundary required before production multi-user engineering execution.

## Design rules

- Authentication is an external concern. The Engineering Core receives an AuthenticatedIdentity, not passwords, tokens, cookies, or vendor-specific session objects.
- Authorization is explicit and deny-by-default.
- Roles map to named engineering permissions; roles do not directly execute capabilities.
- Project-scoped identities cannot access projects outside their declared scope.
- Agents receive a deliberately narrow role and cannot execute engineering tasks or grant approvals through this policy.
- A production identity provider can implement AuthenticationProvider without changing Engineering Core contracts.

## Current role model

- ENGINEER: project work, task proposal/execution, approval requests, evidence read/write.
- REVIEWER: project read, task proposal, approval request/grant, evidence read.
- ADMIN: all current permissions, including identity administration.
- AGENT: project read, task proposal, evidence read.

## Important boundary

This milestone does not claim that the repository already has a production login/session provider. It provides the provider-neutral identity and authorization contract that such a provider must satisfy.

The next security work should bind this contract to the application session layer, durable identity storage, session revocation, audit events, and deployment secrets without placing those concerns inside deterministic engineering providers.
