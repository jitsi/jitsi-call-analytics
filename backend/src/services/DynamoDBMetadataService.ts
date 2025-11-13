/**
 * DynamoDB Metadata Service
 * Queries RTCStats metadata from DynamoDB (same as rtc-visualizer)
 * Uses IAM authentication (IRSA in Kubernetes) - no passwords needed
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getLogger } from '@jitsi/logger';

import { RTCStatsEnvironment } from '../../../shared/types/rtcstats';

const logger = getLogger('backend/src/services/DynamoDBMetadataService');

export interface IDynamoDBConfig {
    region: string;
    tables: {
        pilot: string;
        prod: string;
    };
}

export interface IConferenceMetadata {
    app?: string; // Component type: "Jitsi Meet", "JVB", "Jicofo"
    appenv?: string;
    baseDumpId?: string;
    browserName?: string;
    browserVersion?: string;
    conferenceDurationMs?: number;
    conferenceStartTime?: Date;
    createDate: Date;
    displayName?: string;
    dumpId?: string; // S3 filename with .gz extension
    endpointId: string;
    environment?: string;
    meetingName?: string;
    meetingUniqueId: string;
    meetingUrl: string;
    os?: string;
    region?: string;
    sessionDurationMs?: number;
    sessionEndTime?: Date;
    sessionStartTime?: Date;
    shard?: string;
    statsSessionId: string;
    tenant?: string;
    userRegion?: string;
}

/**
 * Service for querying RTCStats metadata from DynamoDB.
 * Uses the same DynamoDB table as rtc-visualizer.
 */
export class DynamoDBMetadataService {
    private docClient: DynamoDBDocumentClient;

    /**
     * Initialize the DynamoDB client.
     *
     * @param {IDynamoDBConfig} config - DynamoDB configuration
     */
    constructor(private config: IDynamoDBConfig) {
        logger.info('Initializing DynamoDBMetadataService', {
            region: config.region,
            tables: config.tables
        });

        const client = new DynamoDBClient({
            region: config.region
            // Credentials automatically from IRSA
        });

        // Use DocumentClient for easier data handling
        this.docClient = DynamoDBDocumentClient.from(client);
    }

    /**
     * Get table name for environment.
     *
     * @param {RTCStatsEnvironment} environment - Environment (PROD/PILOT)
     * @returns {string} Table name
     * @private
     */
    private getTableName(environment: RTCStatsEnvironment): string {
        return this.config.tables[environment];
    }

    /**
     * Map DynamoDB item to IConferenceMetadata.
     *
     * @param {any} item - DynamoDB item
     * @returns {IConferenceMetadata} Mapped conference metadata
     * @private
     */
    private _mapDynamoDBItem(item: any): IConferenceMetadata {
        // Map DynamoDB field names to IConferenceMetadata interface
        // DynamoDB uses: conferenceUrl, conferenceId, sessionId, startDate, endDate
        // Note: DynamoDB stores per-session data, not per-conference
        // meetingUniqueId should be the sessionId (like rtc-visualizer does)

        // startDate and endDate are timestamps (numbers) in milliseconds
        const startTimestamp = item.startDate ? Number(item.startDate) : undefined;
        const endTimestamp = item.endDate ? Number(item.endDate) : undefined;

        const startDate = startTimestamp ? new Date(startTimestamp) : undefined;
        const endDate = endTimestamp ? new Date(endTimestamp) : undefined;

        // Duration in milliseconds
        const duration = startTimestamp && endTimestamp ? endTimestamp - startTimestamp : undefined;

        return {
            app: item.app, // Component type: "Jitsi Meet", "JVB", "Jicofo"
            appenv: item.appenv || item.app,
            baseDumpId: item.baseDumpId,
            browserName: item.browserName,
            browserVersion: item.browserVersion,
            conferenceDurationMs: duration,
            conferenceStartTime: startDate,
            createDate: startDate || new Date(),
            displayName: item.displayName || item.userId,
            dumpId: item.dumpId, // S3 filename with .gz extension
            endpointId: item.endpointId || item.sessionId,
            environment: item.environment,
            meetingName: item.meetingName,
            meetingUniqueId: item.sessionId, // Use sessionId as meetingUniqueId (per rtc-visualizer)
            meetingUrl: item.conferenceUrl,
            os: item.os,
            region: item.region,
            sessionDurationMs: duration,
            sessionEndTime: endDate,
            sessionStartTime: startDate,
            shard: item.shard,
            statsSessionId: item.sessionId,
            tenant: item.tenant,
            userRegion: item.userRegion
        };
    }

