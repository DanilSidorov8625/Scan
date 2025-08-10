FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Set Flask app so `flask db upgrade` knows what to run
ENV FLASK_APP=app:create_app

# Entry point script that runs migrations then starts Gunicorn
CMD flask db upgrade && gunicorn -b 0.0.0.0:5000 "app:create_app()"