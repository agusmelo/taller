#!/bin/bash

set -e

cd /home/pi/workshop

# Tag to deploy: explicit arg > current git commit (matches what CI built on
# the push that produced this checkout) > "latest" as last resort. Pinning to
# a real tag (instead of always chasing :latest) is what makes rollback.sh
# possible — you can't roll back to "whatever :latest happens to point to".
IMAGE_TAG="${1:-$(git rev-parse HEAD 2>/dev/null || echo latest)}"
export IMAGE_TAG

echo "Deploying tag: $IMAGE_TAG"

# Remember what's currently live before we overwrite it, so rollback.sh has
# something concrete to go back to.
if [ -f .deployed-tag ]; then
  cp .deployed-tag .last-good-tag
fi

echo "Pulling images (tag: $IMAGE_TAG)..."
docker compose pull

echo "Stopping api/frontend..."
docker compose stop api frontend

echo "Running migrations..."
docker compose run --rm migrate

echo "Starting services..."
docker compose up -d api frontend

echo "$IMAGE_TAG" > .deployed-tag

echo "Cleaning old images..."
docker image prune -f

echo "Deployed $IMAGE_TAG. Previous tag saved in .last-good-tag (use scripts/rollback.sh to revert)."
echo "NOTE: rollback only reverts the app images, not the database schema — migrations are forward-only."
