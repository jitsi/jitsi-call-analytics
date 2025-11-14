# Dockerfile for Jitsi Call Analytics
# Expects code to be built locally first (npm run build)

FROM node:20-alpine
ARG TARGETPLATFORM
ARG BUILDPLATFORM

WORKDIR /usr/src/app

# Install runtime dependencies
RUN apk add --no-cache \
    bash \
    curl \
    postgresql-client \
    aws-cli \
    jq \
    tini

# Install backend dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

# Copy backend build (TypeScript compiles with rootDir=../)
COPY backend/dist ./dist

# Copy backend public files to dist
COPY backend/public ./dist/public

# Copy frontend build
COPY frontend/build ./frontend/build

# Copy run scripts
COPY build/run.sh ./
COPY build/pre-run.sh /usr/jitsi/pre-run.sh
RUN chmod +x ./run.sh /usr/jitsi/pre-run.sh

# Create directories for downloads and state
RUN mkdir -p /data/rtcstats-downloads/prod && \
    mkdir -p /data/rtcstats-downloads/pilot && \
    mkdir -p /data/rtcstats-downloads/debug && \
    mkdir -p /data/state

# Set environment variables
ENV NODE_ENV=production \
    RTCSTATS_DOWNLOADS_PATH=/data/rtcstats-downloads \
    PORT=5000

# Expose ports
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Run the application
CMD ["./run.sh"]
