FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

# Non-root user for security
RUN groupadd --system --gid 1001 worker && \
    useradd --system --uid 1001 --gid worker worker && \
    chown -R worker:worker /app

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

USER worker
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
