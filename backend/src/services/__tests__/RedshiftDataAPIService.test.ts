/**
 * RedshiftDataAPIService Test Suite
 * Tests Redshift Data API integration with mocked AWS SDK
 */

import { RedshiftDataClient, ExecuteStatementCommand, DescribeStatementCommand, GetStatementResultCommand, StatusString } from '@aws-sdk/client-redshift-data';
import { mockClient } from 'aws-sdk-client-mock';

import { RedshiftDataAPIService, IRedshiftDataAPIConfig } from '../RedshiftDataAPIService';

// Mock the AWS SDK client
const redshiftMock = mockClient(RedshiftDataClient);

describe('RedshiftDataAPIService', () => {
    let service: RedshiftDataAPIService;
    const mockConfig: IRedshiftDataAPIConfig = {
        clusterIdentifier: 'test-cluster',
        database: 'testdb',
        region: 'us-east-1'
    };

    beforeEach(() => {
        redshiftMock.reset();
        service = new RedshiftDataAPIService(mockConfig);
    });

    afterEach(() => {
        redshiftMock.restore();
    });

    describe('constructor', () => {
        it('should initialize with correct configuration', () => {
            expect(service).toBeDefined();
        });

        it('should accept optional workgroupName for Redshift Serverless', () => {
            const serverlessConfig: IRedshiftDataAPIConfig = {
                ...mockConfig,
                workgroupName: 'test-workgroup'
            };
            const serverlessService = new RedshiftDataAPIService(serverlessConfig);

            expect(serverlessService).toBeDefined();
        });
    });

    describe('executeQuery', () => {
        const mockStatementId = 'test-statement-id-123';
        const mockQuery = 'SELECT * FROM test_table LIMIT 10';

        it('should execute query and return results successfully', async () => {
            // Mock ExecuteStatementCommand
            redshiftMock.on(ExecuteStatementCommand).resolves({
                Id: mockStatementId
            });

            // Mock DescribeStatementCommand - query finished
            redshiftMock.on(DescribeStatementCommand).resolves({
                Status: StatusString.FINISHED
            });

            // Mock GetStatementResultCommand
            redshiftMock.on(GetStatementResultCommand).resolves({
                ColumnMetadata: [
                    { name: 'id' },
                    { name: 'name' }
                ],
                Records: [
                    [
                        { stringValue: '1' },
                        { stringValue: 'Alice' }
                    ],
                    [
                        { stringValue: '2' },
                        { stringValue: 'Bob' }
                    ]
                ]
            });

            const result = await service.executeQuery(mockQuery);

            expect(result).toEqual({
                columns: [ 'id', 'name' ],
                rows: [
                    { id: '1', name: 'Alice' },
                    { id: '2', name: 'Bob' }
                ]
            });
        });

        it('should handle empty result sets', async () => {
            redshiftMock.on(ExecuteStatementCommand).resolves({
                Id: mockStatementId
            });

            redshiftMock.on(DescribeStatementCommand).resolves({
                Status: StatusString.FINISHED
            });

            redshiftMock.on(GetStatementResultCommand).resolves({
                ColumnMetadata: [],
                Records: []
            });

            const result = await service.executeQuery(mockQuery);

            expect(result).toEqual({
                columns: [],
                rows: []
            });
        });

        it('should handle different field types (string, long, double, boolean, null)', async () => {
            redshiftMock.on(ExecuteStatementCommand).resolves({
                Id: mockStatementId
            });

            redshiftMock.on(DescribeStatementCommand).resolves({
                Status: StatusString.FINISHED
            });

            redshiftMock.on(GetStatementResultCommand).resolves({
                ColumnMetadata: [
                    { name: 'str_col' },
                    { name: 'int_col' },
                    { name: 'float_col' },
                    { name: 'bool_col' },
                    { name: 'null_col' }
                ],
                Records: [
                    [
                        { stringValue: 'test' },
                        { longValue: 42 },
                        { doubleValue: 3.14 },
                        { booleanValue: true },
                        { isNull: true }
                    ]
                ]
            });

            const result = await service.executeQuery(mockQuery);

            expect(result).toEqual({
                columns: [ 'str_col', 'int_col', 'float_col', 'bool_col', 'null_col' ],
                rows: [
                    {
                        str_col: 'test',
                        int_col: 42,
                        float_col: 3.14,
                        bool_col: true,
                        null_col: null
                    }
                ]
            });
        });

        it('should throw error if statement ID is not returned', async () => {
            redshiftMock.on(ExecuteStatementCommand).resolves({
                Id: undefined
            });

            await expect(service.executeQuery(mockQuery))
                .rejects.toThrow('No statement ID returned from Redshift');
        });

        it('should throw error if query fails', async () => {
            const errorMessage = 'ERROR: permission denied for relation test_table';

            redshiftMock.on(ExecuteStatementCommand).resolves({
                Id: mockStatementId
            });

            redshiftMock.on(DescribeStatementCommand).resolves({
                Status: StatusString.FAILED,
                Error: errorMessage
            });

            await expect(service.executeQuery(mockQuery))
                .rejects.toThrow(`Query failed: ${errorMessage}`);
        });

        it('should throw error if query is aborted', async () => {
            redshiftMock.on(ExecuteStatementCommand).resolves({
                Id: mockStatementId
            });

            redshiftMock.on(DescribeStatementCommand).resolves({
                Status: StatusString.ABORTED
            });

            await expect(service.executeQuery(mockQuery))
                .rejects.toThrow('Query was aborted');
        });

        it('should timeout if query takes too long', async () => {
            redshiftMock.on(ExecuteStatementCommand).resolves({
                Id: mockStatementId
            });

            // Always return STARTED status (never finishes)
            redshiftMock.on(DescribeStatementCommand).resolves({
                Status: StatusString.STARTED
            });

            // Should timeout after 30 seconds (300 attempts * 100ms)
            await expect(service.executeQuery(mockQuery))
                .rejects.toThrow('Query timeout after 30000ms');
        }, 35000); // Timeout test after 35 seconds

        it('should poll multiple times before query finishes', async () => {
            redshiftMock.on(ExecuteStatementCommand).resolves({
                Id: mockStatementId
            });

            let callCount = 0;

            redshiftMock.on(DescribeStatementCommand).callsFake(() => {
                callCount++;
                if (callCount < 3) {
                    return Promise.resolve({ Status: StatusString.STARTED });
                }

                return Promise.resolve({ Status: StatusString.FINISHED });
            });

            redshiftMock.on(GetStatementResultCommand).resolves({
                ColumnMetadata: [ { name: 'result' } ],
                Records: [ [ { stringValue: 'success' } ] ]
            });

            const result = await service.executeQuery(mockQuery);

            expect(result.rows).toHaveLength(1);
            expect(callCount).toBeGreaterThanOrEqual(3);
        });
    });

    describe('testConnection', () => {
        const mockStatementId = 'test-connection-id';

        it('should return true for successful connection', async () => {
            redshiftMock.on(ExecuteStatementCommand).resolves({
                Id: mockStatementId
            });

            redshiftMock.on(DescribeStatementCommand).resolves({
                Status: StatusString.FINISHED
            });

            redshiftMock.on(GetStatementResultCommand).resolves({
                ColumnMetadata: [ { name: 'test' } ],
                Records: [ [ { stringValue: '1' } ] ]
            });

            const isConnected = await service.testConnection();

            expect(isConnected).toBe(true);
        });

        it('should return false for failed connection', async () => {
            redshiftMock.on(ExecuteStatementCommand).rejects(
                new Error('Network error')
            );

            const isConnected = await service.testConnection();

            expect(isConnected).toBe(false);
        });

        it('should return false if query fails', async () => {
            redshiftMock.on(ExecuteStatementCommand).resolves({
                Id: mockStatementId
            });

            redshiftMock.on(DescribeStatementCommand).resolves({
                Status: StatusString.FAILED,
                Error: 'Connection failed'
            });

            const isConnected = await service.testConnection();

            expect(isConnected).toBe(false);
        });
    });

    describe('disconnect', () => {
        it('should disconnect without errors', async () => {
            await expect(service.disconnect()).resolves.not.toThrow();
        });

        it('should be a no-op (Data API is stateless)', async () => {
            // Just verify it completes
            await service.disconnect();
            // Should still be able to query after disconnect
            redshiftMock.on(ExecuteStatementCommand).resolves({ Id: 'test-id' });
            redshiftMock.on(DescribeStatementCommand).resolves({ Status: StatusString.FINISHED });
            redshiftMock.on(GetStatementResultCommand).resolves({
                ColumnMetadata: [],
                Records: []
            });

            await expect(service.executeQuery('SELECT 1')).resolves.toBeDefined();
        });
    });
});
