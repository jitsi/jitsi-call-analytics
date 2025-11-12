#!/bin/bash

# Pre-run script for environment-specific setup
# This script is sourced before the main application starts
# Use it to inject secrets, configure environment variables, etc.

echo "Pre-run configuration..."

# Example: Load secrets from mounted files
 if [ -f /run/secrets/rtcstats_credentials ]; then
     export RTCSTATS_USERNAME=$(cat /run/secrets/rtcstats_credentials | jq -r '.username')
     export RTCSTATS_PASSWORD=$(cat /run/secrets/rtcstats_credentials | jq -r '.password')
 fi

# Example: Configure AWS credentials for rtcstats-cli S3 access
 if [ -f /run/secrets/aws_credentials ]; then
     export AWS_ACCESS_KEY_ID=$(cat /run/secrets/aws_credentials | jq -r '.access_key')
     export AWS_SECRET_ACCESS_KEY=$(cat /run/secrets/aws_credentials | jq -r '.secret_key')
 fi

# Example: Configure PostgreSQL connection for rtcstats-cli
# if [ -n "$RTCSTATS_DB_HOST" ]; then
#     export PGHOST="$RTCSTATS_DB_HOST"
#     export PGPORT="${RTCSTATS_DB_PORT:-5432}"
#     export PGUSER="$RTCSTATS_DB_USER"
#     export PGPASSWORD="$RTCSTATS_DB_PASSWORD"
#     export PGDATABASE="$RTCSTATS_DB_NAME"
# fi

echo "Pre-run configuration completed"
