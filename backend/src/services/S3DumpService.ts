/**
 * S3 Dump Service
 * Direct integration with AWS S3 for conference dump downloads
 * Uses IAM authentication (IRSA in Kubernetes) - no credentials required
 * Replaces rtcstats-cli shell script calls for S3 operations
 */

import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { getLogger } from '@jitsi/logger';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

const logger = getLogger('backend/src/services/S3DumpService');

export interface IS3Config {
    accessKeyId?: string;
    bucket: string; // Specific bucket for this service instance
    endpoint?: string;
    region: string;
    secretAccessKey?: string;
}

export interface IDumpFileInfo {
    key: string;
    lastModified?: Date;
    size?: number;
}

export interface IDownloadProgress {
    bytesDownloaded: number;
    conferenceId: string;
    currentFile: string;
    filesCompleted: number;
    status: 'downloading' | 'completed' | 'failed';
    totalFiles: number;
}

/**
 * Service for downloading RTCStats conference dumps from S3.
 * Uses AWS SDK with IAM authentication (no hardcoded credentials needed).
 * Provides direct S3 access instead of shelling out to rtcstats-cli.
 */
export class S3DumpService {
    private s3Client: S3Client;

    /**
     * Initialize the S3 client.
     * If credentials not provided, AWS SDK uses default credential provider chain (IRSA).
     *
     * @param {IS3Config} config - S3 connection configuration
     */
    constructor(private config: IS3Config) {
        logger.info('Initializing S3DumpService', {
            bucket: config.bucket,
            endpoint: config.endpoint,
            region: config.region,
            usingExplicitCredentials: !!(config.accessKeyId && config.secretAccessKey)
        });

        const clientConfig: any = {
            endpoint: config.endpoint,
            region: config.region
        };

        // Only set explicit credentials if provided
        // Otherwise AWS SDK uses default credential provider chain (IRSA in Kubernetes)
        if (config.accessKeyId && config.secretAccessKey) {
            clientConfig.credentials = {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey
            };
            logger.info('Using explicit AWS credentials');
        } else {
            logger.info('Using AWS default credential provider chain (IRSA)');
        }

        this.s3Client = new S3Client(clientConfig);
    }

