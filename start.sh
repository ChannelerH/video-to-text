#!/usr/bin/env bash
set -euo pipefail

NODE_CMD="node server.js"
WORKER_CMD="node ./scripts/queue-worker.mjs"

QUEUE_ENABLED="${QUEUE_WORKER_ENABLED:-true}"
QUEUE_ENABLED_LOWER="${QUEUE_ENABLED,,}"
if [[ "$QUEUE_ENABLED_LOWER" == "false" || "$QUEUE_ENABLED_LOWER" == "0" || "$QUEUE_ENABLED_LOWER" == "no" ]]; then
  QUEUE_SHOULD_RUN=false
else
  QUEUE_SHOULD_RUN=true
fi

log() {
  echo "[Entrypoint] $*"
}

log "Starting Next.js server..."
$NODE_CMD &
SERVER_PID=$!
log "Next.js server PID: $SERVER_PID"

if $QUEUE_SHOULD_RUN; then
  log "Starting queue worker..."
  $WORKER_CMD &
  WORKER_PID=$!
  log "Queue worker PID: $WORKER_PID"
else
  log "Queue worker disabled via QUEUE_WORKER_ENABLED=$QUEUE_ENABLED"
  WORKER_PID=""
fi

cleanup() {
  log "Shutting down..."
  if kill -0 $SERVER_PID 2>/dev/null; then
    log "Stopping server (PID $SERVER_PID)"
    kill $SERVER_PID 2>/dev/null || true
  fi
  if [[ -n "$WORKER_PID" ]] && kill -0 $WORKER_PID 2>/dev/null; then
    log "Stopping worker (PID $WORKER_PID)"
    kill $WORKER_PID 2>/dev/null || true
  fi
}

trap 'cleanup; wait || true; exit 0' SIGINT SIGTERM

if [[ -n "$WORKER_PID" ]]; then
  set +e
  wait -n $SERVER_PID $WORKER_PID
  EXIT_CODE=$?
  set -e
  log "Process exited with code $EXIT_CODE"
  cleanup
  wait || true
  exit $EXIT_CODE
else
  set +e
  wait $SERVER_PID
  EXIT_CODE=$?
  set -e
  log "Server exited with code $EXIT_CODE"
  cleanup
  exit $EXIT_CODE
fi
