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

# Build the application locally first
echo "Building application locally..."
npm run build

# Build Docker image
if [ "$PUSH_AWS" = "true" ]; then
    echo "Building and pushing multi-platform image to AWS ECR"
    [ -z "$AWS_REGION" ] && AWS_REGION="us-west-2"
	aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${DOCKER_REPO_HOST}
	docker buildx build --no-cache --platform=linux/arm64,linux/amd64 --push --pull --progress=plain \
        --tag ${DOCKER_REPO_HOST}/${IMAGE_NAME}:latest \
        --tag ${DOCKER_REPO_HOST}/${IMAGE_NAME}:${IMAGE_TAG} .
elif [ "$PUSH" = "true" ]; then
    echo "Building and pushing multi-platform image..."
    docker buildx build --no-cache --platform=linux/arm64,linux/amd64 --push --pull --progress=plain \
        --tag ${DOCKER_REPO_HOST}/${IMAGE_NAME}:latest \
        --tag ${DOCKER_REPO_HOST}/${IMAGE_NAME}:${IMAGE_TAG} .
else
    echo "Building local image for current platform..."
    docker build --no-cache --progress=plain \
        --tag ${IMAGE_NAME}:${IMAGE_TAG} \
        --tag ${IMAGE_NAME}:latest .
fi

echo "Build completed successfully!"
echo "Image: ${DOCKER_REPO_HOST}/${IMAGE_NAME}:${IMAGE_TAG}"
