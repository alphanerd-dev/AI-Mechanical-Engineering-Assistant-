FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /worker
RUN addgroup --system worker && adduser --system --ingroup worker worker
COPY worker.py /worker/worker.py
RUN chown -R worker:worker /worker

USER worker
ENTRYPOINT ["python", "/worker/worker.py"]
