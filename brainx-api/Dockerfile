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

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Stage 2: Runtime image
FROM python:3.12-slim AS runner

WORKDIR /app

# Install runtime dependencies (libpq5 for PostgreSQL, curl for healthchecks)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create system user and group (non-root)
RUN groupadd -r brainx && useradd -r -g brainx -d /app -s /sbin/nologin brainx

# Copy python packages from builder
COPY --from=builder /root/.local /home/brainx/.local
ENV PATH=/home/brainx/.local/bin:$PATH
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DJANGO_SETTINGS_MODULE=config.settings.production

# Copy application code
COPY --chown=brainx:brainx . /app

# Ensure entrypoint is executable
RUN chmod +x /app/entrypoint.sh

# Switch to non-root user
USER brainx

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["gunicorn", "config.asgi:application", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000", "--workers", "3", "--access-logfile", "-", "--error-logfile", "-"]
