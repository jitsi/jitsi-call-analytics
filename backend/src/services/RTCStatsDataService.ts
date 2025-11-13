/**
 * RTCStats Data Service
 * Direct integration with AWS Redshift or DynamoDB for conference metadata queries
 * Uses IAM authentication (IRSA in Kubernetes) - no passwords required
 * Replaces rtcstats-cli shell script calls for database operations
 */

import { getLogger } from '@jitsi/logger';

import { RTCStatsEnvironment } from '../../../shared/types/rtcstats';
import { DynamoDBMetadataService, IDynamoDBConfig } from './DynamoDBMetadataService';
import { RedshiftDataAPIService } from './RedshiftDataAPIService';

const logger = getLogger('backend/src/services/RTCStatsDataService');

export interface IRedshiftConfig {
    clusterIdentifier: string;
    database: string;
    region: string;
    workgroupName?: string;
}

export interface IRedshiftClustersConfig {
    clusters: {
        pilot: IRedshiftConfig;
        prod: IRedshiftConfig;
    };
    region: string;
}

export interface IRTCStatsConfig {
    dynamodb?: IDynamoDBConfig;
    redshift?: IRedshiftClustersConfig;
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
    private redshiftClients: Map<RTCStatsEnvironment, RedshiftDataAPIService>;
    private useDynamoDB: boolean;

    /**
     * Initialize the data service with DynamoDB or Redshift.
     *
     * @param {IRTCStatsConfig} config - RTCStats configuration
     */
    constructor(private config: IRTCStatsConfig) {
        this.useDynamoDB = config.useDynamoDB;
        this.redshiftClients = new Map();

        if (this.useDynamoDB && config.dynamodb) {
            logger.info('Initializing RTCStatsDataService with DynamoDB', {
                region: config.dynamodb.region,
                tables: config.dynamodb.tables
            });
            this.dynamoDBService = new DynamoDBMetadataService(config.dynamodb);
        } else if (config.redshift) {
            // Initialize Redshift clients for each environment
            const pilotCluster = config.redshift.clusters.pilot;
            const prodCluster = config.redshift.clusters.prod;

            if (pilotCluster.clusterIdentifier) {
                logger.info('Initializing RTCStatsDataService with Redshift (pilot)', {
                    clusterIdentifier: pilotCluster.clusterIdentifier,
                    database: pilotCluster.database
                });
                this.redshiftClients.set(RTCStatsEnvironment.PILOT, new RedshiftDataAPIService(pilotCluster));
            }

            if (prodCluster.clusterIdentifier) {
                logger.info('Initializing RTCStatsDataService with Redshift (prod)', {
                    clusterIdentifier: prodCluster.clusterIdentifier,
                    database: prodCluster.database
                });
                this.redshiftClients.set(RTCStatsEnvironment.PROD, new RedshiftDataAPIService(prodCluster));
            }

            if (this.redshiftClients.size === 0) {
                throw new Error('No Redshift clusters configured');
            }
        } else {
            throw new Error('RTCStatsDataService requires either DynamoDB or Redshift configuration');
        }
    }

