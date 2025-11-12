# Backend CLAUDE.md

This file provides guidance for working with the backend workspace of Jitsi Call Analytics.

## Backend Architecture

### Service Layer
- **DumpProcessor** (`src/services/DumpProcessor.ts`): Core service that parses NDJSON dump files
- **RTCStatsDataService** (`src/services/RTCStatsDataService.ts`): Direct AWS Redshift integration for conference queries
- **S3DumpService** (`src/services/S3DumpService.ts`): Direct AWS S3 integration for downloading conference dumps
- **RTCStatsService** (`src/services/RTCStatsService.ts`): Orchestrates RTCStats operations using native services
- **EventCorrelationEngine** (`src/services/EventCorrelationEngine.ts`): Correlates events across sources
- **SessionManager** (`src/services/SessionManager.ts`): Maintains session state

### Route Handlers
All routes in `src/routes/`:
- `sessions_analyze.ts`: Session analysis endpoints
- `participants.ts`: Participant data endpoints
- `rtcstats.ts`: RTCStats integration endpoints
- `visualization.ts`: RTC visualizer compatibility endpoints
- `uploads.ts`: File upload handling

### Middleware
- **apiResponse** (`src/middleware/apiResponse.ts`): Standardized response format middleware
  - Adds `res.apiSuccess(data, pagination?)` method
  - Adds `res.apiError(code, message, details?)` method
  - Provides consistent response structure across all endpoints

## Development Commands

```bash
# From backend directory
cd backend

# Development with hot reload (nodemon + tsx)
npm run dev

# Build TypeScript
npm run build

# Start production server
npm start

# Run tests
npm test                    # All tests
npm run test:watch         # Watch mode
npm test -- DumpProcessor  # Specific test file
npm test -- --testPathPattern=routes  # Route tests only

# Linting
npm run lint
npm run lint:fix
```

## Environment Configuration

Copy `.env.example` to `.env` and configure:

### Required Configuration
```bash
# Server
PORT=5000
FRONTEND_URL=http://localhost:3000

# RTCStats DynamoDB (Recommended)
RTCSTATS_USE_DYNAMODB=true
RTCSTATS_DYNAMODB_TABLE_PILOT=your-pilot-table-name
RTCSTATS_DYNAMODB_TABLE_PROD=your-prod-table-name

# RTCStats S3 (Environment-specific buckets)
AWS_ACCESS_KEY_ID=AKIA...  # Optional - uses IRSA in Kubernetes
AWS_SECRET_ACCESS_KEY=...  # Optional - uses IRSA in Kubernetes
AWS_REGION=us-east-1
RTCSTATS_S3_BUCKET_PILOT=your-pilot-bucket-name
RTCSTATS_S3_BUCKET_PROD=your-prod-bucket-name

# RTCStats Redshift (Optional - only if RTCSTATS_USE_DYNAMODB=false)
RTCSTATS_REDSHIFT_CLUSTER_ID=your-cluster-id
RTCSTATS_REDSHIFT_DATABASE=rtcstats

# RTCStats General
RTCSTATS_ENV=prod  # or pilot
RTCSTATS_DOWNLOADS_PATH=./rtcstats-downloads

# Logging (set to 'debug' for verbose output)
LOG_LEVEL=info
```

## RTCStats Native Integration

The backend uses **native TypeScript/Node.js integration** with AWS Redshift Data API and S3 for RTCStats data access.

### Architecture

```
Backend → RTCStatsDataService → RedshiftDataAPIService → AWS Redshift Data API (metadata queries)
Backend → S3DumpService → AWS SDK S3 Client → S3 (dump downloads)
```

**Benefits**:
- ✅ Pure TypeScript, no shell scripts or external binaries
- ✅ IAM authentication via IRSA (Kubernetes) - no passwords needed
- ✅ Direct AWS SDK integration (2-3x faster)
- ✅ Type-safe interfaces
- ✅ Better error handling and debugging
- ✅ Stateless Redshift queries (no connection pools to manage)
- ✅ Automatic retry and scaling via Data API

### RTCStatsDataService

Direct integration with AWS Redshift Data API for conference metadata queries. Uses IAM authentication (no passwords).

**Methods**:
```typescript
// Search conferences by URL
await dataService.searchConferences('meet.jit.si/myroom');

// Get conference details
await dataService.getConferenceById(conferenceId);

// List participants
await dataService.listParticipants(conferenceId);

// List servers (JVBs)
await dataService.listServers(conferenceId);

// Trace participant across conferences
await dataService.traceParticipant('John Doe');
```

**Replaces legacy rtcstats-cli commands**:
- `rtcstats.sh list-conferences` → `searchConferences()`
- `rtcstats.sh list-participants` → `listParticipants()`
- `rtcstats.sh list-servers` → `listServers()`
- `rtcstats.sh trace-participant` → `traceParticipant()`

