#!/bin/bash

set -e

cd /home/pi/workshop

echo "Pulling latest images..."
docker compose pull

echo "Stopping api/frontend..."
docker compose stop api frontend

echo "Running migrations..."
docker compose run --rm migrate

echo "Starting services..."
docker compose up -d api frontend

echo "Cleaning old images..."
docker image prune -f