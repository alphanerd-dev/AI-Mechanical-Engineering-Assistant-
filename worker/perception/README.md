# Physical Perception worker (V2.2 foundation)

This is an isolated one-shot Open3D worker prototype. It is not wired to a public upload endpoint, project artifact registry, or production routing. Production integration must add authenticated uploads, project-scoped storage, format and malware limits, signed artifact lineage, retention policy, and reviewed acceptance thresholds.

## Contract

- Supported point-cloud formats: PLY, PCD and XYZ.
- Units (mm, cm, m, in) and coordinate-frame IDs are required. Measurement and registration distances are normalized to millimetres.
- Paths are relative to a fixed input root. Absolute paths, traversal and symlink escapes are rejected.
- Files are capped at 256 MiB and 2,000,000 points; requests at 32 KiB; registration iterations at 500.
- Non-finite points, changed input bytes, unsupported formats, unknown schema fields and invalid rigid transforms fail closed.
- Inspect returns measured point count, bounds, centroid and input SHA-256.
- Register uses Open3D point-to-point ICP and returns a CANDIDATE transform, fitness, inlier RMSE, correspondence count, input digests and limitations. It never returns engineering approval or a VERIFIED design.
- Host code must verify exact stored bytes against trusted digests and evaluate candidates with explicit acceptance criteria.

## Build and test

    python -m pip install -r worker/perception/requirements.txt
    python -m unittest worker/perception/test_open3d_worker.py
    docker build -f worker/perception/Dockerfile -t engineering-open3d-perception:0.20.0 worker/perception

Run with a read-only-mounted, dedicated input directory, no network, read-only root filesystem, dropped Linux capabilities, no-new-privileges and CPU/memory/PID limits. Do not mount application source, Docker socket, or project secrets.

## Promotion gate

Use independently measured, noisy and outlier-containing fixtures with known rigid transforms; verify both pass and fail thresholds; check project isolation; and demonstrate that malformed scans cannot produce accepted artifacts. Do not select production thresholds from the synthetic self-registration fixture alone.

## Authenticated source upload intake

The application API creates project-scoped upload intents, returns a short-lived non-upsert signed upload token for direct private Supabase Storage upload, and finalizes only after host-side streaming SHA-256 and bounded PLY/PCD/XYZ header or XYZ-row preflight. Initial limits are 40 MiB per file, 2,000,000 points, five pending uploads per project, and a two-hour token expiry. Metadata is server-only and the bucket is private.

A finalized item remains UPLOADED with PENDING_OPEN3D_INSPECTION; it must not be treated as MEASURED or VERIFIED. The isolated Open3D worker still must inspect the exact bytes and emit measurements before registration or scan-to-CAD review.
