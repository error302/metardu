FROM python:3.11-slim AS runtime-base

# AUDIT FIX (C9, 2026-07-02): Install RTKLIB for GNSS baseline processing.
# RTKLIB's rnx2rtkp tool processes RINEX files and outputs baseline solutions.
# On Debian/Ubuntu, rtklib is available via apt. If not available, compile
# from source: https://github.com/rtklibexplorer/RTKLIB
RUN apt-get update && apt-get install -y --no-install-recommends \
    rtklib \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py gnss_processor.py rtklib_baseline.py pointcloud_processor.py osm_feature_server.py osm_streaming.py osm_overpass.py spatial_cache.py compute-contract.json ./

# Non-root user for security
RUN groupadd --system --gid 1001 worker && \
    useradd --system --uid 1001 --gid worker worker && \
    chown -R worker:worker /app

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

USER worker
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

# Exercise the actual Linux/Python/dependency artifact before it becomes the
# runtime image. This uses public/synthetic fixtures and creates no service.
# Test tooling and fixture/cache/log files remain in this build stage only.
FROM runtime-base AS acceptance
RUN mkdir -p /tmp/worker-acceptance
COPY --chown=worker:worker tests /tmp/worker-acceptance/tests
COPY --chown=worker:worker native_tests /tmp/worker-acceptance/native_tests
COPY --chown=worker:worker pytest.ini /tmp/worker-acceptance/pytest.ini
RUN python -m venv --system-site-packages /tmp/worker-acceptance/venv && \
    /tmp/worker-acceptance/venv/bin/pip install --no-cache-dir pytest 'httpx>=0.27.0,<1.0'
WORKDIR /tmp/worker-acceptance
ENV PYTHONPATH=/app PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 OSM_PBF_PATH=/tmp/worker-acceptance/unprovisioned.osm.pbf
RUN /tmp/worker-acceptance/venv/bin/python -B -m pytest tests -v && \
    /tmp/worker-acceptance/venv/bin/python -B -m unittest discover -s native_tests -v && \
    printf '%s\n' '{"sourceTests":"passed","nativeBaseline":"passed","fieldAcceptance":false}' > /tmp/worker-acceptance/result.json

FROM runtime-base AS runtime
COPY --from=acceptance /tmp/worker-acceptance/result.json /app/worker-build-acceptance.json
