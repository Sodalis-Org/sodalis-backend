#!/usr/bin/env bash
# Vérifie que la stack docker-compose complète devient "healthy" en moins de STARTUP_THRESHOLD_S secondes.
set -euo pipefail

cd "$(dirname "$0")/.."

STARTUP_THRESHOLD_S="${STARTUP_THRESHOLD_S:-60}"
POLL_INTERVAL_S=2

echo "Réinitialisation de la stack (docker-compose down -v)..."
docker-compose down -v >/dev/null 2>&1 || true

echo "Démarrage de la stack (docker-compose up -d --build)..."
START_TIME=$(date +%s)
docker-compose up -d --build

CONTAINERS=$(docker-compose ps -q)

while true; do
    NOW=$(date +%s)
    ELAPSED=$((NOW - START_TIME))

    ALL_HEALTHY=true
    for CONTAINER_ID in $CONTAINERS; do
        HAS_HEALTHCHECK=$(docker inspect --format='{{if .State.Health}}yes{{else}}no{{end}}' "$CONTAINER_ID")
        if [ "$HAS_HEALTHCHECK" = "yes" ]; then
            STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_ID")
            if [ "$STATUS" != "healthy" ]; then
                ALL_HEALTHY=false
            fi
        fi
    done

    if [ "$ALL_HEALTHY" = "true" ]; then
        echo "OK — tous les conteneurs sont healthy en ${ELAPSED}s (seuil : ${STARTUP_THRESHOLD_S}s)"
        if [ "$ELAPSED" -ge "$STARTUP_THRESHOLD_S" ]; then
            echo "Échec : ${ELAPSED}s >= seuil de ${STARTUP_THRESHOLD_S}s"
            exit 1
        fi
        exit 0
    fi

    if [ "$ELAPSED" -ge "$STARTUP_THRESHOLD_S" ]; then
        echo "Échec : la stack n'est pas devenue healthy en ${STARTUP_THRESHOLD_S}s"
        docker-compose ps
        exit 1
    fi

    sleep "$POLL_INTERVAL_S"
done
