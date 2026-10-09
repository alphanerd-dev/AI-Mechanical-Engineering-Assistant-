# V2.1.4 — First reference CAD provider: isolated build123d

## Scope

V2.1.4 adds a host-side adapter for the existing worker/cad/build123d_worker.py JSON stdin/stdout protocol. It does not replace the capability registry or CAD router, and it never executes generated Python inside the Next.js/Node process.

## Deployment prerequisites

Build the image from the repository's pinned runtime definition:

    docker build -t local/ama-build123d:0.13.0 worker/cad/build123d

Use a dedicated absolute host directory for output artifacts. Keep it outside source-controlled paths and provision disk quotas and retention for successful jobs. In production, use an immutable image digest and deploy Docker/OCI access through a trusted server-side execution boundary. Docker daemon access is a privileged host capability and must never be granted to browser clients.

The transport uses the Docker --pull=never option. It will not fetch an image during an engineering request. The image must already exist on the host.

## Example server-side wiring

    import { CapabilityRegistry } from "../capabilities/registry.js";
    import { ENGINEERING_CAPABILITIES } from "../capabilities/catalog.js";
    import { CADCapabilityRouter } from "../cad/routing.js";
    import { createDockerBuild123dCADProvider } from "../providers/build123d-cad.js";

    const registry = new CapabilityRegistry();
    registry.registerCatalog(ENGINEERING_CAPABILITIES);
    const provider = createDockerBuild123dCADProvider({
      image: process.env.BUILD123D_WORKER_IMAGE!,
      artifactRoot: process.env.CAD_ARTIFACT_ROOT!
    });
    registry.register(provider);

    // This decision comes from trusted host configuration and deployment checks.
    const cadRouter = new CADCapabilityRouter(registry, [
      { providerId: "cad.build123d", availability: "AVAILABLE" }
    ]);

Do not mark the provider AVAILABLE unless the image, Docker execution boundary, artifact storage permissions, and operational limits are configured. Production startup should validate all environment configuration and fail closed. The example's non-null assertions are illustrative.

## Execution contract

The provider accepts a server-resolved project id and canonical CAD model identity alongside source, backend, filename, optional parameters, bounded timeout, and optional requirement IDs.

- Source is generated or supplied Python. This adapter does not write CAD source from dimensions or natural-language intent.
- The supported backend is build123d only.
- CAD.CREATE_PART requires a worker manifest containing a solid artifact. Source-only execution is not accepted as part creation.
- CAD.EXECUTE_GENERATED_SOURCE may return source-only output, but this is not a created or verified part.
- Artifacts remain UNVALIDATED until an independent geometry validator issues a provenance-matching validation receipt through the V2.1.3 acceptance contract.

## Runtime controls

The Docker transport passes the request through stdin and invokes Docker with argv rather than a shell. It applies network-none, read-only root filesystem, dropped Linux capabilities, no-new-privileges, CPU/memory/PID/file-descriptor limits, a non-root container UID/GID, and an outer timeout. It caps response sizes, rejects malformed JSON, allocates a unique artifact directory, checks that each worker-reported path resolves to a real file inside that exact directory, deletes failed-run directories, and retains successful-run directories for downstream validation.

## Trust boundary and limitations

The host adapter does not establish that generated source is inherently safe. Isolation depends on a properly configured Docker host and worker image; Docker daemon access is security-sensitive. Artifact roots need access controls, disk quotas, monitoring and retention/deletion policy. The current provenance digest hashes source text, not output-file bytes. Durable artifact-store integration, natural-language/parameter-to-CAD source generation, and a separately deployed OCCT/FreeCAD validation runtime remain separate milestones.
