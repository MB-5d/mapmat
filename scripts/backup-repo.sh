#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_NAME="$(basename "$ROOT_DIR")"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_DIR="${1:-$ROOT_DIR/backups}"
ARCHIVE_PATH="$OUTPUT_DIR/${REPO_NAME}-${TIMESTAMP}.tar.gz"

mkdir -p "$OUTPUT_DIR"

tar \
  --exclude='node_modules' \
  --exclude='frontend/node_modules' \
  --exclude='frontend/build' \
  --exclude='screenshots' \
  --exclude='backups' \
  -czf "$ARCHIVE_PATH" \
  -C "$(dirname "$ROOT_DIR")" \
  "$REPO_NAME"

echo "Backup created: $ARCHIVE_PATH"
