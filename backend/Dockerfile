FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY requirements.txt .


# Install the verified CPU-only PyTorch version
RUN pip install --no-cache-dir "torch==2.14.1+cpu" --index-url https://download.pytorch.org/whl/cpu

# Install remaining backend dependencies
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
COPY notebooks/retrieval_evaluation_data.json ./notebooks/retrieval_evaluation_data.json

# Create a dedicated non-root application user
RUN groupadd --system appgroup && \
    useradd --system --gid appgroup --home-dir /app appuser && \
    mkdir -p /app/.cache && \
    chown -R appuser:appgroup /app

# Store downloaded model files in a writable location
ENV HF_HOME=/app/.cache/huggingface

# Run FastAPI without root privileges
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]