    /**
     * Test connection to DynamoDB.
     *
     * @param {RTCStatsEnvironment} environment - Environment to test (defaults to PILOT)
     * @returns {Promise<boolean>} True if connection successful
     */
    async testConnection(environment: RTCStatsEnvironment = RTCStatsEnvironment.PILOT): Promise<boolean> {
        try {
            // Try to scan with limit 1 to test permissions
            const command = new ScanCommand({
                TableName: this.getTableName(environment),
                Limit: 1
            });

            await this.docClient.send(command);
            logger.info(`DynamoDB connection test successful for ${environment} environment`);

            return true;
        } catch (error) {
            logger.error(`DynamoDB connection test failed for ${environment} environment`, { error });

            return false;
        }
    }

    /**
     * Search for conferences by URL pattern.
     *
     * @param {string} conferenceUrl - Conference URL or pattern to search
     * @param {number} maxAgeDays - Maximum age of conferences to search
     * @param {RTCStatsEnvironment} environment - Environment (PROD/PILOT) - required
     * @returns {Promise<IConferenceMetadata[]>} Array of matching conferences
     */
    async searchConferences(
            conferenceUrl: string,
            maxAgeDays: number,
            environment: RTCStatsEnvironment
    ): Promise<IConferenceMetadata[]> {
        logger.info('Searching conferences in DynamoDB', {
            conferenceUrl,
            environment,
            maxAgeDays
        });

        try {
            const cutoffDate = new Date();

            cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
            const cutoffTimestamp = cutoffDate.getTime();

            // Following rtc-visualizer pattern:
            // If conferenceUrl contains '/', use conferenceUrl-startDate-index with exact match
            // Otherwise, use conferenceId-startDate-index with exact match
            const hasSlash = conferenceUrl.includes('/');

            if (hasSlash) {
                // Query by conferenceUrl using GSI (exact match, like rtc-visualizer)
                const command = new QueryCommand({
                    TableName: this.getTableName(environment),
                    IndexName: 'conferenceUrl-startDate-index',
                    KeyConditionExpression: 'conferenceUrl = :url AND startDate > :cutoff',
                    ExpressionAttributeValues: {
                        ':url': conferenceUrl,
                        ':cutoff': cutoffTimestamp
                    },
                    Limit: 100
                });

                const result = await this.docClient.send(command);

                logger.info('DynamoDB conference search completed (by URL)', {
                    conferenceUrl,
                    count: result.Items?.length || 0,
                    environment
                });

                return (result.Items || []).map(item => this._mapDynamoDBItem(item));
            } else {
                // Query by conferenceId using GSI (exact match, like rtc-visualizer)
                const command = new QueryCommand({
                    TableName: this.getTableName(environment),
                    IndexName: 'conferenceId-startDate-index',
                    KeyConditionExpression: 'conferenceId = :id AND startDate > :cutoff',
                    ExpressionAttributeValues: {
                        ':id': conferenceUrl, // Using conferenceUrl param as conferenceId
                        ':cutoff': cutoffTimestamp
                    },
                    Limit: 100
                });

                const result = await this.docClient.send(command);

                logger.info('DynamoDB conference search completed (by ID)', {
                    conferenceUrl,
                    count: result.Items?.length || 0,
                    environment
                });

                return (result.Items || []).map(item => this._mapDynamoDBItem(item));
            }
        } catch (error) {
            logger.error('DynamoDB conference search failed', { conferenceUrl, environment, error });
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(`Failed to search conferences: ${message}`);
        }
    }

