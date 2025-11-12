/**
 * RTCStats Data Service
 * Direct integration with AWS Redshift or DynamoDB for conference metadata queries
 * Uses IAM authentication (IRSA in Kubernetes) - no passwords required
 * Replaces rtcstats-cli shell script calls for database operations
 */

import { getLogger } from '@jitsi/logger';

import { rtcstatsConfig } from '../config/rtcstats';

import { DynamoDBMetadataService, IDynamoDBConfig } from './DynamoDBMetadataService';
import { RedshiftDataAPIService } from './RedshiftDataAPIService';

const logger = getLogger('backend/src/services/RTCStatsDataService');

export interface IRedshiftConfig {
    clusterIdentifier: string;
    database: string;
    region: string;
    workgroupName?: string;
}

export interface IRTCStatsConfig {
    dynamodb?: IDynamoDBConfig;
    redshift?: IRedshiftConfig;
    useDynamoDB: boolean;
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

export interface IParticipantMetadata {
    displayName?: string;
    endpointId: string;
    sessionDurationMs?: number;
    statsSessionId: string;
}

export interface IServerMetadata {
    bridgeId: string;
    environment?: string;
    region?: string;
    shard?: string;
    type: 'jvb' | 'jicofo';
}

/**
 * Service for querying RTCStats metadata from AWS DynamoDB or Redshift.
 * Uses IAM authentication (no passwords needed).
 * Provides direct database access instead of shelling out to rtcstats-cli.
 */
export class RTCStatsDataService {
    private dynamoDBService?: DynamoDBMetadataService;
    private redshiftClient?: RedshiftDataAPIService;
    private useDynamoDB: boolean;

    /**
     * Initialize the data service with DynamoDB or Redshift.
     *
     * @param {IRTCStatsConfig} config - RTCStats configuration
     */
    constructor(private config: IRTCStatsConfig) {
        this.useDynamoDB = config.useDynamoDB;

        if (this.useDynamoDB && config.dynamodb) {
            logger.info('Initializing RTCStatsDataService with DynamoDB', {
                region: config.dynamodb.region,
                tables: config.dynamodb.tables
            });
            this.dynamoDBService = new DynamoDBMetadataService(config.dynamodb);
        } else if (config.redshift) {
            logger.info('Initializing RTCStatsDataService with Redshift', {
                clusterIdentifier: config.redshift.clusterIdentifier,
                database: config.redshift.database,
                region: config.redshift.region
            });
            this.redshiftClient = new RedshiftDataAPIService(config.redshift);
        } else {
            throw new Error('RTCStatsDataService requires either DynamoDB or Redshift configuration');
        }
    }

    /**
     * Map database row to IConferenceMetadata.
     *
     * @param {any} row - Database row
     * @returns {IConferenceMetadata} Mapped conference metadata
     * @private
     */
    private _mapConferenceRow(row: any): IConferenceMetadata {
        return {
            appenv: row.appenv,
            browserName: row.browsername,
            browserVersion: row.browserversion,
            conferenceDurationMs: row.conferencedurationms,
            conferenceStartTime: row.conferencestarttime,
            createDate: row.createdate,
            displayName: row.displayname,
            endpointId: row.endpointid,
            environment: row.environment,
            meetingName: row.meetingname,
            meetingUniqueId: row.meetinguniqueid,
            meetingUrl: row.meetingurl,
            os: row.os,
            region: row.region,
            sessionDurationMs: row.sessiondurationms,
            sessionEndTime: row.sessionendtime,
            sessionStartTime: row.sessionstarttime,
            shard: row.shard,
            statsSessionId: row.statssessionid,
            tenant: row.tenant,
            userRegion: row.userregion
        };
    }

    /**
     * Test connection to DynamoDB or Redshift.
     */
    async connect(): Promise<void> {
        try {
            if (this.dynamoDBService) {
                const isConnected = await this.dynamoDBService.testConnection();

                if (!isConnected) {
                    throw new Error('DynamoDB connection test failed');
                }
                logger.info('Connected to DynamoDB successfully');
            } else if (this.redshiftClient) {
                const isConnected = await this.redshiftClient.testConnection();

                if (!isConnected) {
                    throw new Error('Redshift connection test failed');
                }
                logger.info('Connected to Redshift Data API successfully');
            }
        } catch (error) {
            logger.error('Failed to connect to data source', { error });
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(`Connection failed: ${message}`);
        }
    }

    /**
     * Disconnect from DynamoDB or Redshift (no-op for both).
     */
    async disconnect(): Promise<void> {
        if (this.dynamoDBService) {
            await this.dynamoDBService.disconnect();
        } else if (this.redshiftClient) {
            await this.redshiftClient.disconnect();
        }
    }

