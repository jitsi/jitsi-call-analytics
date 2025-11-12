#!/bin/bash

set -e

# Set Docker host for Colima
export DOCKER_HOST="unix://${HOME}/.colima/default/docker.sock"

if [ -z "$IMAGE_TAG" ]; then
    echo "no IMAGE_TAG set, using commit sha as default..."
    IMAGE_TAG=$(git rev-parse --short HEAD)
fi

DOCKER_REPO_HOST="${DOCKER_REPO_HOST:-}"
IMAGE_NAME="${IMAGE_NAME:-jitsi/call-analytics}"
PUSH="${PUSH:-false}"

echo "Building Jitsi Call Analytics Docker image..."
echo "  Image: ${DOCKER_REPO_HOST}${IMAGE_NAME}"
echo "  Tag: ${IMAGE_TAG}"
echo "  Push: ${PUSH}"

# Change to project root
cd "$(dirname "$0")/.."
PROJECT_ROOT=$(pwd)

# Check for rtcstats-cli
RTCSTATS_CLI_PATH="../rtcstats-cli"
if [ ! -d "$RTCSTATS_CLI_PATH" ]; then
    echo "ERROR: rtcstats-cli not found at $RTCSTATS_CLI_PATH"
    echo "Please clone rtcstats-cli:"
    echo "  cd $(dirname $PROJECT_ROOT)"
    echo "  git clone https://github.com/jitsi/rtcstats-cli.git"
    exit 1
fi

echo "Found rtcstats-cli at $RTCSTATS_CLI_PATH"

# Build the application locally first
echo "Building application locally..."
npm run build

# Copy rtcstats-cli into build context temporarily
echo "Copying rtcstats-cli into build context..."
rm -rf .rtcstats-cli-build
cp -r "$RTCSTATS_CLI_PATH" .rtcstats-cli-build

# Cleanup function
cleanup() {
    echo "Cleaning up temporary rtcstats-cli copy..."
    rm -rf "$PROJECT_ROOT/.rtcstats-cli-build"
}
trap cleanup EXIT

# Build Docker image
if [ "$PUSH_AWS" = "true" ]; then
    echo "Building and pushing multi-platform image to AWS ECR"
    [ -z "$AWS_REGION" ] && AWS_REGION="us-west-2"
	aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${REGISTRY}
	docker buildx build --no-cache --platform=linux/arm64,linux/amd64 --push --pull --progress=plain \
        --tag ${DOCKER_REPO_HOST}/${IMAGE_NAME}:latest \
        --tag ${DOCKER_REPO_HOST}/${IMAGE_NAME}:${IMAGE_TAG} .
elif [ "$PUSH" = "true" ]; then
    echo "Building and pushing multi-platform image..."
    docker buildx build --no-cache --platform=linux/arm64,linux/amd64 --push --pull --progress=plain \
        --tag ${DOCKER_REPO_HOST}${IMAGE_NAME}:latest \
        --tag ${DOCKER_REPO_HOST}${IMAGE_NAME}:${IMAGE_TAG} .
else
    echo "Building local image for current platform..."
    docker build --no-cache --progress=plain \
        --tag ${IMAGE_NAME}:${IMAGE_TAG} \
        --tag ${IMAGE_NAME}:latest .
fi

echo "Build completed successfully!"
echo "Image: ${DOCKER_REPO_HOST}/${IMAGE_NAME}:${IMAGE_TAG}"