    /**
     * Get Redshift client for the specified environment.
     * If only one cluster is configured (prod mode), returns that client regardless of environment.
     *
     * @param {RTCStatsEnvironment} environment - Environment (PROD/PILOT)
     * @returns {RedshiftDataAPIService | undefined} Redshift client
     * @private
     */
    private getRedshiftClient(environment: RTCStatsEnvironment): RedshiftDataAPIService | undefined {
        // If only one cluster configured, use it for all environments (prod mode)
        if (this.redshiftClients.size === 1) {
            return Array.from(this.redshiftClients.values())[0];
        }

        // Otherwise, use environment-specific client
        return this.redshiftClients.get(environment);
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
            } else if (this.redshiftClients.size > 0) {
                // Test connection to all configured Redshift clusters
                const connectionTests = Array.from(this.redshiftClients.entries()).map(async ([ env, client ]) => {
                    const isConnected = await client.testConnection();

                    if (!isConnected) {
                        throw new Error(`Redshift (${env}) connection test failed`);
                    }
                    logger.info(`Connected to Redshift Data API (${env}) successfully`);
                });

                await Promise.all(connectionTests);
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
        } else if (this.redshiftClients.size > 0) {
            const disconnectPromises = Array.from(this.redshiftClients.values()).map(client =>
                client.disconnect()
            );

            await Promise.all(disconnectPromises);
        }
    }

    /**
     * Search for conferences by URL pattern.
     * Equivalent to: rtcstats.sh list-conferences <url>
     *
     * @param {string} conferenceUrl - Conference URL or pattern to search
     * @param {number} maxAgeDays - Maximum age of conferences to search (default: 30)
     * @param {RTCStatsEnvironment} environment - Environment (PROD/PILOT) - required
     * @returns {Promise<IConferenceMetadata[]>} Array of matching conferences
     */
    async searchConferences(
            conferenceUrl: string,
            maxAgeDays: number,
            environment: RTCStatsEnvironment
    ): Promise<IConferenceMetadata[]> {
        try {
            if (this.dynamoDBService) {
                return await this.dynamoDBService.searchConferences(conferenceUrl, maxAgeDays, environment);
            } else {
                const redshiftClient = this.getRedshiftClient(environment);

                if (!redshiftClient) {
                    throw new Error(`No Redshift client configured for environment: ${environment}`);
                }

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

                const result = await redshiftClient.executeQuery(query);

                logger.info('Conference search completed', {
                    conferenceUrl,
                    count: result.rows.length,
                    environment
                });

                return result.rows.map(row => this._mapConferenceRow(row));
            }
        } catch (error) {
            logger.error('Conference search failed', { conferenceUrl, environment, error });
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
        try {
            if (this.dynamoDBService) {
                return await this.dynamoDBService.getConferenceById(meetingUniqueId, environment);
            } else {
                const redshiftClient = this.getRedshiftClient(environment);

                if (!redshiftClient) {
                    throw new Error(`No Redshift client configured for environment: ${environment}`);
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

                const result = await redshiftClient.executeQuery(query);

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
     * @param {RTCStatsEnvironment} environment - Environment (PROD/PILOT) - required
     * @returns {Promise<IConferenceMetadata[]>} Session metadata
     */
    async getConferenceBySessionId(
            sessionId: string,
            environment: RTCStatsEnvironment
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
     * @param {RTCStatsEnvironment} environment - Environment (PROD/PILOT) - required
     * @returns {Promise<IParticipantMetadata[]>} Array of participants
     */
    async listParticipants(
            meetingUniqueId: string,
            environment: RTCStatsEnvironment
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
            } else {
                const redshiftClient = this.getRedshiftClient(environment);

                if (!redshiftClient) {
                    throw new Error(`No Redshift client configured for environment: ${environment}`);
                }

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

                const result = await redshiftClient.executeQuery(query);

                logger.info('Participants listed', {
                    count: result.rows.length,
                    environment,
                    meetingUniqueId
                });

                return result.rows.map(row => ({
                    displayName: row.displayname,
                    endpointId: row.endpointid,
                    sessionDurationMs: row.sessiondurationms,
                    statsSessionId: row.statssessionid
                }));
            }
        } catch (error) {
            logger.error('Failed to list participants', { environment, error, meetingUniqueId });
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
     * @param {RTCStatsEnvironment} environment - Environment (PROD/PILOT) - required
     * @returns {Promise<IServerMetadata[]>} Array of server metadata
     */
    async listServers(
            meetingUniqueId: string,
            environment: RTCStatsEnvironment
    ): Promise<IServerMetadata[]> {
        const redshiftClient = this.getRedshiftClient(environment);

        if (!redshiftClient) {
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
            const result = await redshiftClient.executeQuery(query);

            logger.info('Servers listed', {
                count: result.rows.length,
                environment,
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
            logger.error('Failed to list servers', { environment, error, meetingUniqueId });
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
     * @param {number} maxAgeDays - Maximum age of sessions to search
     * @param {RTCStatsEnvironment} environment - Environment (PROD/PILOT) - required
     * @returns {Promise<IConferenceMetadata[]>} Array of conferences with this participant
     */
    async traceParticipant(
            displayName: string,
            maxAgeDays: number,
            environment: RTCStatsEnvironment
    ): Promise<IConferenceMetadata[]> {
        const redshiftClient = this.getRedshiftClient(environment);

        if (!redshiftClient) {
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
            const result = await redshiftClient.executeQuery(query);

            logger.info('Participant trace completed', {
                count: result.rows.length,
                displayName,
                environment
            });

            return result.rows.map(row => this._mapConferenceRow(row));
        } catch (error) {
            logger.error('Failed to trace participant', { displayName, environment, error });
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
     * @param {RTCStatsEnvironment} environment - Environment (PROD/PILOT) - required
     * @returns {Promise<any[]>} Query result rows
     */
    async executeQuery(
            query: string,
            environment: RTCStatsEnvironment
    ): Promise<any[]> {
        const redshiftClient = this.getRedshiftClient(environment);

        if (!redshiftClient) {
            throw new Error('executeQuery is only available with Redshift data source');
        }

        try {
            const result = await redshiftClient.executeQuery(query);

            logger.debug('Custom query executed', {
                environment,
                rowCount: result.rows.length
            });

            return result.rows;
        } catch (error) {
            logger.error('Custom query failed', { environment, error, query });
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(`Query execution failed: ${message}`);
        }
    }
}

export default RTCStatsDataService;
