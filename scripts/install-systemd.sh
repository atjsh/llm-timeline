#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_SRC="${REPO_ROOT}/deploy/systemd/llm-timeline.service"
SERVICE_DST="/etc/systemd/system/llm-timeline.service"
ENV_DIR="/etc/llm-timeline"
ENV_FILE="${ENV_DIR}/llm-timeline.env"
SERVICE_USER_VALUE="${SERVICE_USER:-$(id -un)}"
SERVICE_GROUP_VALUE="${SERVICE_GROUP:-$(id -gn)}"

HOST_VALUE="${HOST:-0.0.0.0}"
PORT_VALUE="${PORT:-3000}"
DATABASE_PATH_VALUE="${DATABASE_PATH:-${REPO_ROOT}/data/timeline.db}"
VM_IP="${VM_IP:-$(hostname -I | awk '{print $1}')}"
API_BASE_VALUE="${API_BASE_URL:-http://${VM_IP}:${PORT_VALUE}}"
BACKFILL_SINCE_VALUE="${BACKFILL_SINCE:-2020-01-01}"
MAX_FETCH_CONCURRENCY_VALUE="${MAX_FETCH_CONCURRENCY:-2}"
REQUEST_TIMEOUT_MS_VALUE="${REQUEST_TIMEOUT_MS:-20000}"
NODE_BIN_VALUE="${NODE_BIN:-$(command -v node)}"
NPM_BIN_VALUE="${NPM_BIN:-$(command -v npm)}"

echo "Installing llm-timeline systemd service ..."
echo "  repo: ${REPO_ROOT}"
echo "  service user: ${SERVICE_USER_VALUE}:${SERVICE_GROUP_VALUE}"
echo "  listen: ${HOST_VALUE}:${PORT_VALUE}"
echo "  api base: ${API_BASE_VALUE}"
echo "  node: ${NODE_BIN_VALUE}"
echo "  npm: ${NPM_BIN_VALUE}"

sudo install -d -m 755 "${ENV_DIR}"
sudo sed \
  -e "s|__REPO_ROOT__|${REPO_ROOT}|g" \
  -e "s|__SERVICE_USER__|${SERVICE_USER_VALUE}|g" \
  -e "s|__SERVICE_GROUP__|${SERVICE_GROUP_VALUE}|g" \
  "${SERVICE_SRC}" > /tmp/llm-timeline.service
sudo mv /tmp/llm-timeline.service "${SERVICE_DST}"
sudo tee "${ENV_FILE}" > /dev/null <<EOF
HOST=${HOST_VALUE}
PORT=${PORT_VALUE}
DATABASE_PATH=${DATABASE_PATH_VALUE}
API_BASE_URL=${API_BASE_VALUE}
BACKFILL_SINCE=${BACKFILL_SINCE_VALUE}
MAX_FETCH_CONCURRENCY=${MAX_FETCH_CONCURRENCY_VALUE}
REQUEST_TIMEOUT_MS=${REQUEST_TIMEOUT_MS_VALUE}
NODE_BIN=${NODE_BIN_VALUE}
NPM_BIN=${NPM_BIN_VALUE}
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now llm-timeline.service
sudo systemctl restart llm-timeline.service

sleep 2
systemctl --no-pager --full status llm-timeline.service | sed -n '1,20p'

echo
echo "Health check:"
curl -fsS "http://127.0.0.1:${PORT_VALUE}/healthz"
echo
