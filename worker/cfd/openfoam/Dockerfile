FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl gnupg python3 software-properties-common \
    && curl -fsSL https://dl.openfoam.org/gpg.key -o /etc/apt/trusted.gpg.d/openfoam.asc \
    && add-apt-repository -y http://dl.openfoam.org/ubuntu \
    && apt-get update \
    && apt-get install -y --no-install-recommends openfoam14 \
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
COPY --chown=openfoam:openfoam test_worker.py /app/test_worker.py
COPY --chown=openfoam:openfoam smoke_request.py /app/smoke_request.py

RUN python3 -m unittest -v test_worker

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/tmp/openfoam-home \
    OPENFOAM_ARTIFACT_DIR=/artifacts

USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["python3", "/app/worker.py"]
