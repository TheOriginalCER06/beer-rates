FROM python:3.15-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    MEDIA_ROOT=/app/media

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
# /app/media is the photo volume; created here so a new volume gets the app user as owner.
RUN DJANGO_DEBUG=true python manage.py collectstatic --noinput \
    && chmod +x entrypoint.sh \
    && useradd --system --create-home app \
    && mkdir -p /app/media \
    && chown app:app /app/media
USER app

EXPOSE 8000
ENTRYPOINT ["./entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60", "--access-logfile", "-"]
