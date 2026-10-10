import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createServiceRoleClient } from "../../../../lib/supabase/service";
import { authorizeSupabaseRequest } from "../../../../src/auth/supabase-service";
import { CAD_ARTIFACT_BUCKET } from "../../../../src/cad/persistence";

export const runtime = "nodejs";

type CheckStatus = "PASS" | "FAIL" | "BLOCKED";
type ReadinessCheck = { name: string; status: CheckStatus; detail: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_IMAGE = /@sha256:[a-f0-9]{64}$/i;
const MAX_DIAGNOSTIC_OUTPUT = 16 * 1024;

function addCheck(checks: ReadinessCheck[], name: string, status: CheckStatus, detail: string) {
  checks.push({ name, status, detail });
}

function env(value: string | undefined) {
  return value?.trim() ?? "";
}

function validImageReference(value: string) {
  return value.length > 0 && !value.startsWith("-") && !/[\r\n\0]/.test(value);
}

function runCommand(binary: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      binary,
      args,
      { timeout: 7_000, maxBuffer: MAX_DIAGNOSTIC_OUTPUT, encoding: "utf8", windowsHide: true },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(String(stdout).trim());
      }
    );
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId")?.trim();
  if (!projectId || !UUID.test(projectId)) {
    return NextResponse.json({ error: "A registered project UUID is required." }, { status: 400 });
  }

  try {
    const authorization = await authorizeSupabaseRequest("PROJECT.READ", projectId);
    if (!authorization.allowed) return NextResponse.json({ error: authorization.reason }, { status: 403 });
    const db = await createClient();
    const { data: project, error } = await db
      .from("engineering_projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Project membership could not be verified." }, { status: 503 });
    if (!project) return NextResponse.json({ error: "Project not found or inaccessible." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Project authorization is unavailable." }, { status: 503 });
  }

  const checks: ReadinessCheck[] = [];
  const buildImage = env(process.env.CAD_BUILD123D_IMAGE);
  const occtImage = env(process.env.CAD_OCCT_IMAGE);
  const artifactRootSetting = env(process.env.CAD_ARTIFACT_ROOT);
  const workerScriptSetting = env(process.env.CAD_OCCT_WORKER_PATH);
  const dockerBinary = env(process.env.CAD_DOCKER_BINARY) || "docker";
  const production = process.env.NODE_ENV === "production";

  const imagesConfigured = validImageReference(buildImage) && validImageReference(occtImage);
  addCheck(
    checks,
    "cad_images_configured",
    imagesConfigured ? "PASS" : "FAIL",
    imagesConfigured ? "Both trusted CAD image references are configured." : "Set valid server-side CAD_BUILD123D_IMAGE and CAD_OCCT_IMAGE values."
  );

  const imagesPinned = !production || (SHA256_IMAGE.test(buildImage) && SHA256_IMAGE.test(occtImage));
  addCheck(
    checks,
    "immutable_image_references",
    imagesPinned ? "PASS" : "FAIL",
    imagesPinned ? "Image references satisfy the deployment pinning policy." : "Production images must use immutable @sha256:<64-hex-digest> references."
  );

  const artifactRootAbsolute = Boolean(artifactRootSetting) && path.isAbsolute(artifactRootSetting);
  addCheck(
    checks,
    "artifact_root_configured",
    artifactRootAbsolute ? "PASS" : "FAIL",
    artifactRootAbsolute ? "The artifact root is configured as an absolute path." : "CAD_ARTIFACT_ROOT must be an absolute server-side path."
  );

  const workerScriptPath = path.resolve(
    workerScriptSetting || path.join(process.cwd(), "worker/cad/occt/validate_brep.py")
  );
  let artifactRootUsable = false;
  if (artifactRootAbsolute) {
    try {
      const root = await realpath(artifactRootSetting);
      const info = await stat(root);
      await access(root, constants.R_OK | constants.W_OK | constants.X_OK);
      artifactRootUsable = info.isDirectory();
    } catch {
      // Do not expose filesystem paths or raw deployment errors in readiness output.
    }
  }
  addCheck(
    checks,
    "artifact_root_access",
    artifactRootUsable ? "PASS" : "FAIL",
    artifactRootUsable ? "The application can read, write and traverse the configured artifact directory." : "The configured artifact directory must exist and be readable, writable and traversable by the application process."
  );

  let validatorScriptUsable = false;
  try {
    const script = await realpath(workerScriptPath);
    validatorScriptUsable = (await stat(script)).isFile();
  } catch {
    // Keep the diagnostic generic; detailed host paths belong in private operator logs.
  }
  addCheck(
    checks,
    "occt_validator_script",
    validatorScriptUsable ? "PASS" : "FAIL",
    validatorScriptUsable ? "The trusted OCCT validator script exists." : "The configured OCCT validator script is missing or is not a regular file."
  );

  let serviceDb: ReturnType<typeof createServiceRoleClient> | undefined;
  try {
    serviceDb = createServiceRoleClient();
    addCheck(checks, "trusted_database_writer", "PASS", "The server-only Supabase privileged client is configured.");
  } catch {
    addCheck(checks, "trusted_database_writer", "FAIL", "Configure the server-only SUPABASE_SERVICE_ROLE_KEY; never expose it to the browser.");
  }

  if (serviceDb) {
    const [modelsTable, completionsTable, bucket] = await Promise.all([
      serviceDb.from("engineering_cad_models").select("id").limit(1),
      serviceDb.from("engineering_cad_completions").select("id").limit(1),
      serviceDb.storage.getBucket(CAD_ARTIFACT_BUCKET)
    ]);
    addCheck(
      checks,
      "cad_models_table",
      modelsTable.error ? "FAIL" : "PASS",
      modelsTable.error ? "The engineering_cad_models table is unavailable to the server runtime." : "The CAD model table is reachable."
    );
    addCheck(
      checks,
      "cad_completions_table",
      completionsTable.error ? "FAIL" : "PASS",
      completionsTable.error ? "The engineering_cad_completions table is unavailable to the server runtime." : "The durable completion/evidence table is reachable."
    );
    addCheck(
      checks,
      "private_artifact_bucket",
      bucket.error || !bucket.data
        ? "FAIL"
        : bucket.data.public === false ? "PASS" : "FAIL",
      bucket.error || !bucket.data
        ? "The private CAD artifact bucket is missing or inaccessible."
        : bucket.data.public === false ? "The CAD artifact bucket exists and is private." : "The CAD artifact bucket must be private."
    );
  } else {
    addCheck(checks, "cad_models_table", "BLOCKED", "Cannot check schema until the trusted database writer is configured.");
    addCheck(checks, "cad_completions_table", "BLOCKED", "Cannot check schema until the trusted database writer is configured.");
    addCheck(checks, "private_artifact_bucket", "BLOCKED", "Cannot check storage until the trusted database writer is configured.");
  }

  const runtimePrerequisites = imagesConfigured && artifactRootAbsolute && validImageReference(dockerBinary);
  if (!runtimePrerequisites) {
    addCheck(checks, "docker_daemon", "BLOCKED", "Configure the CAD images, absolute artifact root and trusted Docker executable before probing the daemon.");
    addCheck(checks, "build123d_image_available", "BLOCKED", "Image availability cannot be checked until the CAD runtime configuration is complete.");
    addCheck(checks, "occt_image_available", "BLOCKED", "Image availability cannot be checked until the CAD runtime configuration is complete.");
  } else {
    try {
      const serverVersion = await runCommand(dockerBinary, ["info", "--format", "{{.ServerVersion}}"]);
      if (!serverVersion) throw new Error("Docker daemon returned no server version.");
      addCheck(checks, "docker_daemon", "PASS", "The configured Docker executable can reach its daemon.");
      for (const [name, image] of [["build123d_image_available", buildImage], ["occt_image_available", occtImage]] as const) {
        try {
          await runCommand(dockerBinary, ["image", "inspect", "--format", "{{.Id}}", image]);
          addCheck(checks, name, "PASS", "The trusted image is present locally; runtime execution can use --pull=never.");
        } catch {
          addCheck(checks, name, "FAIL", "The configured image is not available to the Docker daemon. Provision the pinned image before enabling CAD execution.");
        }
      }
    } catch {
      addCheck(checks, "docker_daemon", "FAIL", "The Docker executable or daemon is unavailable to this application runtime.");
      addCheck(checks, "build123d_image_available", "BLOCKED", "Image availability cannot be checked without the Docker daemon.");
      addCheck(checks, "occt_image_available", "BLOCKED", "Image availability cannot be checked without the Docker daemon.");
    }
  }

  const ready = checks.every((check) => check.status === "PASS");
  return NextResponse.json(
    {
      projectId,
      ready,
      status: ready ? "READY" : "NOT_READY",
      checkedAt: new Date().toISOString(),
      checks
    },
    { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } }
  );
}
