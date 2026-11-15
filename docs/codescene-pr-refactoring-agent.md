# CodeScene PR Refactoring Agent

This repository can run the official [CodeScene PR Refactoring Agent](https://github.com/codescene-oss/pr-refactoring-agent) from a pull-request comment. It is an opt-in maintenance tool: it does not run on every PR and it does not replace CI, code review, engineering validation or approval.

## Configuration

Add these repository Actions secrets under **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
|---|---|
| `CODESCENE_ACCESS_TOKEN` | CodeScene Personal Access Token (Cloud or on-prem) |
| `GOOGLE_API_KEY` | Google AI Studio API key for the configured Gemini model |

The workflow uses `google/gemini-3.1-pro-preview` and the official action release `v1.1.9`. The model is deliberately selected for code-analysis/refactoring quality rather than reusing the application's lower-cost chat default. Model access and billing/quota must be enabled for the Google API key.

For CodeScene on-prem, add the `codescene_onprem_url` input to the action step and configure the appropriate trusted CA bundle if your instance requires one. Do not commit tokens, API keys or certificate private material.

## Trigger

After the workflow is merged into `main`, an OWNER, MEMBER or COLLABORATOR can comment on a same-repository pull request:

```text
/cs-agent
```

Include a narrow instruction after the command when useful, for example: fix only the Code Health degradations introduced by this PR; preserve public APIs, authorization boundaries, deterministic engineering contracts and existing tests.

The agent supports the CodeScene skills `fix-code-health-degradations` and `uplift-code-health`. Use the first for PR-introduced regressions. Use the second only when the reviewer intentionally wants to improve existing debt in selected files.

## Security and operating constraints

- The workflow listens to `issue_comment`, but runs only for PR comments beginning with `/cs-agent` from repository owners, members or collaborators.
- It rejects fork-based PRs. The agent must be able to write to the PR head branch; the base repository token cannot push changes to a fork.
- The job grants only the documented `contents: write`, `pull-requests: write` and `issues: write` permissions required by the action. The workflow's default permissions remain read-only.
- The action runs in GitHub Actions and sends source context to the configured CodeScene service and Google AI provider. Confirm your organization's source-code/data-processing policy before enabling it.
- The action can commit and push changes to the PR branch. Treat its output as a proposed patch: review the diff, run the complete CI suite, and independently verify engineering behavior before merge.
- It does not authorize changes to production data, engineering artifacts, solver results, manufacturing release decisions or machine instructions.
- GitHub does not automatically start new workflows for pushes made with the default `GITHUB_TOKEN`. Re-run required checks manually if the agent's commit does not trigger them.
- Do not paste secrets into PR comments or workflow logs.

## Troubleshooting

A run fails before refactoring if either required secret is absent. If authentication or model preflight fails, verify the CodeScene PAT, Google API key, model availability/quota and the workflow run logs. The workflow file must first be present on the default branch for `issue_comment` events to trigger it.

See the [official setup and troubleshooting guide](https://community.codescene.com/help/articles/6216708-pr-refactoring-agent-setup-prerequisites-and-troubleshooting) for CodeScene account setup, PAT creation and provider-specific details.