### S3DumpService

Direct S3 integration for downloading conference dumps.

**Methods**:
```typescript
// List dumps for conference
await s3Service.listConferenceDumps(conferenceId, 'prod/');

// Download all dumps with progress tracking
await s3Service.downloadConferenceDumps(
    conferenceId,
    './downloads',
    'prod/',
    (progress) => {
        console.log(`${progress.filesCompleted}/${progress.totalFiles}`);
    }
);

// Download single session
await s3Service.downloadSessionDump(sessionId, conferenceId, './downloads');

// Stream dump without downloading
const stream = await s3Service.getFileStream(key);
```

**Replaces legacy rtcstats-cli commands**:
- `rtcstats.sh download-conference-dumps` → `downloadConferenceDumps()`
- `rtcstats.sh download-session-dump` → `downloadSessionDump()`

### Setup

1. **Install dependencies**:
```bash
npm install
```

This will install:
- `@aws-sdk/client-redshift-data` - Redshift Data API client
- `@aws-sdk/client-s3` - S3 client

2. **Configure environment** in `.env`:

**For Kubernetes with IRSA** (recommended):
```bash
# AWS Configuration
AWS_REGION=us-east-1
# Leave credentials empty - will use IAM roles

# DynamoDB (Recommended)
RTCSTATS_USE_DYNAMODB=true
RTCSTATS_DYNAMODB_TABLE_PILOT=your-pilot-table-name
RTCSTATS_DYNAMODB_TABLE_PROD=your-prod-table-name

# S3 (Environment-specific buckets)
RTCSTATS_S3_BUCKET_PILOT=your-pilot-bucket-name
RTCSTATS_S3_BUCKET_PROD=your-prod-bucket-name
```

**For local development**:
```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key_here
AWS_SECRET_ACCESS_KEY=your_secret_here

# DynamoDB (Recommended)
RTCSTATS_USE_DYNAMODB=true
RTCSTATS_DYNAMODB_TABLE_PILOT=your-pilot-table-name
RTCSTATS_DYNAMODB_TABLE_PROD=your-prod-table-name

# S3 (Environment-specific buckets)
RTCSTATS_S3_BUCKET_PILOT=your-pilot-bucket-name
RTCSTATS_S3_BUCKET_PROD=your-prod-bucket-name
```

3. **Test connection**:
```typescript
import { RTCStatsDataService } from './services/RTCStatsDataService';
import { rtcstatsConfig } from './config/rtcstats';

const dataService = new RTCStatsDataService(rtcstatsConfig.redshift);

// Test connection (lightweight query)
await dataService.connect();
console.log('Connected to Redshift Data API');

// Search conferences
const conferences = await dataService.searchConferences('meet.jit.si');
console.log('Found conferences:', conferences.length);

await dataService.disconnect();
```

### Usage Examples

```bash
# Search conferences
curl "http://localhost:5000/api/v1/rtcstats/search?q=meet.jit.si/myroom&env=prod"

# Download conference dumps
curl -X POST http://localhost:5000/api/v1/rtcstats/download/<conference-id> \
  -H "Content-Type: application/json" \
  -d '{"environment": "prod"}'

# Check download status
curl http://localhost:5000/api/v1/rtcstats/download/<conference-id>/status
```

## Working with Dump Files

### NDJSON Format

Jitsi components output newline-delimited JSON files. Each line is a JSON array:
```javascript
[eventType, connectionId, eventData, timestamp, sequence]
```

### Key Event Types (DumpEventType enum in shared/types.ts)
- `identity`: Participant/component identification (endpointId, displayName, conferenceId)
- `connectionInfo`: User agent, client type, session metadata
- `stats`: WebRTC getStats() output
- `logs`: Console logs from browser/client
- `videoMutedChanged`, `audioMutedChanged`: Media state events
- `screenshareToggled`: Screen sharing events
- `close`: Session end

### DumpProcessor Logic

**Single Dump Processing** (`processDump`):
- Reads NDJSON file line-by-line
- Parses each event array
- Extracts identity, connection info, stats, logs
- Returns single session data

**Directory Processing** (`processConferenceDumps`):
- Scans directory for all `.ndjson` files
- Processes each dump as separate session
- Merges participants across sessions by display name
- Correlates events into unified timeline

**Participant Merging**:
- Participants who rejoin get new endpointId → merged by displayName
- Tracks all endpointIds in `endpointIds[]` array (for console log lookup)
- Maintains `sessionMap: Map<sessionUUID, endpointId>` for per-session data access

### User Agent Parsing
Uses `ua-parser-js` to extract browser, OS, device info from userAgent strings. Handles edge cases for Jitsi Electron and mobile apps.

