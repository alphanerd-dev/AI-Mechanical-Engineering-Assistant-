# Azure Container Apps execution worker

This is the first Azure hosting path for the durable execution worker. The Azure job uses the existing Supabase job table and lease RPCs; Supabase remains the source of truth. The container runs in **drain mode** and exits after finding no work, processing five jobs, or reaching its soft runtime budget.

## Safety defaults

- The deployment workflow only runs by manual dispatch from `main`.
- Its default is a **Manual** Container Apps Job, not a scheduled job.
- The workflow does not change `DURABLE_EXECUTION_ENABLED` and does not start the worker automatically.
- Keep the production API feature flag off until authenticated API-to-worker E2E checks pass.
- The service-role key is a GitHub Environment secret and is stored as an Azure Container Apps Job secret. Never put it in source, workflow literals, build arguments, image layers, or logs.
- The image is deliberately published to public GHCR so Azure can pull it anonymously. The project repository is already public; the image contains code only, not runtime secrets.

## 1. Create the Azure resource group and GitHub OIDC identity

Use Azure Cloud Shell or a trusted machine with the Azure CLI. Sign in to the Azure for Students subscription and confirm it is the intended subscription:

```bash
az login
az account list --output table
az account set --subscription "<AZURE_STUDENT_SUBSCRIPTION_ID>"
az provider register --namespace Microsoft.App --wait
az provider register --namespace Microsoft.OperationalInsights --wait
az group create --name rg-engineering-execution --location westeurope
```

Create an application/service principal for GitHub Actions. The workflow authenticates by OpenID Connect (OIDC); do **not** create a client secret.

```bash
APP_JSON="$(az ad app create --display-name github-azure-execution-worker)"
APP_OBJECT_ID="$(printf '%s' "$APP_JSON" | python -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
APP_CLIENT_ID="$(printf '%s' "$APP_JSON" | python -c 'import json,sys; print(json.load(sys.stdin)["appId"])')"
TENANT_ID="$(az account show --query tenantId --output tsv)"
SUBSCRIPTION_ID="$(az account show --query id --output tsv)"
SP_OBJECT_ID="$(az ad sp create --id "$APP_CLIENT_ID" --query id --output tsv)"
SCOPE="/subscriptions/$SUBSCRIPTION_ID/resourceGroups/rg-engineering-execution"

az role assignment create \
  --assignee-object-id "$SP_OBJECT_ID" \
  --assignee-principal-type ServicePrincipal \
  --role Contributor \
  --scope "$SCOPE"

cat > /tmp/github-azure-federated-credential.json <<'JSON'
{
  "name": "github-main-azure-execution-worker",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:alphanerd-dev/AI-Mechanical-Engineering-Assistant-:environment:azure-execution-worker",
  "description": "GitHub Actions OIDC for the protected Azure execution-worker environment",
  "audiences": ["api://AzureADTokenExchange"]
}
JSON

az ad app federated-credential create \
  --id "$APP_OBJECT_ID" \
  --parameters @/tmp/github-azure-federated-credential.json
```

Keep these values available for the next step: `APP_CLIENT_ID`, `TENANT_ID`, and `SUBSCRIPTION_ID`. They are identifiers, not passwords. If the university-managed student tenant blocks app registration or role assignment, stop and ask its administrator for the equivalent OIDC identity scoped to this resource group; do not replace OIDC with a broad, long-lived credential.

## 2. Configure the protected GitHub Environment

In **GitHub → repository Settings → Environments**, create an environment named `azure-execution-worker`. Configure required reviewers if available, and restrict deployment branches to `main`.

Add these Environment variables:

| Variable | Value |
| --- | --- |
| `AZURE_CLIENT_ID` | `APP_CLIENT_ID` from step 1 |
| `AZURE_TENANT_ID` | `TENANT_ID` from step 1 |
| `AZURE_SUBSCRIPTION_ID` | `SUBSCRIPTION_ID` from step 1 |
| `AZURE_RESOURCE_GROUP` | `rg-engineering-execution` (optional; this is the default) |
| `AZURE_LOCATION` | `westeurope` (optional; this is the default) |
| `AZURE_CONTAINERAPPS_ENVIRONMENT` | `env-engineering-execution` (optional; this is the default) |
| `AZURE_JOB_NAME` | `engineering-execution` (optional prefix; the workflow appends `-manual` or `-scheduled`; keep the prefix at 22 characters or fewer) |
| `PYTHON_WORKER_URL` | Optional HTTPS URL of the authenticated Python numerical worker; configure only when the API is configured to submit Python-worker jobs. |

Add this Environment secret:

