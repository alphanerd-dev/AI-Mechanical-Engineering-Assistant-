FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PERCEPTION_INPUT_ROOT=/work/input
WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN apt-get update \
    && apt-get install -y --no-install-recommends libegl1 libgl1 libgomp1 libglib2.0-0 libusb-1.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir --disable-pip-version-check -r /app/requirements.txt \
    && groupadd --gid 10001 perception \
    && useradd --uid 10001 --gid perception --no-create-home --shell /usr/sbin/nologin perception \
    && mkdir -p /work/input \
    && chown -R perception:perception /app /work
COPY --chown=perception:perception open3d_worker.py /app/open3d_worker.py
USER 10001:10001
ENTRYPOINT ["python","-I","/app/open3d_worker.py"]
