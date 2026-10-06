FROM python:3.12-slim

ARG BUILD123D_VERSION=0.13.0

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 \
    && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --no-cache-dir "build123d==${BUILD123D_VERSION}" \
    && useradd --create-home --uid 10001 cadworker

COPY build123d_worker.py /opt/cad-worker/build123d_worker.py

USER cadworker
WORKDIR /artifacts

ENTRYPOINT ["python","/opt/cad-worker/build123d_worker.py"]
