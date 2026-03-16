#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
NPM_BIN="${NPM_BIN:-$(command -v npm)}"
export PATH="$(dirname "${NODE_BIN}"):${PATH}"

cd "${REPO_ROOT}"
"${NPM_BIN}" run build
exec "${NODE_BIN}" dist/index.js
