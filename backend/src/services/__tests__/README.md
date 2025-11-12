# RTCStats Service Tests

Test suite for the Redshift Data API integration.

## Setup

Install the test dependencies:

```bash
cd backend
npm install
```

## Running Tests

```bash
# Run all tests
npm test

# Run only RTCStats service tests
npm test -- RedshiftDataAPIService
npm test -- RTCStatsDataService

# Run in watch mode
npm run test:watch

# Run with coverage
npm test -- --coverage
```

## Test Structure

### RedshiftDataAPIService.test.ts

Tests the low-level Redshift Data API wrapper:

**Test Coverage:**
- ✅ Query execution with polling
- ✅ Result mapping (string, long, double, boolean, null types)
- ✅ Error handling (failed queries, aborted queries, timeouts)
- ✅ Connection testing
- ✅ Empty result sets
- ✅ Statement ID validation
- ✅ Multi-attempt polling before query completes

**Key Test Scenarios:**
1. **Successful query execution** - Mocks complete Data API flow
2. **Different field types** - Tests all Redshift data type conversions
3. **Query failures** - Permission denied, syntax errors
4. **Query timeout** - Handles long-running queries
5. **Connection test** - Validates Redshift connectivity

### RTCStatsDataService.test.ts

Tests the high-level RTCStats metadata service:

**Test Coverage:**
- ✅ Conference search (by URL pattern)
- ✅ Conference lookup (by ID)
- ✅ Participant listing
- ✅ Server listing (JVBs)
- ✅ Participant tracing (across conferences)
- ✅ Custom query execution
- ✅ Connection lifecycle (connect/disconnect)

**Key Test Scenarios:**
1. **Search conferences** - URL pattern matching with date filters
2. **Get conference by ID** - Returns all participants in a conference
3. **List participants** - Participant metadata retrieval
4. **List servers** - JVB/Jicofo server information
5. **Trace participant** - Cross-conference participant tracking
6. **Error handling** - Query failures, timeouts, invalid IDs

## Mocking Strategy

The tests use `aws-sdk-client-mock` to mock AWS SDK calls without hitting actual AWS services.

**Example:**
```typescript
import { mockClient } from 'aws-sdk-client-mock';
import { RedshiftDataClient } from '@aws-sdk/client-redshift-data';

const redshiftMock = mockClient(RedshiftDataClient);

// Mock successful query
redshiftMock.on(ExecuteStatementCommand).resolves({
    Id: 'statement-123'
});

redshiftMock.on(DescribeStatementCommand).resolves({
    Status: StatusString.FINISHED
});

redshiftMock.on(GetStatementResultCommand).resolves({
    ColumnMetadata: [{ name: 'id' }],
    Records: [[{ stringValue: '1' }]]
});
```

## When to Run These Tests

### Before Deployment
Run tests to ensure the Redshift integration works correctly:
```bash
npm test -- RedshiftDataAPIService RTCStatsDataService
```

### After Permission Changes
If you update IAM policies or database permissions, run tests to verify the integration still works.

### During Development
Use watch mode while developing new query methods:
```bash
npm run test:watch -- RedshiftDataAPIService
```

## Integration Testing

These are **unit tests** with mocked AWS SDK calls. For **integration testing** with real Redshift:

1. Set up test environment variables:
```bash
export AWS_REGION=us-west-2
export RTCSTATS_REDSHIFT_CLUSTER_ID=rtcstats-prod
export RTCSTATS_REDSHIFT_DATABASE=rtcstats
```

2. Run integration test script (create separately):
```bash
npm run test:integration
```

## Troubleshooting Tests

### Test Fails with "Cannot find module"
```bash
npm install
```

### Test Timeout
Increase Jest timeout in `jest.config.js`:
```javascript
testTimeout: 30000  // 30 seconds
```

### Mock Not Working
Ensure `aws-sdk-client-mock` is installed:
```bash
npm install --save-dev aws-sdk-client-mock
```

## Coverage Goals

Target coverage: **80%+**

Current coverage areas:
- ✅ Query execution paths
- ✅ Error handling
- ✅ Data type conversions
- ✅ Empty result handling
- ✅ Timeout scenarios

## Adding New Tests

When adding new query methods to `RTCStatsDataService`:

1. **Add test case** in `RTCStatsDataService.test.ts`
2. **Mock the executeQuery** call with expected results
3. **Verify query SQL** contains correct WHERE clauses
4. **Test error scenarios** (query failure, empty results)

Example:
```typescript
describe('myNewQuery', () => {
    it('should execute query successfully', async () => {
        mockRedshiftClient.executeQuery.mockResolvedValue({
            columns: ['col1'],
            rows: [{ col1: 'value1' }]
        });

        const result = await service.myNewQuery('param');

        expect(result).toHaveLength(1);
        expect(mockRedshiftClient.executeQuery).toHaveBeenCalledWith(
            expect.stringContaining('WHERE column = ')
        );
    });
});
```

## Test Data

Mock data is self-contained in test files. No external test fixtures needed.

Typical mock conference data:
```typescript
{
    meetinguniqueid: 'conf-123',
    meetingurl: 'https://meet.jit.si/test',
    meetingname: 'Test Meeting',
    conferencestarttime: '2025-11-01T10:00:00Z'
}
```

## CI/CD Integration

Add to your CI pipeline:

```yaml
# .github/workflows/test.yml
- name: Run Backend Tests
  run: |
    cd backend
    npm install
    npm test -- --coverage
```
