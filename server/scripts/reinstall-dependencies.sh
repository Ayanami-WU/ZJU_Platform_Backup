#!/bin/bash
set -euo pipefail
echo "========================================"
echo "Starting Auto-Fix for ZJU Server..."
echo "========================================"

# Run from the server root so dependency and PM2 behavior stays unchanged.
cd "$(dirname "$0")/.." || exit 1

# Install the reviewed lockfile. npm ci replaces node_modules itself and fails
# before restarting the application if installation is unsuccessful.
echo "[1/2] Installing locked runtime dependencies..."
npm ci --omit=dev

# 3. Restart Service
echo "[2/2] Restarting application..."
pm2 restart "${PM2_APP_NAME:-zju-server}" --update-env

echo "========================================"
echo "✅ Fix Complete! Server should be running."
echo "========================================"
