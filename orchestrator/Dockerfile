FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8001 \
    GARCAR_EVENT_DB_PATH=/data/garcar-events.sqlite3

WORKDIR /app

RUN addgroup --system --gid 10002 garcar \
    && adduser --system --uid 10002 --ingroup garcar garcar \
    && mkdir -p /data /app/backups \
    && chown -R garcar:garcar /app /data

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY --chown=garcar:garcar . .

USER garcar
EXPOSE 8001
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=2)" || exit 1

CMD ["python", "main.py"]
