# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Jitsi Call Analytics is a next-generation analytics platform for Jitsi Meet that integrates multiple data sources to provide unified timeline visualizations and detailed participant analytics. The system processes RTCStats dumps, conference logs, and console logs to reconstruct complete call sessions with quality metrics.

## Monorepo Structure (npm workspaces)

- **backend/**: Node.js/Express API server with native AWS Redshift/S3 integration (see `backend/CLAUDE.md`)
- **frontend/**: React/Material-UI dashboard application (see `frontend/CLAUDE.md`)
- **shared/**: TypeScript types and interfaces used across backend/frontend

## Architecture Overview

### Data Flow
1. **Metadata Query**: RTCStatsDataService queries AWS DynamoDB (or Redshift) for conference metadata
2. **Environment Selection**: System selects appropriate DynamoDB table and S3 bucket based on environment (pilot/prod)
3. **Dump Download**: S3DumpService downloads conference dumps → stored in `rtcstats-downloads/<environment>/<conferenceId>/`
4. **Console Log Extraction**: Automatically extracts `.txt` console log files from NDJSON dumps using `jq`
5. **Dump Processing**: DumpProcessor parses NDJSON entries with component metadata from DynamoDB
6. **Session Correlation**: EventCorrelationEngine merges participants across sessions → builds unified timeline
7. **API Response**: REST API serves processed data → Frontend visualizes in interactive timeline

### Key Services
- **RTCStatsDataService**: Unified interface for AWS DynamoDB or Redshift metadata queries
  - Primary: DynamoDB with environment-specific tables (separate tables for pilot and prod)
  - Optional: Redshift Data API for legacy support
- **DynamoDBMetadataService**: Fast metadata queries using Global Secondary Indexes
  - Supports environment-specific table selection
  - Uses IAM authentication (IRSA) - no hardcoded credentials
- **S3DumpService**: Direct S3 integration with environment-specific buckets
  - Downloads from pilot or prod S3 buckets based on environment selection
  - Automatic gunzip decompression and console log extraction
- **DumpProcessor**: Parses NDJSON dump files with DynamoDB component metadata integration
  - Identifies participants vs backend components (JVB, Jicofo)
  - Supports multiple client types (Jitsi Meet, 8x8 Work, etc.)
- **RTCStatsService**: Orchestrates RTCStats operations
  - Manages environment-specific S3DumpService instances
  - Coordinates metadata queries with dump downloads
- **EventCorrelationEngine**: Correlates events across multiple data sources and participants
- **SessionManager**: Maintains session state and WebSocket connections

### API Architecture
- All primary endpoints under `/api/v1/*` with standardized response format
- Visualization endpoints at `/api/visualization/*` (outside v1 for rtc-visualizer compatibility)
- Response middleware provides consistent `{ success, data, timestamp }` structure

## Code Style

All code must adhere to the following style guidelines:

- **ESLint Configuration**: Follow `@jitsi/eslint-config` rules (enforced via `npm run lint`)
- **TypeScript Member Ordering**: Class members must be ordered consistently (enforced by `typescript-sort-keys` plugin)
- **Object Key Sorting**: Sort object keys in ascending order where applicable
- **Indentation**: Use 4-space indentation consistently across all files
- **JSDoc Comments**: Required for all public functions, classes, and interfaces

**Example:**
```typescript
/**
 * Processes conference dump files and extracts participant data.
 *
 * @param {string} dumpPath - Path to the dump file
 * @param {object} options - Processing options
 * @returns {Promise<CallSession>} Processed session data
 */
async function processDump(dumpPath: string, options: object): Promise<CallSession> {
    const config = {
        enableLogs: true,
        enableStats: true,
        maxParticipants: 100
    };
    // Implementation
}
```

Run `npm run lint:fix` to automatically fix style issues before committing.

## Development Commands

### Initial Setup
```bash
# Install all workspace dependencies
npm install
```

### Development Mode
```bash
# Run both backend and frontend concurrently
npm run dev

# Backend only
npm run dev:backend

# Frontend only
npm run dev:frontend
```

### Building
```bash
# Build both workspaces
npm run build

# Build specific workspace
npm run build:backend
npm run build:frontend
```

### Testing
```bash
# Run all tests
npm test

# Test specific workspace
npm run test:backend
npm run test:frontend
```

### Linting
```bash
# Lint entire project
npm run lint

# Lint and auto-fix
npm run lint:fix

# Per-workspace
npm run lint:backend
npm run lint:frontend
```

## Shared Types (shared/types.ts)

### Core Types
- **CallSession**: Complete session with participants, events, metrics
- **ParticipantDetails**: Full participant info including clientInfo, jitsiClient, connection, qualityMetrics
- **EnhancedCallEvent**: Timeline event with participant context
- **DumpEventType**: Enum of all dump file event types (identity, connectionInfo, stats, logs, etc.)

### Key Interfaces
- **IRTCStatsEntry**: Raw dump file entry format (5-element array)
- **IConnectionInfo**: User agent and session metadata
- **IIdentityInfo**: Participant/component identification

## Docker Deployment

See `DOCKER.md` for comprehensive Docker setup:

```bash
# Build
docker compose build

# Run
docker compose up -d

# Health check
curl http://localhost:5000/health
```

## Git Workflow

Standard workflow for this repository:
```bash
git add .
git commit -m "Description"
git push
```

## Important Implementation Details

### Environment Handling
- **DynamoDB Tables**: Use environment-specific tables (`pilotRtcstatsMeta`, `prodRtcstatsMeta`)
- **S3 Buckets**: Use environment-specific buckets (`rtcstats-dumps-pilot`, `rtcstats-dumps-prod`)
- **Environment Parameter**: Pass through entire stack from frontend → backend → services
- All metadata and download operations respect the selected environment

### Client Type Detection
- **Participants**: Identified by excluding backend components (any app type NOT 'JVB' or 'Jicofo')
- **Supported Clients**: 'Jitsi Meet', '8x8 Work', and other Jitsi-based clients
- **Backend Components**: 'JVB' and 'Jicofo' explicitly identified
- Uses `isClientApp()` helper method for flexible client detection

### Console Log Processing
- **Extraction**: Automatic `.txt` file creation from NDJSON using `jq` during download
- **Location**: `rtcstats-downloads/<env>/<conferenceId>/<sessionId>.txt`
- **Command**: `cat file.json | jq -r '. | select(.[0] == "logs") | .[2][] | .text' > file.txt`
- **Integration**: `_getSessionConsoleLogs()` reads extracted `.txt` files

### Download Workflow
1. User selects environment (pilot/prod) in frontend
2. Backend queries appropriate DynamoDB table for metadata
3. Retrieves `dumpId` list from DynamoDB (includes `.gz` extension)
4. Downloads dumps from environment-specific S3 bucket
5. Decompresses `.gz` → `.json` files using gunzip
6. Extracts console logs `.json` → `.txt` files using jq
7. DumpProcessor analyzes `.json` files, logs read from `.txt` files

### Nodemon Configuration
- **Purpose**: Prevents server restarts during downloads
- **Ignored**: `rtcstats-downloads/**` directory to avoid hot-reload interruptions
- **Location**: `backend/nodemon.json`

## Workspace-Specific Documentation

For detailed information about each workspace:
- **Backend development**: See `backend/CLAUDE.md`
- **Frontend development**: See `frontend/CLAUDE.md`
