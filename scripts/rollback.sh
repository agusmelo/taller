#!/bin/bash
# Reverts api/frontend/migrate to the last tag that was live before the most
# recent `deploy.sh` run. Does NOT undo database migrations — those are
# forward-only, so a rollback that depends on a schema change being reverted
# needs a manual fix, not this script.

set -e

cd /home/pi/workshop

if [ ! -f .last-good-tag ]; then
  echo "No .last-good-tag found — nothing to roll back to (need at least two deploys)." >&2
  exit 1
fi

IMAGE_TAG="$(cat .last-good-tag)"
export IMAGE_TAG

echo "Rolling back to tag: $IMAGE_TAG"

docker compose pull
docker compose stop api frontend
docker compose up -d api frontend

echo "$IMAGE_TAG" > .deployed-tag

echo "Rolled back to $IMAGE_TAG."
