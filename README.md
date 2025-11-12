# Jitsi Call Analytics

A comprehensive analytics platform for analyzing Jitsi Meet conference data from RTCStats dumps. Features real-time data processing, multi-source integration, and detailed quality metrics analysis.

## Features

- **Native AWS Integration**: Direct DynamoDB and S3 integration for RTCStats metadata and dump files
- **Multi-Source Data Collection**: Integrates conference metadata, WebRTC statistics, and console logs
- **Real-Time Analysis**: Process and visualize conference data with detailed participant metrics
- **Quality Metrics**: Comprehensive analysis of audio/video quality, network performance, and connectivity
- **Interactive Timeline**: Visual representation of conference events and participant activity
- **Console Log Analysis**: Extract and analyze client-side logs for debugging
- **Environment Support**: Separate pilot and production environment configurations
- **File Upload Support**: Analyze local dump files without AWS integration

## Architecture

### Backend (Node.js + Express + TypeScript)

- **Native AWS SDK Integration**: Direct access to DynamoDB and S3 (no CLI dependencies)
- **DumpProcessor**: NDJSON dump file parser and event correlator
- **RTCStatsService**: Orchestrates metadata queries, downloads, and processing
- **DynamoDBMetadataService**: Primary data source for conference metadata (IAM authenticated)
- **S3DumpService**: Direct S3 integration for dump file downloads
- **RedshiftDataAPIService**: Optional Redshift Data API integration
- **RESTful API**: Standardized response format with pagination support

### Frontend (React + TypeScript)

- Real-time conference search and filtering
- Interactive timeline visualization
- Detailed participant statistics and quality metrics
- Console log viewer with filtering
- Component metadata display (JVB, Jicofo)

### Data Sources

- **Primary**: AWS DynamoDB (metadata) + S3 (dump files)
- **Optional**: AWS Redshift Data API (legacy support)
- **Local**: File upload support for offline analysis

## Prerequisites

- **Node.js**: v18+ and npm
- **AWS Access**: DynamoDB and S3 credentials (or IAM roles via IRSA in Kubernetes)
- **jq**: Command-line JSON processor for console log extraction
  ```bash
  # macOS
  brew install jq

  # Ubuntu/Debian
  apt-get install jq

  # RHEL/CentOS
  yum install jq
  ```

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd jitsi-call-analytics
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   # Backend
   cp backend/.env.example backend/.env

   # Frontend
   cp frontend/.env.example frontend/.env
   ```

4. **Configure AWS credentials** (see Configuration section below)

## Configuration

### Backend Environment Variables

Edit `backend/.env`:

```bash
# Server Configuration
PORT=5000
FRONTEND_URL=http://localhost:3000

# AWS Configuration
AWS_REGION=us-east-1
# Optional: Only needed for local development (IRSA handles this in Kubernetes)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# DynamoDB Configuration (Recommended)
RTCSTATS_USE_DYNAMODB=true
RTCSTATS_DYNAMODB_TABLE_PILOT=your-pilot-table-name
RTCSTATS_DYNAMODB_TABLE_PROD=your-prod-table-name

# S3 Configuration (Environment-specific buckets)
RTCSTATS_S3_BUCKET_PILOT=your-pilot-bucket-name
RTCSTATS_S3_BUCKET_PROD=your-prod-bucket-name

# Redshift Configuration (Optional - only if not using DynamoDB)
RTCSTATS_USE_DYNAMODB=false
RTCSTATS_REDSHIFT_CLUSTER_ID=your-cluster-id
RTCSTATS_REDSHIFT_DATABASE=rtcstats

# General RTCStats Configuration
RTCSTATS_ENV=prod  # or 'pilot'
RTCSTATS_DOWNLOADS_PATH=./rtcstats-downloads

# Logging
LOG_LEVEL=info  # Set to 'debug' for verbose output
```

### Frontend Environment Variables

Edit `frontend/.env`:

```bash
REACT_APP_API_URL=http://localhost:5000
```

### AWS IAM Permissions

Your AWS credentials need the following permissions:

**DynamoDB**:
- `dynamodb:Query`
- `dynamodb:GetItem`
- `dynamodb:Scan`

**S3**:
- `s3:GetObject`
- `s3:ListBucket`

**Redshift Data API** (optional):
- `redshift-data:ExecuteStatement`
- `redshift-data:DescribeStatement`
- `redshift-data:GetStatementResult`

### Environment-Specific Resources

| Environment | DynamoDB Table | S3 Bucket |
|------------|----------------|-----------|
| **Pilot** | `RTCSTATS_DYNAMODB_TABLE_PILOT` | `RTCSTATS_S3_BUCKET_PILOT` |
| **Production** | `RTCSTATS_DYNAMODB_TABLE_PROD` | `RTCSTATS_S3_BUCKET_PROD` |

The `RTCSTATS_ENV` variable determines which resources are used by default.

## Usage

### Development Mode

1. **Start backend**:
   ```bash
   cd backend
   npm run dev
   ```
   Backend runs on http://localhost:5000

2. **Start frontend** (in separate terminal):
   ```bash
   cd frontend
   npm start
   ```
   Frontend runs on http://localhost:3000

### Production Build

```bash
# Build backend
cd backend
npm run build
npm start

