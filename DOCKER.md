# Docker Setup for Jitsi Call Analytics

This guide explains how to build and run Jitsi Call Analytics in Docker containers.

## Prerequisites

- Docker 20.10+ with BuildKit support
- Docker Compose v2.0+
- (Optional) Docker Buildx for multi-platform builds

## Quick Start - Local Testing

### 1. Build the Docker Image

```bash
# Simple local build
docker compose build

# Or use the build script with a specific tag
TAG=dev ./build/build.sh
```

### 2. Configure Environment (Optional)

```bash
# Copy the example environment file
cp .env.docker .env

# Edit .env with your configuration
nano .env
```

### 3. Run with Docker Compose

```bash
# Start the service
docker compose up -d

# View logs
docker compose logs -f call-analytics

# Check health
curl http://localhost:5000/health
```

### 4. Access the Application

- **Backend API**: http://localhost:5000
- **Health Check**: http://localhost:5000/health
- **API Endpoints**: See README.md for full API documentation

### 5. Stop the Service

```bash
# Stop containers
docker compose down

# Stop and remove volumes
docker compose down -v
```

# AWS (for S3 dump downloads)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1

# RTCStats Environment
RTCSTATS_ENV=prod  # or pilot, debug
```

## Advanced Configuration

### Build Arguments

```bash
# Build with custom arguments
docker build \
  --build-arg BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ') \
  --build-arg VCS_REF=$(git rev-parse --short HEAD) \
  -t jitsi/call-analytics:$(git rev-parse --short HEAD) \
  .
```

### Multi-Platform Build

```bash
# Create and use buildx builder
docker buildx create --name multiarch --use

# Build for multiple platforms
TAG=latest PLATFORMS=linux/amd64,linux/arm64 PUSH=false ./build/build.sh

# Push to registry
TAG=v1.0.0 PLATFORMS=linux/amd64,linux/arm64 PUSH=true ./build/build.sh
```

### Custom Pre-Run Configuration

Create custom initialization logic in `build/pre-run.sh`:

```bash
#!/bin/bash

# Example: Load secrets from Docker secrets
if [ -f /run/secrets/rtcstats_credentials ]; then
    export RTCSTATS_USERNAME=$(cat /run/secrets/rtcstats_credentials | jq -r '.username')
    export RTCSTATS_PASSWORD=$(cat /run/secrets/rtcstats_credentials | jq -r '.password')
fi

# Example: Configure AWS from secrets
if [ -f /run/secrets/aws_credentials ]; then
    export AWS_ACCESS_KEY_ID=$(cat /run/secrets/aws_credentials | jq -r '.access_key')
    export AWS_SECRET_ACCESS_KEY=$(cat /run/secrets/aws_credentials | jq -r '.secret_key')
fi
```

Mount secrets in docker-compose.yml:

```yaml
services:
  call-analytics:
    volumes:
      - ./secrets/rtcstats_credentials.json:/run/secrets/rtcstats_credentials:ro
      - ./secrets/aws_credentials.json:/run/secrets/aws_credentials:ro
```

## Volume Persistence

Conference dumps are stored in a Docker volume:

```bash
# List volumes
docker volume ls

# Inspect volume
docker volume inspect jitsi-call-analytics_rtcstats-downloads

# Backup volume
docker run --rm -v jitsi-call-analytics_rtcstats-downloads:/data -v $(pwd):/backup alpine tar czf /backup/rtcstats-downloads-backup.tar.gz /data

# Restore volume
docker run --rm -v jitsi-call-analytics_rtcstats-downloads:/data -v $(pwd):/backup alpine tar xzf /backup/rtcstats-downloads-backup.tar.gz -C /
```

## Testing the Container Locally

### 1. Build and Start

```bash
# Build
docker compose build

# Start in foreground to see logs
docker compose up
```

### 2. Verify Health

```bash
# Wait for container to be healthy
docker compose ps

# Check health endpoint
curl http://localhost:5000/health

# Expected response:
# {"status":"ok","timestamp":"2025-10-08T..."}
```

### 3. Test API Endpoints

```bash
# Test session analysis endpoint
curl http://localhost:5000/api/v1/sessions/analyze/real?testMode=true

