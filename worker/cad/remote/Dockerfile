FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    WORKER_HOST=0.0.0.0 \
    PORT=10000

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 cadworker

RUN python -m pip install --no-cache-dir "build123d==0.13.0"

WORKDIR /opt/cad-worker
COPY worker/cad/remote/service.py /opt/cad-worker/service.py
COPY worker/cad/remote/execute_cad.py /opt/cad-worker/execute_cad.py
COPY worker/cad/occt/validate_brep.py /opt/cad-worker/validate_brep.py

RUN chown -R cadworker:cadworker /opt/cad-worker

USER cadworker
EXPOSE 10000
CMD ["python", "/opt/cad-worker/service.py"]