- `SUPABASE_SERVICE_ROLE_KEY`: the server-side service-role JWT or current `sb_secret_...` key for the intended Supabase project. Enter it directly in GitHub's secret editor; do not paste it into chat or commit it.
- `PYTHON_WORKER_API_TOKEN`: optional matching bearer token for `PYTHON_WORKER_URL`. Set both Python-worker values or neither. The workflow stores this token as an Azure Container Apps Job secret and exposes it through a `secretref`; never put it in the image or ordinary environment variables.

The default Supabase URL points at the current production project. If preparing a staging run, override `SUPABASE_URL` with the isolated E2E project's URL and set the matching staging key as the environment secret. Never pair a staging URL with a production service-role key or vice versa.

## 3. Publish the container image and deploy a Manual job first

Open **Actions → Deploy Azure execution worker → Run workflow** on branch `main`. Leave both `enable_schedule` and `disable_schedule` unchecked for the first deployment.

The workflow builds the container, publishes it to GitHub Container Registry (GHCR), and verifies that the image can be pulled without credentials **before it creates Azure resources**. It explicitly configures `ghcr.io` as the Container Apps Job registry on job creation and refreshes that registry configuration on updates. On the first run, if the new GHCR package is private, that public-pull check will fail before Azure deployment. Open the repository owner's **Packages**, select `ai-mechanical-engineering-assistant-execution-worker`, and change its visibility to **Public**. This is safe only because the image must contain code, not secrets. Then rerun the workflow.

The first successful deployment creates or updates the Manual Container Apps Job named `engineering-execution-manual`. A separate scheduled job, `engineering-execution-scheduled`, is created only when `enable_schedule` is explicitly checked after validation. Leaving both schedule inputs unchecked never deletes or changes an existing schedule. The workflow prints the deployed job configuration; no execution log will exist until a job is explicitly started.

For an initial worker smoke test, first change the protected GitHub Environment variables/secret to the isolated E2E Supabase project URL and its matching service-role key, then start exactly one job manually:

```bash
az containerapp job start \
  --name engineering-execution-manual \
  --resource-group rg-engineering-execution
```

Inspect the execution result and logs in Azure Portal. Restore the production URL/key only after the staging test is finished, and do not enable the five-minute schedule until the authenticated end-to-end criteria below are met. Do not run this smoke command while the job is configured with the production service-role key unless you have explicitly chosen to process any queued production jobs.

## 4. Validate before enabling a schedule

Before starting any production worker:

1. Verify the GitHub deployment succeeded and the image tag matches the commit that was reviewed.
2. Use an isolated E2E Supabase project to validate queue claiming, successful completion, retries, cancellation, lease recovery, idempotency, and cross-project authorization through the authenticated API and the real container.
3. Verify no service-role credential appears in image layers, artifacts, command output, or logs.
4. Review Azure Cost Management. Set budget alerts at sensible thresholds and check Container Apps and Log Analytics consumption. Budget alerts notify; they are not a hard spending cap.

Azure for Students provides a limited credit balance, typically US$100 for 12 months while the offer is active. Azure Container Apps Consumption grants cover the first 180,000 vCPU-seconds and 360,000 GiB-seconds per subscription per calendar month, but these grants are shared with other eligible usage; long or frequent job executions, logs, networking, and other resources may exceed them. Eligible charges are deducted from the Azure for Students credit. Check the remaining balance in the Azure Sponsorships portal and set a budget alert before using the schedule; budget alerts notify but are not a hard spending cap. If the credit is exhausted, Azure for Students resources can be suspended/decommissioned unless you choose to upgrade. This student subscription is intended for education, noncommercial research, and software design/development/testing/demonstration—not commercial production; reassess the subscription and applicable terms before using it for commercial workloads.

## 5. Enable the five-minute schedule only after validation

After the authenticated E2E checks pass, dispatch the workflow from `main` again, check `enable_schedule`, and leave `disable_schedule` unchecked. This creates or updates the separate `engineering-execution-scheduled` job with the cron expression `*/5 * * * *` (UTC), while preserving the manual job and its execution history.

The scheduled worker:
- claims jobs using the existing database lease/fencing mechanism;
- processes at most five jobs per run;
- has a 210-second soft drain budget and a 240-second platform timeout;
- exits if there is no queued work;
- never enables the API feature flag itself.

After enabling the schedule, inspect **Azure Portal → Container Apps Jobs → engineering-execution-scheduled → Executions and Logs**. Monitor failed executions, queued-job age/backlog, repeated lease expiries, and subscription credit. To turn off automatic runs, dispatch the workflow with `disable_schedule` checked and `enable_schedule` unchecked; this deletes only the scheduled job and leaves the manual job intact. Keep `DURABLE_EXECUTION_ENABLED` off if checks fail.