# Test RTCStats search (requires rtcstats-cli configured)
curl "http://localhost:5000/api/v1/rtcstats/search?q=test&env=prod"
```

### 4. Inspect Container

```bash
# Shell into container
docker compose exec call-analytics sh

# Check file permissions
ls -la /data/rtcstats-downloads/


```

### 5. Monitor Logs

```bash
# Follow logs
docker compose logs -f

# Filter for specific messages
docker compose logs | grep RTCStats

# Check for errors
docker compose logs | grep ERROR
```

## Troubleshooting

### Container won't start

```bash
# Check logs for errors
docker compose logs call-analytics

# Common issues:
# - Missing build dependencies
# - Port 5000 already in use
# - Volume mount permissions
```


### Download permissions issues

```bash
# Check volume permissions
docker compose exec call-analytics ls -la /data/rtcstats-downloads/

# Fix permissions if needed
docker compose exec call-analytics chown -R node:node /data/rtcstats-downloads/
```

### Cannot connect to PostgreSQL (if using)

```bash
# Test database connection
docker compose exec call-analytics psql -h $RTCSTATS_DB_HOST -U $RTCSTATS_DB_USER -d $RTCSTATS_DB_NAME -c "SELECT 1"

# Check network connectivity
docker compose exec call-analytics ping postgres

# Verify environment variables
docker compose exec call-analytics env | grep DB
```

## Production Deployment

### Using Docker Swarm

```bash
# Convert docker-compose.yml to stack file
docker compose config > stack.yml

# Deploy stack
docker stack deploy -c stack.yml jitsi-call-analytics

# Check services
docker service ls
docker service logs jitsi-call-analytics_call-analytics
```

### Using Kubernetes

See `k8s/` directory for Kubernetes manifests (to be created separately).

### Environment-Specific Configurations

Create separate compose files for different environments:

- `docker-compose.yml` - Base configuration
- `docker-compose.dev.yml` - Development overrides
- `docker-compose.prod.yml` - Production overrides

```bash
# Development
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Security Considerations

1. **Never commit secrets** to version control
2. **Use Docker secrets** or external secret management (Vault, AWS Secrets Manager)
3. **Run as non-root user** (already configured in Dockerfile)
4. **Scan images** for vulnerabilities:

```bash
docker scan jitsi/call-analytics:latest
```

5. **Limit resources** to prevent DoS:

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

## Build Scripts Reference

### build.sh

Builds Docker image with multi-platform support:

```bash
# Build with default settings
./build/build.sh

# Build with custom tag
TAG=v1.0.0 ./build/build.sh

# Build and push to registry
TAG=v1.0.0 PUSH=true ./build/build.sh

# Build for specific platforms
PLATFORMS=linux/amd64 ./build/build.sh

# Custom image name
IMAGE_NAME=mycompany/call-analytics TAG=latest ./build/build.sh
```

### run.sh

Container entrypoint script:
- Sources pre-run.sh for custom configuration
- Creates required directories
- Starts Node.js backend server

### pre-run.sh

Pre-initialization script for:
- Loading secrets from mounted files
- Configuring AWS credentials
- Setting up database connections
- Any custom environment setup

## Monitoring and Observability

### Health Checks

The container includes a health check that runs every 30 seconds:

```bash
# Check container health
docker compose ps

# View health check logs
docker inspect --format='{{json .State.Health}}' jitsi-call-analytics | jq
```

### Logging

Logs are output to stdout/stderr and captured by Docker:

```bash
# View all logs
docker compose logs

# Follow logs
docker compose logs -f

# Last 100 lines
docker compose logs --tail=100

# Since specific time
docker compose logs --since=2025-10-08T10:00:00
```

### Metrics

Consider integrating with Prometheus for metrics collection (future enhancement).

## Next Steps

1. **Test end-to-end**: Download a conference dump and verify analysis
2. **Set up monitoring**: Add Prometheus/Grafana integration
3. **Production deployment**: Deploy to your container orchestration platform
4. **Backup strategy**: Implement regular backups of downloaded dumps

## Support

For issues and questions:
- Check troubleshooting section above
- Review logs: `docker compose logs -f`
- Inspect container: `docker compose exec call-analytics sh`
- Refer to main README.md for application documentation
