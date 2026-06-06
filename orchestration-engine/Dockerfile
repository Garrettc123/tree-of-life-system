FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app

# Copy orchestration-engine deps
COPY orchestration-engine/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /app/requirements.txt

# Copy full repo so root orchestrator is accessible
COPY . /app

EXPOSE 8000

CMD ["python", "orchestration-engine/main.py"]