## API Endpoint Development

### Adding a New Endpoint

1. Create route handler in `src/routes/`:
```typescript
import { Router, Request, Response } from 'express';

const router = Router();

router.get('/endpoint', async (req: Request, res: Response) => {
    try {
        const data = await service.getData();
        res.apiSuccess(data);
    } catch (error) {
        res.apiError('FETCH_ERROR', 'Failed to fetch', { error });
    }
});

export default router;
```

2. Register route in `src/index.ts`:
```typescript
import newRouter from './routes/newRoute';
app.use('/api/v1/new', newRouter);
```

3. Add integration test in `test/`:
```typescript
describe('New Endpoint', () => {
    it('should return data', async () => {
        const response = await request(app).get('/api/v1/new/endpoint');
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    });
});
```

### API Response Middleware

All `/api/v1/*` endpoints use standardized response format:

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "pagination": { "page": 1, "limit": 10, "total": 100, "totalPages": 10 },
  "timestamp": "2025-10-02T12:34:56.789Z"
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": { ... }
  },
  "timestamp": "2025-10-02T12:34:56.789Z"
}
```

### Visualization Endpoints Exception

`/api/visualization/*` endpoints intentionally remain outside `/api/v1` namespace for backward compatibility with rtc-visualizer tools used across the Jitsi ecosystem.

## Testing Strategy

### Test Structure
- `test/*.test.ts`: Integration tests with real dump files
- `test/dumps/`: Test fixtures (real NDJSON dumps from production)
- `src/routes/__tests__/`: Route unit tests

### Integration Tests
Use real NDJSON dump files to test complete data flow:
```typescript
describe('DumpProcessor', () => {
    it('should process RTCStats dump', async () => {
        const result = await processor.processDump('test/dumps/sample.ndjson');
        expect(result.participants).toHaveLength(2);
        expect(result.events).toContainEqual(
            expect.objectContaining({ eventType: 'join' })
        );
    });
});
```

### Running Tests
```bash
# All tests
npm test

# Specific test file
npm test -- DumpProcessor.rtcstats

# Pattern matching
npm test -- --testPathPattern=routes

# Watch mode
npm run test:watch
```

### Test Configuration
See `jest.config.js`:
- Test timeout: 30 seconds (for processing large dump files)
- Coverage collection from `src/**/*.ts`
- Setup file: `jest.setup.js`

## Common Development Tasks

### Adding a New Event Type

1. Add to `DumpEventType` enum in `shared/types.ts`:
```typescript
export enum DumpEventType {
    NEW_EVENT = 'newEvent',
    // ...
}
```

2. Handle in `DumpProcessor._processEntry()` switch statement:
```typescript
case DumpEventType.NEW_EVENT:
    this._handleNewEvent(data, timestamp);
    break;
```

3. Add test case with sample dump file in `test/dumps/`

### Debugging Dump Processing

1. Enable debug logging:
```bash
# In .env
LOG_LEVEL=debug
```

2. Run backend with specific conference:
```bash
npm run dev
# In another terminal
curl "http://localhost:5000/api/v1/sessions/analyze/real?conferenceId=<id>&environment=prod"
```

3. Check logs for parsing errors, missing events, or failed correlations

4. Inspect raw dump file:
```bash
cat rtcstats-downloads/<conference-id>/<endpoint>.ndjson | jq
```

### Console Log Handling

Browser console logs stored in dump files under `logs` event type. Accessed via:
```bash
GET /api/v1/participants/:id/logs?level=ERROR&component=JitsiConference
```

Filtering options:
- `level`: ERROR, WARN, INFO
- `component`: Component name (e.g., "JitsiConference", "RTCStats")
- `startTime`, `endTime`: Time range
- `limit`: Max number of logs

## Important Implementation Notes

### Participant Merging Logic
Participants who rejoin get new endpointId but same displayName. DumpProcessor merges these into single ParticipantDetails with:
- Primary `endpointId` (latest/longest session)
- `endpointIds[]` array with all historical IDs
- `sessionMap` for accessing per-session data

### RTCStats CLI Dependency
Backend shells out to rtcstats-cli for production data access. Requires:
- Bash script at `RTCSTATS_CLI_PATH`
- AWS CLI configured with S3 access
- PostgreSQL client (psql) for Redshift queries
- Proper credentials for target environment

### Performance Considerations
- Large conference dumps (100+ participants) may take 30+ seconds to process
- Consider implementing caching for frequently accessed conferences
- Use streaming for very large dump files if needed

## Known Limitations

- RTCStats CLI is external dependency (not included in repo)
- PostgreSQL and Redis optional (in-memory fallbacks exist)
- Console logs limited by dump file size constraints
- No authentication/authorization implemented (add JWT middleware as needed)
