FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    GARCAR_DB_PATH=/data/garcar-control-plane.sqlite3

WORKDIR /app

RUN pip install --no-cache-dir --upgrade pip \
    && addgroup --system --gid 10001 garcar \
    && adduser --system --uid 10001 --ingroup garcar garcar \
    && mkdir -p /data \
    && chown -R garcar:garcar /app /data

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=garcar:garcar app.py ./app.py
COPY --chown=garcar:garcar console ./console

USER garcar
EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=2)" || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