    /**
     * Get conference by unique ID.
     *
     * @param {string} meetingUniqueId - Conference unique identifier
     * @param {RTCStatsEnvironment} environment - Environment (PROD/PILOT) - required
     * @returns {Promise<IConferenceMetadata[]>} Conference metadata for all participants
     */
    async getConferenceById(
            meetingUniqueId: string,
            environment: RTCStatsEnvironment
    ): Promise<IConferenceMetadata[]> {
        logger.info('Getting conference by ID from DynamoDB', { environment, meetingUniqueId });

        try {
            // Query by conferenceId (DynamoDB field name)
            const command = new QueryCommand({
                TableName: this.getTableName(environment),
                IndexName: 'conferenceId-index', // Adjust if different
                KeyConditionExpression: 'conferenceId = :id',
                ExpressionAttributeValues: {
                    ':id': meetingUniqueId
                }
            });

            const result = await this.docClient.send(command);

            logger.info('DynamoDB conference details retrieved', {
                count: result.Items?.length || 0,
                environment,
                meetingUniqueId
            });

            return (result.Items || []).map(item => this._mapDynamoDBItem(item));
        } catch (error) {
            // If index doesn't exist, fall back to scan
            logger.warn('Query failed, falling back to scan', { environment, error, meetingUniqueId });

            try {
                const scanCommand = new ScanCommand({
                    TableName: this.getTableName(environment),
                    FilterExpression: 'conferenceId = :id',
                    ExpressionAttributeValues: {
                        ':id': meetingUniqueId
                    }
                });

                const result = await this.docClient.send(scanCommand);

                return (result.Items || []).map(item => this._mapDynamoDBItem(item));
            } catch (scanError) {
                logger.error('Failed to get conference by ID', { environment, error: scanError, meetingUniqueId });
                const message = scanError instanceof Error ? scanError.message : String(scanError);

                throw new Error(`Failed to get conference: ${message}`);
            }
        }
    }

    /**
     * Get conference by session ID (UUID).
     *
     * @param {string} sessionId - Session ID (UUID)
     * @param {RTCStatsEnvironment} environment - Environment (PROD/PILOT) - required
     * @returns {Promise<IConferenceMetadata[]>} Session metadata
     */
    async getConferenceBySessionId(
            sessionId: string,
            environment: RTCStatsEnvironment
    ): Promise<IConferenceMetadata[]> {
        logger.info('Getting conference by session ID from DynamoDB', { environment, sessionId });

        try {
            // Query by sessionId using GSI
            const command = new QueryCommand({
                TableName: this.getTableName(environment),
                IndexName: 'sessionId-startDate-index',
                KeyConditionExpression: 'sessionId = :id',
                ExpressionAttributeValues: {
                    ':id': sessionId
                },
                Limit: 100
            });

            const result = await this.docClient.send(command);

            logger.info('DynamoDB session details retrieved', {
                count: result.Items?.length || 0,
                environment,
                sessionId
            });

            return (result.Items || []).map(item => this._mapDynamoDBItem(item));
        } catch (error) {
            logger.error('Failed to get conference by session ID', { environment, error, sessionId });
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(`Failed to get session: ${message}`);
        }
    }

    /**
     * List participants for a conference.
     *
     * @param {string} meetingUniqueId - Conference unique identifier
     * @param {RTCStatsEnvironment} environment - Environment (PROD/PILOT) - required
     * @returns {Promise<IConferenceMetadata[]>} Array of participants
     */
    async listParticipants(
            meetingUniqueId: string,
            environment: RTCStatsEnvironment
    ): Promise<IConferenceMetadata[]> {
        // Same as getConferenceById for DynamoDB
        return this.getConferenceById(meetingUniqueId, environment);
    }

    /**
     * Disconnect from DynamoDB (no-op, client is stateless).
     */
    async disconnect(): Promise<void> {
        logger.info('DynamoDB disconnect called (no-op for DynamoDB client)');
    }
}

export default DynamoDBMetadataService;
