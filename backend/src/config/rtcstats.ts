/**
 * RTCStats Configuration
 * Configuration for RTCStats native integration (Redshift Data API + S3)
 * Uses IAM authentication (IRSA in Kubernetes) - no passwords required
 *
 * DEV_MODE=true: Enables environment switching (pilot/prod) for local development
 * DEV_MODE=false: Single environment deployment (production mode)
 */

import * as path from 'path';

import { RTCStatsEnvironment } from '../../../shared/types/rtcstats';

export interface IRTCStatsConfig {
    aws: {
        accessKeyId?: string;
        region: string;
        s3: {
            // Environment-specific S3 buckets (devMode=true) or single bucket (devMode=false)
            buckets: {
                pilot: string;
                prod: string;
            };
            endpoint?: string;
        };
        secretAccessKey?: string;
    };
    cleanupAfterDays: number;
    devMode: boolean; // Enable environment switching for development
    downloadTimeout: number;
    downloadsPath: string;
    dynamodb: {
        region: string;
        // Environment-specific tables (devMode=true) or single table (devMode=false)
        tables: {
            pilot: string;
            prod: string;
        };
    };
    maxConcurrentDownloads: number;
    redshift?: {
        // Environment-specific clusters (devMode=true) or single cluster (devMode=false)
        clusters: {
            pilot: {
                clusterIdentifier: string;
                database: string;
                region: string;
                workgroupName?: string;
            };
            prod: {
                clusterIdentifier: string;
                database: string;
                region: string;
                workgroupName?: string;
            };
        };
        region: string;
    };
    retryAttempts: number;
    retryDelay: number; // milliseconds
    useDynamoDB: boolean; // Use DynamoDB for metadata queries (like rtc-visualizer)
}

// Helper to check if we're in development mode
const isDevMode = process.env.DEV_MODE === 'true';

// Helper to load S3 buckets based on mode
function loadS3Buckets() {
    if (isDevMode) {
        // Dev mode: Use environment-specific buckets
        return {
            pilot: process.env.RTCSTATS_S3_BUCKET_PILOT || '',
            prod: process.env.RTCSTATS_S3_BUCKET_PROD || ''
        };
    } else {
        // Prod mode: Use generic bucket for both (deployment determines which environment)
        const genericBucket = process.env.RTCSTATS_S3_BUCKET || '';

        return {
            pilot: genericBucket,
            prod: genericBucket
        };
    }
}

// Helper to load DynamoDB tables based on mode
function loadDynamoDBTables() {
    if (isDevMode) {
        // Dev mode: Use environment-specific tables
        return {
            pilot: process.env.RTCSTATS_DYNAMODB_TABLE_PILOT || '',
            prod: process.env.RTCSTATS_DYNAMODB_TABLE_PROD || ''
        };
    } else {
        // Prod mode: Use generic table for both (deployment determines which environment)
        const genericTable = process.env.RTCSTATS_DYNAMODB_TABLE || '';

        return {
            pilot: genericTable,
            prod: genericTable
        };
    }
}

// Helper to load Redshift clusters based on mode
function loadRedshiftClusters() {
    const region = process.env.AWS_REGION || 'us-east-1';

    if (isDevMode) {
        // Dev mode: Use environment-specific clusters
        const pilotCluster = process.env.RTCSTATS_REDSHIFT_CLUSTER_ID_PILOT;
        const prodCluster = process.env.RTCSTATS_REDSHIFT_CLUSTER_ID_PROD;

        if (!pilotCluster && !prodCluster) {
            return undefined;
        }

        return {
            clusters: {
                pilot: {
                    clusterIdentifier: pilotCluster || '',
                    database: process.env.RTCSTATS_REDSHIFT_DATABASE_PILOT || 'rtcstats',
                    region,
                    workgroupName: process.env.RTCSTATS_REDSHIFT_WORKGROUP_PILOT
                },
                prod: {
                    clusterIdentifier: prodCluster || '',
                    database: process.env.RTCSTATS_REDSHIFT_DATABASE_PROD || 'rtcstats',
                    region,
                    workgroupName: process.env.RTCSTATS_REDSHIFT_WORKGROUP_PROD
                }
            },
            region
        };
    } else {
        // Prod mode: Use generic cluster for both (deployment determines which environment)
        const genericCluster = process.env.RTCSTATS_REDSHIFT_CLUSTER_ID;

        if (!genericCluster) {
            return undefined;
        }

        const clusterConfig = {
            clusterIdentifier: genericCluster,
            database: process.env.RTCSTATS_REDSHIFT_DATABASE || 'rtcstats',
            region,
            workgroupName: process.env.RTCSTATS_REDSHIFT_WORKGROUP
        };

        return {
            clusters: {
                pilot: clusterConfig,
                prod: clusterConfig
            },
            region
        };
    }
}

export const rtcstatsConfig: IRTCStatsConfig = {
    aws: {
        // Optional: Only set if not using IRSA (Kubernetes IAM roles)
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        region: process.env.AWS_REGION || 'us-east-1',
        s3: {
            buckets: loadS3Buckets(),
            endpoint: process.env.RTCSTATS_S3_ENDPOINT
        },
        // Optional: Only set if not using IRSA (Kubernetes IAM roles)
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    cleanupAfterDays: parseInt(process.env.RTCSTATS_CLEANUP_DAYS || '7'),
    devMode: isDevMode,
    downloadTimeout: parseInt(process.env.RTCSTATS_TIMEOUT || '600000'), // 10 minutes
    downloadsPath: process.env.RTCSTATS_DOWNLOADS_PATH || path.join(process.cwd(), '..', 'rtcstats-downloads'),
    dynamodb: {
        region: process.env.AWS_REGION || 'us-east-1',
        tables: loadDynamoDBTables()
    },
    maxConcurrentDownloads: parseInt(process.env.RTCSTATS_MAX_DOWNLOADS || '3'),
    redshift: loadRedshiftClusters(),
    retryAttempts: parseInt(process.env.RTCSTATS_RETRY_ATTEMPTS || '3'),
    retryDelay: parseInt(process.env.RTCSTATS_RETRY_DELAY || '5000'), // 5 seconds
    // Default to DynamoDB for metadata queries (same as rtc-visualizer)
    // Set RTCSTATS_USE_DYNAMODB='false' to use Redshift instead
    useDynamoDB: process.env.RTCSTATS_USE_DYNAMODB !== 'false'
};

export default rtcstatsConfig;
