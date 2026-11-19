# ==============================================================================
# BrainX API - Production Multi-Stage Dockerfile
# Base: python:3.12-slim
# Server: ASGI Gunicorn with Uvicorn workers (port 8000)
# ==============================================================================

# Stage 1: Build dependencies & wheels
FROM python:3.12-slim AS builder

WORKDIR /app

# Install compilation tools for binary extensions (psycopg, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment for clean multi-stage artifact extraction
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Stage 2: Runtime image
FROM python:3.12-slim AS runner

WORKDIR /app

# Install runtime dependencies (libpq5 for PostgreSQL, curl for healthchecks)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy virtual environment from builder (universal PATH resolution)
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DJANGO_SETTINGS_MODULE=config.settings.production

# Create system user and group (non-root)
RUN groupadd -r brainx && useradd -r -g brainx -d /app -s /sbin/nologin brainx

# Copy application code
COPY --chown=brainx:brainx . /app

# Ensure staticfiles/media directories exist with non-root ownership
RUN mkdir -p /app/staticfiles /app/media && \
    chown -R brainx:brainx /app && \
    chmod +x /app/entrypoint.sh

# Switch to non-root user
USER brainx

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["gunicorn", "config.asgi:application", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000", "--workers", "3", "--access-logfile", "-", "--error-logfile", "-"]
