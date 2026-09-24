#!/bin/bash
# Restaura un dump de pg_dump (el que genera scripts/backup-db.sh) en la base
# AISLADA de test (docker-compose.test.yml, db-test) — nunca toca prod ni la
# base de dev. Pensado para probar un cambio delicado (como el hotfix +
# Flyway de docs/incidents/2026-09-22-mano-de-obra-pricing-mode.md) contra
# datos reales, en local, sin ningún riesgo.
#
# Uso:
#   scripts/restore-backup.sh backups/workshop_db_<fecha>.sql.gz
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")/.."

BACKUP_FILE="${1:?uso: scripts/restore-backup.sh <archivo .sql.gz>}"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "No existe: $BACKUP_FILE" >&2
  exit 1
fi

echo "Levantando db-test..."
docker compose -f docker-compose.test.yml up -d db-test

echo "Esperando a que acepte conexiones..."
until docker compose -f docker-compose.test.yml exec -T db-test pg_isready -U workshop -d workshop_test >/dev/null 2>&1; do
  sleep 1
done

# Por si db-test ya tenía algo cargado (el seed de QA, o una restauración
# anterior) — un dump de pg_dump plano asume un schema vacío.
echo "Vaciando workshop_test antes de restaurar..."
docker compose -f docker-compose.test.yml exec -T db-test psql -U workshop -d workshop_test -c "
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
"

echo "Restaurando $BACKUP_FILE en db-test (workshop_test)..."
gunzip -c "$BACKUP_FILE" | docker compose -f docker-compose.test.yml exec -T db-test psql -U workshop -d workshop_test

echo ""
echo "Listo — db-test tiene datos reales ahora. Para levantar la app sobre esto"
echo "(usando --no-deps para NO disparar seed-test, que pisaría estos datos con"
echo "el dataset sintético de QA):"
echo ""
echo "  docker compose -f docker-compose.test.yml up migrate-test"
echo "  docker compose -f docker-compose.test.yml up -d --no-deps api-test frontend-test"
echo ""
echo "App en http://localhost:4201 (API directo en :3001)."
