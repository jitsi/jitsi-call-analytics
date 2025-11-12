/**
 * RTCStats Configuration
 * Configuration for RTCStats native integration (Redshift Data API + S3)
 * Uses IAM authentication (IRSA in Kubernetes) - no passwords required
 */

import * as path from 'path';

import { RTCStatsEnvironment } from '../../../shared/types/rtcstats';

export interface IRTCStatsConfig {
    aws: {
        accessKeyId?: string;
        region: string;
        s3: {
            // Support environment-specific S3 buckets
            buckets: {
                pilot: string;
                prod: string;
            };
            endpoint?: string;
        };
        secretAccessKey?: string;
    };
    cleanupAfterDays: number;
    downloadTimeout: number;
    downloadsPath: string;
    dynamodb: {
        region: string;
        // Support environment-specific table names
        tables: {
            pilot: string;
            prod: string;
        };
    };
    environment: 'prod' | 'pilot';
    maxConcurrentDownloads: number;
    redshift?: {
        clusterIdentifier: string;
        database: string;
        region: string;
        workgroupName?: string;
    };
    retryAttempts: number;
    retryDelay: number; // milliseconds
    useDynamoDB: boolean; // Use DynamoDB for metadata queries (like rtc-visualizer)
}

export const rtcstatsConfig: IRTCStatsConfig = {
    aws: {
        // Optional: Only set if not using IRSA (Kubernetes IAM roles)
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        region: process.env.AWS_REGION || 'us-east-1',
        s3: {
            buckets: {
                pilot: process.env.RTCSTATS_S3_BUCKET_PILOT || process.env.RTCSTATS_S3_BUCKET || '',
                prod: process.env.RTCSTATS_S3_BUCKET_PROD || process.env.RTCSTATS_S3_BUCKET || ''
            },
            endpoint: process.env.RTCSTATS_S3_ENDPOINT
        },
        // Optional: Only set if not using IRSA (Kubernetes IAM roles)
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    cleanupAfterDays: parseInt(process.env.RTCSTATS_CLEANUP_DAYS || '7'),
    downloadTimeout: parseInt(process.env.RTCSTATS_TIMEOUT || '600000'), // 10 minutes
    downloadsPath: process.env.RTCSTATS_DOWNLOADS_PATH || path.join(process.cwd(), '..', 'rtcstats-downloads'),
    dynamodb: {
        region: process.env.AWS_REGION || 'us-east-1',
        tables: {
            pilot: process.env.RTCSTATS_DYNAMODB_TABLE_PILOT || '',
            prod: process.env.RTCSTATS_DYNAMODB_TABLE_PROD || ''
        }
    },
    environment: (process.env.RTCSTATS_ENV as RTCStatsEnvironment) || 'prod',
    maxConcurrentDownloads: parseInt(process.env.RTCSTATS_MAX_DOWNLOADS || '3'),
    redshift: process.env.RTCSTATS_REDSHIFT_CLUSTER_ID ? {
        clusterIdentifier: process.env.RTCSTATS_REDSHIFT_CLUSTER_ID,
        database: process.env.RTCSTATS_REDSHIFT_DATABASE || 'rtcstats',
        region: process.env.AWS_REGION || 'us-east-1',
        workgroupName: process.env.RTCSTATS_REDSHIFT_WORKGROUP
    } : undefined,
    retryAttempts: parseInt(process.env.RTCSTATS_RETRY_ATTEMPTS || '3'),
    retryDelay: parseInt(process.env.RTCSTATS_RETRY_DELAY || '5000'), // 5 seconds
    // Default to DynamoDB for metadata queries (same as rtc-visualizer)
    // Set RTCSTATS_USE_DYNAMODB='false' to use Redshift instead
    useDynamoDB: process.env.RTCSTATS_USE_DYNAMODB !== 'false'
};

export default rtcstatsConfig;
