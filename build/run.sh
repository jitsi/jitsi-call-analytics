#!/bin/bash

set -e

echo "Starting Jitsi Call Analytics..."

# Source pre-run script if it exists (for environment-specific setup)
if [ -f /usr/jitsi/pre-run.sh ]; then
    echo "Sourcing pre-run.sh..."
    . /usr/jitsi/pre-run.sh
fi

# Print configuration
echo "Configuration:"
echo "  NODE_ENV: ${NODE_ENV:-production}"
echo "  PORT: ${PORT:-5000}"
echo "  RTCSTATS_DOWNLOADS_PATH: ${RTCSTATS_DOWNLOADS_PATH}"
echo "  RTCSTATS_ENV: ${RTCSTATS_ENV:-prod}"

# Ensure download directories exist
mkdir -p "${RTCSTATS_DOWNLOADS_PATH}/prod"
mkdir -p "${RTCSTATS_DOWNLOADS_PATH}/pilot"
mkdir -p "${RTCSTATS_DOWNLOADS_PATH}/debug"

echo "Starting backend server..."
cd /usr/src/app

# Set NODE_PATH to include backend node_modules so compiled code can find dependencies
export NODE_PATH=/usr/src/app/backend/node_modules:$NODE_PATH

# Start the Node.js backend server (compiled to dist/backend/src/ with rootDir=../)
exec node dist/backend/src/index.js
