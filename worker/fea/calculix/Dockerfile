FROM python:3.12-slim-bookworm

ARG CALCULIX_VERSION=2.20-1
ARG GMSH_VERSION=4.15.2

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
ENV FEA_ARTIFACT_DIR=/artifacts

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       calculix-ccx=${CALCULIX_VERSION} \
       libgl1 \
       libglu1-mesa \
       libxrender1 \
       libxcursor1 \
       libxft2 \
       libxinerama1 \
       libxi6 \
       libfontconfig1 \
       libgomp1 \
    && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --no-cache-dir "gmsh==${GMSH_VERSION}"

RUN useradd --create-home --uid 10002 feaworker

WORKDIR /app
COPY fea/calculix/ /app/
RUN chown -R feaworker:feaworker /app

USER feaworker

ENTRYPOINT ["python","/app/worker.py"]
