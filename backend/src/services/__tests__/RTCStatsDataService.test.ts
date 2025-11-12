/**
 * RTCStatsDataService Test Suite
 * Tests RTCStats metadata queries using Redshift Data API
 */

import { RTCStatsDataService, IRTCStatsConfig, IRedshiftConfig } from '../RTCStatsDataService';
import { RedshiftDataAPIService } from '../RedshiftDataAPIService';

// Mock RedshiftDataAPIService
jest.mock('../RedshiftDataAPIService');

describe('RTCStatsDataService', () => {
    let service: RTCStatsDataService;
    let mockRedshiftClient: jest.Mocked<RedshiftDataAPIService>;

    const mockRedshiftConfig: IRedshiftConfig = {
        clusterIdentifier: 'test-cluster',
        database: 'rtcstats',
        region: 'us-east-1'
    };

    const mockConfig: IRTCStatsConfig = {
        useDynamoDB: false, // Use Redshift for these tests
        redshift: mockRedshiftConfig
    };

    beforeEach(() => {
        jest.clearAllMocks();
        service = new RTCStatsDataService(mockConfig);
        // Get the mocked instance
        mockRedshiftClient = (service as any).redshiftClient;
    });

    describe('constructor', () => {
        it('should initialize RedshiftDataAPIService with config', () => {
            expect(RedshiftDataAPIService).toHaveBeenCalledWith(mockRedshiftConfig);
        });
    });

    describe('connect', () => {
        it('should successfully test connection', async () => {
            mockRedshiftClient.testConnection.mockResolvedValue(true);

            await expect(service.connect()).resolves.not.toThrow();
            expect(mockRedshiftClient.testConnection).toHaveBeenCalled();
        });

        it('should throw error if connection test fails', async () => {
            mockRedshiftClient.testConnection.mockResolvedValue(false);

            await expect(service.connect())
                .rejects.toThrow('Connection failed: Redshift connection test failed');
        });

        it('should throw error if testConnection throws', async () => {
            mockRedshiftClient.testConnection.mockRejectedValue(
                new Error('Network timeout')
            );

            await expect(service.connect())
                .rejects.toThrow('Connection failed: Network timeout');
        });
    });

    describe('disconnect', () => {
        it('should call redshiftClient.disconnect()', async () => {
            mockRedshiftClient.disconnect.mockResolvedValue();

            await service.disconnect();

            expect(mockRedshiftClient.disconnect).toHaveBeenCalled();
        });
    });

    describe('searchConferences', () => {
        const mockResults = {
            columns: [ 'meetinguniqueid', 'meetingurl', 'meetingname' ],
            rows: [
                {
                    meetinguniqueid: 'conf-123',
                    meetingurl: 'https://meet.jit.si/test',
                    meetingname: 'Test Meeting',
                    conferencestarttime: '2025-11-01T10:00:00Z',
                    createdate: '2025-11-01T09:55:00Z'
                },
                {
                    meetinguniqueid: 'conf-456',
                    meetingurl: 'https://meet.jit.si/test2',
                    meetingname: 'Test Meeting 2',
                    conferencestarttime: '2025-11-02T10:00:00Z',
                    createdate: '2025-11-02T09:55:00Z'
                }
            ]
        };

        it('should search conferences successfully', async () => {
            mockRedshiftClient.executeQuery.mockResolvedValue(mockResults);

            const results = await service.searchConferences('meet.jit.si/test', 30, 'prod');

            expect(results).toHaveLength(2);
            expect(results[0].meetingUniqueId).toBe('conf-123');
            expect(results[0].meetingUrl).toBe('https://meet.jit.si/test');
            expect(mockRedshiftClient.executeQuery).toHaveBeenCalledWith(
                expect.stringContaining('SELECT DISTINCT')
            );
            expect(mockRedshiftClient.executeQuery).toHaveBeenCalledWith(
                expect.stringContaining('FROM rtcstats')
            );
            expect(mockRedshiftClient.executeQuery).toHaveBeenCalledWith(
                expect.stringContaining('meet.jit.si/test')
            );
        });

        it('should use default maxAgeDays of 30', async () => {
            mockRedshiftClient.executeQuery.mockResolvedValue({ columns: [], rows: [] });

            await service.searchConferences('test.com', 30, 'prod');

            expect(mockRedshiftClient.executeQuery).toHaveBeenCalledWith(
                expect.stringContaining("INTERVAL '30 days'")
            );
        });

        it('should use custom maxAgeDays', async () => {
            mockRedshiftClient.executeQuery.mockResolvedValue({ columns: [], rows: [] });

            await service.searchConferences('test.com', 7, 'prod');

            expect(mockRedshiftClient.executeQuery).toHaveBeenCalledWith(
                expect.stringContaining("INTERVAL '7 days'")
            );
        });

        it('should handle empty results', async () => {
            mockRedshiftClient.executeQuery.mockResolvedValue({ columns: [], rows: [] });

            const results = await service.searchConferences('nonexistent.com', 30, 'prod');

            expect(results).toEqual([]);
        });

        it('should throw error on query failure', async () => {
            mockRedshiftClient.executeQuery.mockRejectedValue(
                new Error('Query failed: permission denied')
            );

            await expect(service.searchConferences('test.com', 30, 'prod'))
                .rejects.toThrow('Failed to search conferences');
        });
    });

    describe('getConferenceById', () => {
        const mockResults = {
            columns: [ 'meetinguniqueid', 'statssessionid', 'displayname' ],
            rows: [
                {
                    meetinguniqueid: 'conf-123',
                    statssessionid: 'session-1',
                    displayname: 'Alice',
                    meetingurl: 'https://meet.jit.si/test'
                },
                {
                    meetinguniqueid: 'conf-123',
                    statssessionid: 'session-2',
                    displayname: 'Bob',
                    meetingurl: 'https://meet.jit.si/test'
                }
            ]
        };

        it('should get conference by ID successfully', async () => {
            mockRedshiftClient.executeQuery.mockResolvedValue(mockResults);

            const results = await service.getConferenceById('conf-123', 'prod');

            expect(results).toHaveLength(2);
            expect(results[0].meetingUniqueId).toBe('conf-123');
            expect(results[0].statsSessionId).toBe('session-1');
            expect(results[1].displayName).toBe('Bob');
            expect(mockRedshiftClient.executeQuery).toHaveBeenCalledWith(
                expect.stringContaining("WHERE meetinguniqueid = 'conf-123'")
            );
        });

        it('should handle conference not found', async () => {
            mockRedshiftClient.executeQuery.mockResolvedValue({ columns: [], rows: [] });

            const results = await service.getConferenceById('nonexistent', 'prod');

            expect(results).toEqual([]);
        });

        it('should throw error on query failure', async () => {
            mockRedshiftClient.executeQuery.mockRejectedValue(
                new Error('Query timeout')
            );

            await expect(service.getConferenceById('conf-123', 'prod'))
                .rejects.toThrow('Failed to get conference');
        });
    });

    describe('listParticipants', () => {
        const mockResults = {
            columns: [ 'statssessionid', 'endpointid', 'displayname' ],
            rows: [
                {
                    statssessionid: 'session-1',
                    endpointid: 'endpoint-1',
                    displayname: 'Alice',
                    sessiondurationms: 300000
                },
                {
                    statssessionid: 'session-2',
                    endpointid: 'endpoint-2',
                    displayname: 'Bob',
                    sessiondurationms: 250000
                }
            ]
        };

        it('should list participants successfully', async () => {
            mockRedshiftClient.executeQuery.mockResolvedValue(mockResults);

            const results = await service.listParticipants('conf-123', 'prod');

            expect(results).toHaveLength(2);
            expect(results[0].statsSessionId).toBe('session-1');
            expect(results[0].displayName).toBe('Alice');
            expect(results[1].endpointId).toBe('endpoint-2');
            expect(mockRedshiftClient.executeQuery).toHaveBeenCalledWith(
                expect.stringContaining("WHERE meetinguniqueid = 'conf-123'")
            );
        });

        it('should handle no participants', async () => {
            mockRedshiftClient.executeQuery.mockResolvedValue({ columns: [], rows: [] });

            const results = await service.listParticipants('empty-conf', 'prod');

            expect(results).toEqual([]);
        });

        it('should throw error on query failure', async () => {
            mockRedshiftClient.executeQuery.mockRejectedValue(
                new Error('Query failed')
            );

            await expect(service.listParticipants('conf-123', 'prod'))
                .rejects.toThrow('Failed to list participants');
        });
    });

    describe('listServers', () => {
        const mockResults = {
            columns: [ 'environment', 'region', 'shard' ],
            rows: [
                {
                    environment: 'prod',
                    region: 'us-east-1',
                    shard: 'shard-1'
                },
                {
                    environment: 'prod',
                    region: 'us-west-2',
                    shard: 'shard-2'
                }
            ]
        };

        it('should list servers successfully', async () => {
            mockRedshiftClient.executeQuery.mockResolvedValue(mockResults);

            const results = await service.listServers('conf-123');

            expect(results).toHaveLength(2);
            expect(results[0].bridgeId).toBe('shard-1-us-east-1');
            expect(results[0].type).toBe('jvb');
            expect(results[1].region).toBe('us-west-2');
        });

        it('should handle missing shard/region gracefully', async () => {
            mockRedshiftClient.executeQuery.mockResolvedValue({
                columns: [ 'environment', 'region', 'shard' ],
                rows: [
                    {
                        environment: 'prod',
                        region: null,
                        shard: null
                    }
                ]
            });

            const results = await service.listServers('conf-123');

            expect(results[0].bridgeId).toBe('unknown-unknown');
        });

        it('should throw error on query failure', async () => {
            mockRedshiftClient.executeQuery.mockRejectedValue(
                new Error('Query failed')
            );

            await expect(service.listServers('conf-123'))
                .rejects.toThrow('Failed to list servers');
        });
    });

    describe('traceParticipant', () => {
        const mockResults = {
            columns: [ 'meetinguniqueid', 'displayname', 'sessionstarttime' ],
            rows: [
                {
                    meetinguniqueid: 'conf-1',
                    displayname: 'Alice Smith',
                    sessionstarttime: '2025-11-01T10:00:00Z'
                },
                {
                    meetinguniqueid: 'conf-2',
                    displayname: 'Alice Smith',
                    sessionstarttime: '2025-11-02T14:00:00Z'
                }
            ]
        };

        it('should trace participant successfully', async () => {
            mockRedshiftClient.executeQuery.mockResolvedValue(mockResults);

            const results = await service.traceParticipant('Alice Smith');

            expect(results).toHaveLength(2);
            expect(results[0].displayName).toBe('Alice Smith');
            expect(mockRedshiftClient.executeQuery).toHaveBeenCalledWith(
                expect.stringContaining("WHERE displayname LIKE '%Alice Smith%'")
            );
        });

        it('should use default maxAgeDays of 30', async () => {
            mockRedshiftClient.executeQuery.mockResolvedValue({ columns: [], rows: [] });

            await service.traceParticipant('John Doe');

            expect(mockRedshiftClient.executeQuery).toHaveBeenCalledWith(
                expect.stringContaining("INTERVAL '30 days'")
            );
        });

        it('should use custom maxAgeDays', async () => {
            mockRedshiftClient.executeQuery.mockResolvedValue({ columns: [], rows: [] });

            await service.traceParticipant('John Doe', 14);

            expect(mockRedshiftClient.executeQuery).toHaveBeenCalledWith(
                expect.stringContaining("INTERVAL '14 days'")
            );
        });

        it('should throw error on query failure', async () => {
            mockRedshiftClient.executeQuery.mockRejectedValue(
                new Error('Query failed')
            );

            await expect(service.traceParticipant('Alice'))
                .rejects.toThrow('Failed to trace participant');
        });
    });

    describe('executeQuery', () => {
        it('should execute custom query successfully', async () => {
            const mockResult = {
                columns: [ 'count' ],
                rows: [ { count: 42 } ]
            };

            mockRedshiftClient.executeQuery.mockResolvedValue(mockResult);

            const results = await service.executeQuery('SELECT COUNT(*) as count FROM rtcstats');

            expect(results).toEqual([ { count: 42 } ]);
        });

        it('should throw error on query failure', async () => {
            mockRedshiftClient.executeQuery.mockRejectedValue(
                new Error('Invalid SQL')
            );

            await expect(service.executeQuery('INVALID SQL'))
                .rejects.toThrow('Query execution failed');
        });
    });
});