# Build frontend
cd frontend
npm run build
# Serve build/ directory with your web server
```

### Docker Deployment

See [DOCKER.md](DOCKER.md) for containerized deployment instructions.

```bash
# Build and run with Docker Compose
docker-compose up --build
```

## API Endpoints

### Conference Search
```bash
# Search conferences by URL
GET /api/v1/rtcstats/search?q=meet.jit.si/myroom&env=prod

# Get conference details
GET /api/v1/rtcstats/conferences/:conferenceId?environment=prod
```

### Session Analysis
```bash
# Analyze session from RTCStats
POST /api/v1/sessions/analyze/real
{
  "conferenceId": "conference-uuid",
  "environment": "prod"
}

# Upload and analyze local dumps
POST /api/v1/uploads/analyze
Content-Type: multipart/form-data
dumps: [file1.ndjson, file2.ndjson, ...]
```

### Participant Data
```bash
# Get participant console logs
GET /api/v1/participants/:id/logs?level=ERROR&component=JitsiConference
```

## Development

### Backend Development

```bash
cd backend

# Run with hot reload
npm run dev

# Run tests
npm test

# Run specific test
npm test -- DumpProcessor.test.ts

# Linting
npm run lint
npm run lint:fix

# Type checking
npm run type-check
```

### Frontend Development

```bash
cd frontend

# Development server
npm start

# Run tests
npm test

# Build production
npm run build

# Linting
npm run lint
```

## Testing

### Backend Tests

The backend includes comprehensive test coverage:

- **Integration Tests**: Real dump file processing
- **Service Tests**: DynamoDB, S3, and Redshift services
- **Unit Tests**: Middleware, utilities, and helpers

```bash
cd backend
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Test Data

Test dumps are located in `backend/test/dumps/` and represent real RTCStats data structures.

## Project Structure

```
jitsi-call-analytics/
├── backend/                # Node.js backend
│   ├── src/
│   │   ├── config/        # Configuration (rtcstats, database)
│   │   ├── middleware/    # Express middleware (apiResponse, CORS)
│   │   ├── routes/        # API endpoints
│   │   └── services/      # Business logic
│   │       ├── DumpProcessor.ts            # NDJSON parser
│   │       ├── RTCStatsService.ts          # Main orchestration
│   │       ├── DynamoDBMetadataService.ts  # DynamoDB queries
│   │       ├── S3DumpService.ts            # S3 downloads
│   │       └── RedshiftDataAPIService.ts   # Optional Redshift
│   └── test/              # Integration tests
├── frontend/              # React frontend
│   └── src/
│       ├── components/    # React components
│       ├── services/      # API clients
│       └── types/         # TypeScript types
├── shared/                # Shared types between frontend/backend
├── CLAUDE.md             # AI assistant development guide
└── README.md             # This file
```

## Key Technologies

- **Backend**: Node.js, Express, TypeScript, AWS SDK (DynamoDB, S3, Redshift)
- **Frontend**: React, TypeScript, Recharts (visualization)
- **Testing**: Jest, Supertest
- **Authentication**: AWS IAM (IRSA in Kubernetes)
- **Data Format**: NDJSON (Newline-Delimited JSON)

## RTCStats Data Flow

1. **Search**: Query DynamoDB for conference metadata by URL or ID
2. **Download**: Retrieve dump files from S3 (environment-specific buckets)
3. **Extract**: Use `jq` to extract console logs from compressed NDJSON files
4. **Process**: Parse NDJSON dumps with DumpProcessor
5. **Correlate**: Merge participant sessions by display name
6. **Analyze**: Calculate quality metrics and generate timeline
7. **Display**: Present interactive analysis in React frontend

## Important Implementation Notes

### Client Type Detection

The system identifies participants vs backend components using `isClientApp()` logic:
- **Participants**: Any app that's NOT 'JVB' or 'Jicofo' (e.g., 'Jitsi Meet', '8x8 Work')
- **Backend Components**: 'JVB', 'Jicofo'

### Environment Handling

All conference queries accept an `environment` parameter:
- Defaults to `RTCSTATS_ENV` configuration (usually 'prod')
- Selects appropriate DynamoDB table and S3 bucket
- Frontend passes environment from user selection

### Console Log Processing

Console logs are extracted using a two-step process:
1. Download `.gz` files from S3
2. Extract logs using `jq`: `gunzip -c file.gz | jq -r '.logs[] | "\(.timestamp) [\(.level)] \(.message)"' > file.txt`

## Troubleshooting

### AWS Credentials

If you see authentication errors:
1. Verify AWS credentials: `aws sts get-caller-identity`
2. Check IAM permissions for DynamoDB and S3
3. For IRSA (Kubernetes), ensure service account has correct role annotations

### Missing Dependencies

If console log extraction fails:
```bash
# Verify jq is installed
which jq
jq --version
```

### Test Failures

If tests fail after dependency updates:
```bash
# Clear Jest cache
cd backend
npm test -- --clearCache

# Rebuild node_modules
rm -rf node_modules package-lock.json
npm install
```

## Contributing

See [CLAUDE.md](CLAUDE.md) for development guidelines and architecture details.

## License

Apache 2.0

## Support

For issues and questions, please use the GitHub issue tracker.