    /**
     * Search for conferences by URL pattern.
     * Equivalent to: rtcstats.sh list-conferences <url>
     *
     * @param {string} conferenceUrl - Conference URL or pattern to search
     * @param {number} maxAgeDays - Maximum age of conferences to search (default: 30)
     * @param {string} environment - Environment (prod/pilot) - defaults to RTCSTATS_ENV config
     * @returns {Promise<IConferenceMetadata[]>} Array of matching conferences
     */
    async searchConferences(
            conferenceUrl: string,
            maxAgeDays = 30,
            environment: 'prod' | 'pilot' = rtcstatsConfig.environment
    ): Promise<IConferenceMetadata[]> {
        try {
            if (this.dynamoDBService) {
                return await this.dynamoDBService.searchConferences(conferenceUrl, maxAgeDays, environment);
            } else if (this.redshiftClient) {
                const query = `
                    SELECT DISTINCT
                        meetinguniqueid,
                        meetingurl,
                        meetingname,
                        conferencestarttime,
                        conferencedurationms,
                        createdate,
                        environment,
                        region,
                        shard,
                        appenv,
                        tenant
                    FROM rtcstats
                    WHERE meetingurl LIKE '%${conferenceUrl}%'
                        AND createdate > CURRENT_DATE - INTERVAL '${maxAgeDays} days'
                    ORDER BY conferencestarttime DESC
                    LIMIT 100
                `;

                const result = await this.redshiftClient.executeQuery(query);

                logger.info('Conference search completed', {
                    conferenceUrl,
                    count: result.rows.length
                });

                return result.rows.map(row => this._mapConferenceRow(row));
            }

            throw new Error('No data source configured');
        } catch (error) {
            logger.error('Conference search failed', { conferenceUrl, error });
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(`Failed to search conferences: ${message}`);
        }
    }

    /**
     * Get conference by unique ID.
     *
     * @param {string} meetingUniqueId - Conference unique identifier
     * @param {string} environment - Environment (prod/pilot) - defaults to RTCSTATS_ENV config
     * @returns {Promise<IConferenceMetadata[]>} Conference metadata for all participants
     */
    async getConferenceById(
            meetingUniqueId: string,
            environment: 'prod' | 'pilot' = rtcstatsConfig.environment
    ): Promise<IConferenceMetadata[]> {
        try {
            if (this.dynamoDBService) {
                return await this.dynamoDBService.getConferenceById(meetingUniqueId, environment);
            } else if (this.redshiftClient) {
                const query = `
                    SELECT
                        meetinguniqueid,
                        meetingurl,
                        meetingname,
                        statssessionid,
                        endpointid,
                        displayname,
                        conferencestarttime,
                        sessionstarttime,
                        sessionendtime,
                        conferencedurationms,
                        sessiondurationms,
                        createdate,
                        environment,
                        region,
                        shard,
                        userregion,
                        appenv,
                        os,
                        browsername,
                        browserversion,
                        tenant
                    FROM rtcstats
                    WHERE meetinguniqueid = '${meetingUniqueId}'
                    ORDER BY sessionstarttime ASC
                `;

                const result = await this.redshiftClient.executeQuery(query);

                logger.info('Conference details retrieved', {
                    count: result.rows.length,
                    meetingUniqueId
                });

                return result.rows.map(row => this._mapConferenceRow(row));
            }

            throw new Error('No data source configured');
        } catch (error) {
            logger.error('Failed to get conference by ID', { error, meetingUniqueId });
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(`Failed to get conference: ${message}`);
        }
    }

    /**
     * Get conference by session ID (for DynamoDB lookups).
     *
     * @param {string} sessionId - Session ID (UUID)
     * @param {string} environment - Environment (prod/pilot) - defaults to RTCSTATS_ENV config
     * @returns {Promise<IConferenceMetadata[]>} Session metadata
     */
    async getConferenceBySessionId(
            sessionId: string,
            environment: 'prod' | 'pilot' = rtcstatsConfig.environment
    ): Promise<IConferenceMetadata[]> {
        try {
            if (this.dynamoDBService) {
                return await this.dynamoDBService.getConferenceBySessionId(sessionId, environment);
            } else {
                // Redshift doesn't have a sessionId concept, fall back to getConferenceById
                return await this.getConferenceById(sessionId, environment);
            }
        } catch (error) {
            logger.error('Failed to get conference by session ID', { environment, error, sessionId });
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(`Failed to get session: ${message}`);
        }
    }

