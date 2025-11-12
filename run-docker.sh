#!/bin/bash

set -e

# Configuration
CONTAINER_NAME="jitsi-analytics"
IMAGE_NAME="jitsi/call-analytics:latest"
PORT="${PORT:-5000}"

# AWS Credentials - Set these values for testing
# In production, these will be injected via Helm chart
export AWS_ACCESS_KEY_ID="your-access-key-here"
export AWS_SECRET_ACCESS_KEY="your-secret-key-here"
export AWS_REGION="us-west-2"

# RTCStats Configuration
# Note: RTCSTATS_CLI_PATH is set in the Dockerfile, but can be overridden here if needed
export RTCSTATS_DOWNLOADS_PATH="/data/rtcstats-downloads"
export RTCSTATS_ENV="prod"

# Stop and remove existing container if it exists
if docker ps -a | grep -q "$CONTAINER_NAME"; then
    echo "Stopping and removing existing container..."
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    docker rm "$CONTAINER_NAME" 2>/dev/null || true
fi

# Run the container
echo "Starting $CONTAINER_NAME..."
docker run -d \
    --name "$CONTAINER_NAME" \
    -p "$PORT:5000" \
    -e AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
    -e AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
    -e AWS_REGION="$AWS_REGION" \
    -e RTCSTATS_DOWNLOADS_PATH="$RTCSTATS_DOWNLOADS_PATH" \
    -e RTCSTATS_ENV="$RTCSTATS_ENV" \
    "$IMAGE_NAME"

echo ""
echo "Container started successfully!"
echo "  Name: $CONTAINER_NAME"
echo "  Port: http://localhost:$PORT"
echo ""
echo "View logs with: docker logs -f $CONTAINER_NAME"
echo "Stop with: docker stop $CONTAINER_NAME"
echo ""

# Wait a moment and show initial logs
sleep 2
echo "=== Initial logs ==="
docker logs "$CONTAINER_NAME" 2>&1 | tail -15