    /**
     * Check if a dump file exists in S3.
     *
     * @param {string} key - S3 object key
     * @returns {Promise<boolean>} True if file exists
     */
    async fileExists(key: string): Promise<boolean> {
        try {
            const command = new HeadObjectCommand({
                Bucket: this.config.bucket,
                Key: key
            });

            await this.s3Client.send(command);

            return true;
        } catch (error: any) {
            if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
                return false;
            }
            logger.error('Error checking file existence', { error, key });
            throw error;
        }
    }

    /**
     * List all dump files for a conference.
     *
     * @param {string} conferenceId - Conference unique identifier
     * @param {string} prefix - S3 prefix/folder (e.g., 'prod/', 'pilot/')
     * @returns {Promise<IDumpFileInfo[]>} Array of dump file info
     */
    async listConferenceDumps(
            conferenceId: string,
            prefix = ''
    ): Promise<IDumpFileInfo[]> {
        const fullPrefix = `${prefix}${conferenceId}/`;

        logger.info('Listing conference dumps', { conferenceId, fullPrefix });

        try {
            const command = new ListObjectsV2Command({
                Bucket: this.config.bucket,
                Prefix: fullPrefix
            });

            const response = await this.s3Client.send(command);

            if (!response.Contents || response.Contents.length === 0) {
                logger.warn('No dumps found for conference', { conferenceId });

                return [];
            }

            const dumps = response.Contents
                .filter(obj => obj.Key?.endsWith('.ndjson'))
                .map(obj => ({
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    key: obj.Key!,
                    lastModified: obj.LastModified,
                    size: obj.Size
                }));

            logger.info('Conference dumps listed', {
                conferenceId,
                count: dumps.length
            });

            return dumps;
        } catch (error) {
            logger.error('Failed to list conference dumps', { conferenceId, error });
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(`Failed to list dumps: ${message}`);
        }
    }

    /**
     * Download a single dump file from S3.
     *
     * @param {string} key - S3 object key
     * @param {string} destination - Local file path to save
     * @returns {Promise<void>}
     */
    async downloadFile(key: string, destination: string): Promise<void> {
        logger.debug('Downloading file', { destination, key });

        try {
            const command = new GetObjectCommand({
                Bucket: this.config.bucket,
                Key: key
            });

            const response = await this.s3Client.send(command);

            if (!response.Body) {
                throw new Error('Empty response body from S3');
            }

            // Ensure destination directory exists
            const dir = path.dirname(destination);

            await fs.promises.mkdir(dir, { recursive: true });

            // Write stream to file
            const writeStream = fs.createWriteStream(destination);
            const readStream = response.Body as Readable;

            await new Promise<void>((resolve, reject) => {
                readStream.pipe(writeStream);
                writeStream.on('finish', () => resolve());
                writeStream.on('error', reject);
                readStream.on('error', reject);
            });

            logger.debug('File downloaded successfully', { destination, key });
        } catch (error) {
            logger.error('Failed to download file', { destination, error, key });
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(`Failed to download ${key}: ${message}`);
        }
    }

    /**
     * Download all dumps for a conference using dump IDs.
     * Files are stored flat in S3 bucket root with filenames from dumpId field
     *
     * @param {string[]} dumpIds - Array of dump IDs from DynamoDB (already includes .gz extension)
     * @param {string} conferenceId - Conference unique identifier (for folder naming)
     * @param {string} downloadPath - Local directory to save dumps
     * @param {Function} onProgress - Progress callback
     * @returns {Promise<string>} Path to downloaded dumps directory
     */
    async downloadConferenceDumpsByIds(
            dumpIds: string[],
            conferenceId: string,
            downloadPath: string,
            onProgress?: (progress: IDownloadProgress) => void
    ): Promise<string> {
        logger.info('Downloading conference dumps by IDs', {
            conferenceId,
            downloadPath,
            dumpCount: dumpIds.length
        });

        try {
            if (dumpIds.length === 0) {
                throw new Error(`No dump IDs provided for conference: ${conferenceId}`);
            }

            const conferenceDir = path.join(downloadPath, conferenceId);

            await fs.promises.mkdir(conferenceDir, { recursive: true });

            let filesCompleted = 0;
            const bytesDownloaded = 0;
            const missingFiles: string[] = [];
            const failedFiles: Array<{ error: string; file: string; }> = [];

            // Download each dump file by ID
            // Files are stored flat in S3, dumpId already includes .gz extension
            for (const dumpId of dumpIds) {
                const key = dumpId; // Use dumpId directly as S3 key
                let downloaded = false;

                try {
                    const exists = await this.fileExists(key);

                    if (exists) {
                        const fileName = path.basename(key);
                        const destination = path.join(conferenceDir, fileName);

                        // Report progress
                        if (onProgress) {
                            onProgress({
                                bytesDownloaded,
                                conferenceId,
                                currentFile: fileName,
                                filesCompleted,
                                status: 'downloading',
                                totalFiles: dumpIds.length
                            });
                        }

                        await this.downloadFile(key, destination);

                        filesCompleted++;
                        downloaded = true;

                        logger.debug('File download progress', {
                            fileName,
                            filesCompleted,
                            totalFiles: dumpIds.length
                        });
                    } else {
                        // File doesn't exist in S3
                        missingFiles.push(dumpId);
                        logger.warn(`Dump file not found in S3: ${dumpId}`);
                    }
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);

                    failedFiles.push({ error: errorMsg, file: key });
                    logger.error(`Failed to download ${key}:`, { error: errorMsg });
                }

                if (!downloaded && !missingFiles.includes(dumpId)) {
                    missingFiles.push(dumpId);
                }
            }

            // Check if too many files are missing
            const missingPercentage = (missingFiles.length + failedFiles.length) / dumpIds.length * 100;

            if (missingPercentage > 50) {
                logger.error('More than 50% of dump files are missing or failed', {
                    conferenceId,
                    failedFiles: failedFiles.length,
                    missingFiles: missingFiles.length,
                    requested: dumpIds.length,
                    successful: filesCompleted
                });
                throw new Error(
                    `Failed to download conference: ${missingFiles.length} files missing, ${failedFiles.length} files failed out of ${dumpIds.length} total`
                );
            }

            if (missingFiles.length > 0 || failedFiles.length > 0) {
                logger.warn('Some dump files were not downloaded', {
                    conferenceId,
                    failedCount: failedFiles.length,
                    failedFiles: failedFiles.slice(0, 5), // Show first 5 failed files
                    missingCount: missingFiles.length,
                    missingFiles: missingFiles.slice(0, 5), // Show first 5 missing files
                    successfulCount: filesCompleted
                });
            }

            // Report completion
            if (onProgress) {
                onProgress({
                    bytesDownloaded,
                    conferenceId,
                    currentFile: '',
                    filesCompleted,
                    status: 'completed',
                    totalFiles: dumpIds.length
                });
            }

            const downloadSummary = {
                conferenceDir,
                conferenceId,
                failedFiles: failedFiles.length,
                fileCount: filesCompleted,
                missingFiles: missingFiles.length,
                requested: dumpIds.length
            };

            if (missingFiles.length === 0 && failedFiles.length === 0) {
                logger.info('Conference dumps downloaded successfully', downloadSummary);
            } else {
                logger.warn('Conference dumps downloaded with some failures', downloadSummary);
            }

            return conferenceDir;
        } catch (error) {
            logger.error('Failed to download conference dumps', { conferenceId, error });

            if (onProgress) {
                onProgress({
                    bytesDownloaded: 0,
                    conferenceId,
                    currentFile: '',
                    filesCompleted: 0,
                    status: 'failed',
                    totalFiles: 0
                });
            }

            const message = error instanceof Error ? error.message : String(error);

            throw new Error(`Failed to download conference dumps: ${message}`);
        }
    }

    /**
     * Download a single session dump.
     * Equivalent to: rtcstats.sh download-session-dump <session-id>
     *
     * @param {string} sessionId - Session identifier
     * @param {string} conferenceId - Conference unique identifier
     * @param {string} downloadPath - Local directory to save dump
     * @param {string} prefix - S3 prefix/folder
     * @returns {Promise<string>} Path to downloaded dump file
     */
    async downloadSessionDump(
            sessionId: string,
            conferenceId: string,
            downloadPath: string,
            prefix = ''
    ): Promise<string> {
        logger.info('Downloading session dump', { conferenceId, sessionId });

        try {
            // S3 key format: <prefix><conferenceId>/<sessionId>.ndjson
            const key = `${prefix}${conferenceId}/${sessionId}.ndjson`;

            // Check if file exists
            const exists = await this.fileExists(key);

            if (!exists) {
                throw new Error(`Session dump not found: ${sessionId}`);
            }

            const conferenceDir = path.join(downloadPath, conferenceId);

            await fs.promises.mkdir(conferenceDir, { recursive: true });

            const destination = path.join(conferenceDir, `${sessionId}.ndjson`);

            await this.downloadFile(key, destination);

            logger.info('Session dump downloaded successfully', {
                destination,
                sessionId
            });

            return destination;
        } catch (error) {
            logger.error('Failed to download session dump', { error, sessionId });
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(`Failed to download session dump: ${message}`);
        }
    }

    /**
     * Get file stream from S3 without downloading to disk.
     * Useful for streaming processing.
     *
     * @param {string} key - S3 object key
     * @returns {Promise<Readable>} Readable stream
     */
    async getFileStream(key: string): Promise<Readable> {
        try {
            const command = new GetObjectCommand({
                Bucket: this.config.bucket,
                Key: key
            });

            const response = await this.s3Client.send(command);

            if (!response.Body) {
                throw new Error('Empty response body from S3');
            }

            return response.Body as Readable;
        } catch (error) {
            logger.error('Failed to get file stream', { error, key });
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(`Failed to get stream: ${message}`);
        }
    }

    /**
     * Delete local downloaded dumps for a conference.
     * Cleanup utility to free disk space.
     *
     * @param {string} conferenceId - Conference unique identifier
     * @param {string} downloadPath - Base download directory
     * @returns {Promise<void>}
     */
    async cleanupConferenceDumps(
            conferenceId: string,
            downloadPath: string
    ): Promise<void> {
        const conferenceDir = path.join(downloadPath, conferenceId);

        try {
            await fs.promises.rm(conferenceDir, { force: true, recursive: true });
            logger.info('Conference dumps cleaned up', { conferenceDir, conferenceId });
        } catch (error) {
            logger.error('Failed to cleanup conference dumps', { conferenceId, error });
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(`Failed to cleanup dumps: ${message}`);
        }
    }
}

export default S3DumpService;
