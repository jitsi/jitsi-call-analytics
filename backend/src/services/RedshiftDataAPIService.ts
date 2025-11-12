/**
 * Redshift Data API Service
 * AWS-native integration with Redshift using Data API (no pg library needed)
 * Works seamlessly with Kubernetes IRSA - no passwords required
 */

import {
    DescribeStatementCommand,
    ExecuteStatementCommand,
    GetStatementResultCommand,
    RedshiftDataClient,
    StatusString
} from '@aws-sdk/client-redshift-data';
import { getLogger } from '@jitsi/logger';

const logger = getLogger('backend/src/services/RedshiftDataAPIService');

export interface IRedshiftDataAPIConfig {
    clusterIdentifier: string;
    database: string;
    dbUser?: string; // Database user to run queries as (optional)
    region: string;
    workgroupName?: string; // For Redshift Serverless
}

export interface IQueryResult {
    columns: string[];
    rows: any[];
}

/**
 * Service for querying AWS Redshift using the Data API.
 * Benefits over direct pg connection:
 * - No connection pooling needed
 * - No password management (uses IAM/IRSA)
 * - Automatic retry and scaling
 * - Better for Kubernetes workloads
 */
export class RedshiftDataAPIService {
    private client: RedshiftDataClient;

    /**
     * Initialize the Redshift Data API client.
     *
     * @param {IRedshiftDataAPIConfig} config - Redshift Data API configuration
     */
    constructor(private config: IRedshiftDataAPIConfig) {
        logger.info('Initializing RedshiftDataAPIService', {
            clusterIdentifier: config.clusterIdentifier,
            database: config.database,
            region: config.region
        });

        // AWS SDK will use default credential provider chain (IRSA in Kubernetes)
        this.client = new RedshiftDataClient({
            region: config.region
        });
    }

    /**
     * Sleep for specified milliseconds.
     *
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     * @private
     */
    private _sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get query results.
     *
     * @param {string} statementId - Statement ID
     * @returns {Promise<IQueryResult>} Query results
     * @private
     */
    private async _getResults(statementId: string): Promise<IQueryResult> {
        const getResultCommand = new GetStatementResultCommand({ Id: statementId });
        const result = await this.client.send(getResultCommand);

        if (!result.Records || !result.ColumnMetadata) {
            return { columns: [], rows: [] };
        }

        // Extract column names
        const columns = result.ColumnMetadata.map((col: any) => col.name || '');

        // Convert records to row objects
        const rows = result.Records.map((record: any) => {
            const row: any = {};

            record.forEach((field: any, index: number) => {
                const columnName = columns[index];

                // Extract value from field (handle different field types)
                if (field.stringValue !== undefined) {
                    row[columnName] = field.stringValue;
                } else if (field.longValue !== undefined) {
                    row[columnName] = field.longValue;
                } else if (field.doubleValue !== undefined) {
                    row[columnName] = field.doubleValue;
                } else if (field.booleanValue !== undefined) {
                    row[columnName] = field.booleanValue;
                } else if (field.isNull) {
                    row[columnName] = null;
                } else {
                    row[columnName] = null;
                }
            });

            return row;
        });

        return { columns, rows };
    }

    /**
     * Wait for query to complete and return results.
     *
     * @param {string} statementId - Statement ID from ExecuteStatement
     * @returns {Promise<IQueryResult>} Query results
     * @private
     */
    private async _waitForResults(statementId: string): Promise<IQueryResult> {
        const maxAttempts = 300; // 30 seconds with 100ms intervals
        let attempts = 0;

        while (attempts < maxAttempts) {
            const describeCommand = new DescribeStatementCommand({ Id: statementId });
            const description = await this.client.send(describeCommand);

            const status = description.Status;

            logger.debug('Statement status', { attempts, statementId, status });

            if (status === StatusString.FINISHED) {
                // Get results
                return await this._getResults(statementId);
            } else if (status === StatusString.FAILED) {
                const error = description.Error || 'Unknown error';

                throw new Error(`Query failed: ${error}`);
            } else if (status === StatusString.ABORTED) {
                throw new Error('Query was aborted');
            }

            // Still running, wait and retry
            await this._sleep(100);
            attempts++;
        }

        throw new Error(`Query timeout after ${maxAttempts * 100}ms`);
    }

    /**
     * Execute a SQL query and wait for results.
     *
     * @param {string} sql - SQL query to execute
     * @param {any[]} parameters - Query parameters (optional, for parameterized queries)
     * @returns {Promise<IQueryResult>} Query results with columns and rows
     */
    async executeQuery(sql: string, parameters: any[] = []): Promise<IQueryResult> {
        const startTime = Date.now();

        logger.debug('Executing Redshift query', {
            paramCount: parameters.length,
            sql: sql.substring(0, 200)
        });

        try {
            // Execute the statement
            const executeCommand = new ExecuteStatementCommand({
                ClusterIdentifier: this.config.clusterIdentifier,
                Database: this.config.database,
                Sql: sql,
                WorkgroupName: this.config.workgroupName
                // Parameters: parameters.length > 0 ? this._convertParameters(parameters) : undefined
            });

            const { Id } = await this.client.send(executeCommand);

            if (!Id) {
                throw new Error('No statement ID returned from Redshift');
            }

            logger.debug('Statement submitted', { statementId: Id });

            // Poll for completion
            const result = await this._waitForResults(Id);

            const duration = Date.now() - startTime;

            logger.info('Query completed', {
                duration,
                rowCount: result.rows.length,
                statementId: Id
            });

            return result;
        } catch (error) {
            const duration = Date.now() - startTime;

            logger.error('Query failed', {
                duration,
                error,
                sql: sql.substring(0, 200)
            });
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(`Redshift query failed: ${message}`);
        }
    }

    /**
     * Test connection to Redshift.
     *
     * @returns {Promise<boolean>} True if connection successful
     */
    async testConnection(): Promise<boolean> {
        try {
            const result = await this.executeQuery('SELECT 1 as test');

            return result.rows.length === 1;
        } catch (error) {
            logger.error('Connection test failed', { error });

            return false;
        }
    }

    /**
     * Close client (cleanup method for consistency with pg-based service).
     * Redshift Data API is stateless, so this is a no-op.
     */
    async disconnect(): Promise<void> {
        logger.info('RedshiftDataAPIService disconnect called (no-op for Data API)');
    }
}

export default RedshiftDataAPIService;
