FROM node:22-bookworm-slim AS ca-certs

FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive

# The official Ubuntu base image does not include a CA bundle. Seed it from
# the Node slim build stage before switching Ubuntu APT sources to HTTPS.
COPY --from=ca-certs /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

# Prefer HTTPS for Ubuntu mirrors and retry transient package-index/package-download failures.
RUN sed -i \
      -e 's|http://archive.ubuntu.com/ubuntu|https://archive.ubuntu.com/ubuntu|g' \
      -e 's|http://security.ubuntu.com/ubuntu|https://security.ubuntu.com/ubuntu|g' \
      /etc/apt/sources.list.d/ubuntu.sources \
    && apt-get update -o Acquire::Retries=5 -o Acquire::https::Timeout=30 \
    && apt-get install -y --no-install-recommends -o Acquire::Retries=5 -o Acquire::https::Timeout=30 ca-certificates curl gnupg python3 software-properties-common \
    && curl --retry 5 --retry-all-errors --connect-timeout 20 -fsSL https://dl.openfoam.org/gpg.key -o /etc/apt/trusted.gpg.d/openfoam.asc \
    && add-apt-repository -y https://dl.openfoam.org/ubuntu \
    && apt-get update -o Acquire::Retries=5 -o Acquire::https::Timeout=30 \
    && apt-get install -y --no-install-recommends -o Acquire::Retries=5 -o Acquire::https::Timeout=30 openfoam14 \
    && mkdir -p /licenses \
    && cp /usr/share/doc/openfoam14/copyright /licenses/OPENFOAM-COPYRIGHT \
    && rm -rf /var/lib/apt/lists/*

RUN printf '%s\n' \
    '#!/usr/bin/env bash' \
    'set -eo pipefail' \
    'source /opt/openfoam14/etc/bashrc' \
    'if [[ "${1:-}" == "--version" ]]; then foamVersion 2>&1; exit 0; fi' \
    'exec "$@"' \
    > /usr/local/bin/foam-env \
    && chmod 0755 /usr/local/bin/foam-env \
    && /usr/local/bin/foam-env --version | grep -q "OpenFOAM-14"

RUN groupadd --system --gid 10001 openfoam \
    && useradd --system --uid 10001 --gid openfoam --home-dir /home/openfoam --create-home openfoam \
    && mkdir -p /app /artifacts /tmp/openfoam14 \
    && chown -R openfoam:openfoam /app /artifacts /tmp/openfoam14

WORKDIR /app
COPY --chown=openfoam:openfoam worker.py /app/worker.py
COPY --chown=openfoam:openfoam errors.py manifest.py case_builder.py solver.py artifacts.py /app/
COPY --chown=openfoam:openfoam run_case.py service.py /app/
COPY --chown=openfoam:openfoam test_worker.py test_service.py /app/
COPY --chown=openfoam:openfoam smoke_request.py smoke_async_service.py /app/

RUN python3 -m unittest -v test_worker test_service

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/tmp/openfoam-home \
    OPENFOAM_ARTIFACT_DIR=/artifacts \
    WORKER_HOST=0.0.0.0 \
    WORKER_PORT=8091
USER 10001:10001
EXPOSE 8091
ENTRYPOINT ["python3", "/app/service.py"]
