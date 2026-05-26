# ============================
# Builder stage
# ============================
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --prefer-binary -r requirements.txt

# ============================
# Runtime stage
# ============================
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    libglib2.0-0 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libgdk-pixbuf-xlib-2.0-0\
    libffi-dev \
    fonts-dejavu \
    fonts-liberation \
    fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 appuser

WORKDIR /app

COPY --from=builder /usr/local/lib/python3.11/site-packages \
    /usr/local/lib/python3.11/site-packages

COPY --from=builder /usr/local/bin/gunicorn \
    /usr/local/bin/gunicorn

RUN find /usr/local/lib/python3.11 \
    \( -name "__pycache__" -o -name "*.pyc" -o -name "*.pyo" \) \
    -exec rm -rf {} +

COPY . .

RUN mkdir -p /app/src/staticfiles /app/src/media && \
    chown -R appuser:appuser /app

USER appuser
WORKDIR /app/src

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]

# Workers: 2*CPU+1 is the gunicorn recommendation for CPU-bound work;
# 4 is a safe default that works well on 2-core servers and above.
# Override at runtime with GUNICORN_WORKERS env var if needed.
# gthread worker class lets each worker handle multiple concurrent requests
# via threads, which suits Django's mix of DB I/O and compute work well.
CMD ["gunicorn", "phoenix.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "4", "--worker-class", "gthread", "--threads", "2", "--timeout", "120", "--keepalive", "5", "--max-requests", "1000", "--max-requests-jitter", "50", "--log-level", "info", "--access-logfile", "-", "--error-logfile", "-"]
