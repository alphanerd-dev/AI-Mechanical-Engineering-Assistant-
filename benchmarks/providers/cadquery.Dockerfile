FROM python:3.12-slim

ARG CADQUERY_VERSION=2.8.0
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libxrender1 libxext6 \
    && rm -rf /var/lib/apt/lists/* \
    && python -m pip install --no-cache-dir "cadquery==${CADQUERY_VERSION}" \
    && useradd --create-home --uid 10001 benchmark

USER benchmark
WORKDIR /artifacts