    /**
     * List participants for a conference.
     * Equivalent to: rtcstats.sh list-participants <conference-id>
     *
     * @param {string} meetingUniqueId - Conference unique identifier
     * @param {string} environment - Environment (prod/pilot) - defaults to RTCSTATS_ENV config
     * @returns {Promise<IParticipantMetadata[]>} Array of participants
     */
    async listParticipants(
            meetingUniqueId: string,
            environment: 'prod' | 'pilot' = rtcstatsConfig.environment
    ): Promise<IParticipantMetadata[]> {
        try {
            if (this.dynamoDBService) {
                const participants = await this.dynamoDBService.listParticipants(meetingUniqueId, environment);

                return participants.map(p => ({
                    displayName: p.displayName,
                    endpointId: p.endpointId,
                    sessionDurationMs: p.sessionDurationMs,
                    statsSessionId: p.statsSessionId
                }));
            } else if (this.redshiftClient) {
                const query = `
                    SELECT
                        statssessionid,
                        endpointid,
                        displayname,
                        sessiondurationms,
                        sessionstarttime,
                        sessionendtime
                    FROM rtcstats
                    WHERE meetinguniqueid = '${meetingUniqueId}'
                    ORDER BY sessionstarttime ASC
                `;

                const result = await this.redshiftClient.executeQuery(query);

                logger.info('Participants listed', {
                    count: result.rows.length,
                    meetingUniqueId
                });

                return result.rows.map(row => ({
                    displayName: row.displayname,
                    endpointId: row.endpointid,
                    sessionDurationMs: row.sessiondurationms,
                    statsSessionId: row.statssessionid
                }));
            }

            throw new Error('No data source configured');
        } catch (error) {
            logger.error('Failed to list participants', { error, meetingUniqueId });
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(`Failed to list participants: ${message}`);
        }
    }

    /**
     * List servers (JVBs, Jicofo) used by a conference.
     * Equivalent to: rtcstats.sh list-servers <conference-id>
     * Note: Only available with Redshift
     *
     * @param {string} meetingUniqueId - Conference unique identifier
     * @returns {Promise<IServerMetadata[]>} Array of server metadata
     */
    async listServers(meetingUniqueId: string): Promise<IServerMetadata[]> {
        if (!this.redshiftClient) {
            throw new Error('listServers is only available with Redshift data source');
        }

        const query = `
            SELECT DISTINCT
                environment,
                region,
                shard
            FROM rtcstats
            WHERE meetinguniqueid = '${meetingUniqueId}'
                AND environment IS NOT NULL
        `;

        try {
            const result = await this.redshiftClient.executeQuery(query);

            logger.info('Servers listed', {
                count: result.rows.length,
                meetingUniqueId
            });

            // Note: rtcstats table doesn't directly store JVB/Jicofo IDs
            // This is a simplified implementation - may need to enhance
            return result.rows.map(row => ({
                bridgeId: `${row.shard || 'unknown'}-${row.region || 'unknown'}`,
                environment: row.environment,
                region: row.region,
                shard: row.shard,
                type: 'jvb' as const
            }));
        } catch (error) {
            logger.error('Failed to list servers', { error, meetingUniqueId });
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(`Failed to list servers: ${message}`);
        }
    }

    /**
     * Trace participant across multiple conferences.
     * Equivalent to: rtcstats.sh trace-participant <display-name>
     * Note: Only available with Redshift
     *
     * @param {string} displayName - Participant display name
     * @param {number} maxAgeDays - Maximum age of sessions to search (default: 30)
     * @returns {Promise<IConferenceMetadata[]>} Array of conferences with this participant
     */
    async traceParticipant(
            displayName: string,
            maxAgeDays = 30
    ): Promise<IConferenceMetadata[]> {
        if (!this.redshiftClient) {
            throw new Error('traceParticipant is only available with Redshift data source');
        }

        const query = `
            SELECT
                meetinguniqueid,
                meetingurl,
                meetingname,
                statssessionid,
                endpointid,
                displayname,
                conferencestarttime,
                sessionstarttime,
                sessionendtime,
                sessiondurationms,
                createdate
            FROM rtcstats
            WHERE displayname LIKE '%${displayName}%'
                AND createdate > CURRENT_DATE - INTERVAL '${maxAgeDays} days'
            ORDER BY sessionstarttime DESC
            LIMIT 100
        `;

        try {
            const result = await this.redshiftClient.executeQuery(query);

            logger.info('Participant trace completed', {
                count: result.rows.length,
                displayName
            });

            return result.rows.map(row => this._mapConferenceRow(row));
        } catch (error) {
            logger.error('Failed to trace participant', { displayName, error });
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(`Failed to trace participant: ${message}`);
        }
    }

    /**
     * Execute a custom query against Redshift.
     * Use with caution - for advanced queries only.
     * Note: Only available with Redshift
     *
     * @param {string} query - SQL query to execute
     * @returns {Promise<any[]>} Query result rows
     */
    async executeQuery(query: string): Promise<any[]> {
        if (!this.redshiftClient) {
            throw new Error('executeQuery is only available with Redshift data source');
        }

        try {
            const result = await this.redshiftClient.executeQuery(query);

            logger.debug('Custom query executed', {
                rowCount: result.rows.length
            });

            return result.rows;
        } catch (error) {
            logger.error('Custom query failed', { error, query });
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(`Query execution failed: ${message}`);
        }
    }
}

export default RTCStatsDataService;
