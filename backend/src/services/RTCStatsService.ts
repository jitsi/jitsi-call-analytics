/**
 * RTCStats Service
 * Orchestrates RTCStats operations using native AWS integration
 */

import { getLogger } from '@jitsi/logger';
import { execSync } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';

import {
    ConferenceSearchResult,
    DownloadResult,
    DownloadStatus,
    RTCStatsEnvironment
} from '../../../shared/types/rtcstats';
import { rtcstatsConfig } from '../config/rtcstats';

import { RTCStatsDataService } from './RTCStatsDataService';
import { S3DumpService } from './S3DumpService';

const logger = getLogger('backend/src/services/RTCStatsService');

export class RTCStatsService {
    private dataService: RTCStatsDataService;
    private downloadsPath: string;
    private downloadStatuses: Map<string, DownloadStatus> = new Map();
    private activeDownloads: Set<string> = new Set();
    private s3Services: Map<string, S3DumpService> = new Map();

    constructor() {
        this.downloadsPath = rtcstatsConfig.downloadsPath;

        // Pass full config to RTCStatsDataService to support DynamoDB or Redshift
        this.dataService = new RTCStatsDataService({
            dynamodb: rtcstatsConfig.dynamodb,
            redshift: rtcstatsConfig.redshift,
            useDynamoDB: rtcstatsConfig.useDynamoDB
        });

        this.ensureDownloadsDirectory();

        // Initialize data service connection
        const dataSource = rtcstatsConfig.useDynamoDB ? 'DynamoDB' : 'Redshift';

        this.dataService.connect().catch(error => {
            logger.error(`Failed to connect to ${dataSource} on initialization:`, error);
        });
    }

    /**
     * Check if app type is a client/participant (not a backend component)
     * @param app App type from session metadata
     * @returns True if it's a client (Jitsi Meet, 8x8 Work, etc.), false if backend (JVB, Jicofo)
     */
    private isClientApp(app?: string): boolean {
        if (!app) {
            return false;
        }
        // Backend components
        const backendComponents = [ 'JVB', 'Jicofo' ];

        return !backendComponents.includes(app);
    }

    /**
     * Format duration in milliseconds to human readable format
     * @param durationMs Duration in milliseconds
     * @returns Formatted string like "1h 23m", "45m", "2h 5m", or "< 1m"
     */
    private formatDuration(durationMs?: number): string {
        if (!durationMs || durationMs < 0) {
            return 'N/A';
        }

        const totalMinutes = Math.floor(durationMs / (1000 * 60));

        if (totalMinutes < 1) {
            return '< 1m';
        }

        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        if (hours > 0) {
            return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
        }

        return `${minutes}m`;
    }

    /**
     * Get or create S3 service for environment
     */
    private getS3Service(environment: RTCStatsEnvironment): S3DumpService {
        if (!this.s3Services.has(environment)) {
            // Select the correct S3 bucket based on environment
            const bucket = environment === RTCStatsEnvironment.PROD
                ? rtcstatsConfig.aws.s3.buckets.prod
                : rtcstatsConfig.aws.s3.buckets.pilot;

            logger.debug(`Creating S3 service for ${environment} environment`, { bucket });

            const s3Service = new S3DumpService({
                accessKeyId: rtcstatsConfig.aws.accessKeyId,
                bucket,
                endpoint: rtcstatsConfig.aws.s3.endpoint,
                region: rtcstatsConfig.aws.region,
                secretAccessKey: rtcstatsConfig.aws.secretAccessKey
            });

            this.s3Services.set(environment, s3Service);
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.s3Services.get(environment)!;
    }

    /**
     * Ensure downloads directory structure exists
     */
    private async ensureDownloadsDirectory(): Promise<void> {
        try {
            await fs.ensureDir(path.join(this.downloadsPath, 'prod'));
            await fs.ensureDir(path.join(this.downloadsPath, 'pilot'));
            logger.info(`RTCStats downloads directory initialized: ${this.downloadsPath}`);
        } catch (error) {
            logger.error('Failed to create downloads directory:', error);
            throw error;
        }
    }

    /**
     * Update download status
     */
    private updateDownloadStatus(conferenceId: string, updates: Partial<DownloadStatus>): void {
        const existing = this.downloadStatuses.get(conferenceId);

        if (existing) {
            const updated = { ...existing, ...updates };

            this.downloadStatuses.set(conferenceId, updated);
        }
    }

    /**
     * Search for conferences matching the given pattern
     */
    async searchConferences(
            pattern: string,
            environment: RTCStatsEnvironment = RTCStatsEnvironment.PROD,
            startDate?: Date,
            endDate?: Date
    ): Promise<ConferenceSearchResult[]> {
        const startTime = Date.now();

        try {
            // Strip https:// from the pattern
            const cleanedPattern = pattern.replace(/^https?:\/\//, '');

            logger.debug(`RTCStats search: pattern="${cleanedPattern}" env=${environment}`, {
                endDate: endDate?.toISOString(),
                startDate: startDate?.toISOString()
            });

            // Calculate max age days from date range
            const maxAgeDays = startDate
                ? Math.ceil((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24))
                : 30;

            // Search using native DynamoDB/Redshift integration
            // Note: Each record returned is a participant/component session, not a conference
            // Pass environment to query the correct DynamoDB table
            const sessions = await this.dataService.searchConferences(cleanedPattern, maxAgeDays, environment);

            logger.debug(`Retrieved ${sessions.length} session records from database`);

            // Group by sessionId to get unique conferences
            // sessionId is the conference UUID - multiple participants share the same sessionId
            const conferenceMap = new Map<string, {
                componentCount: number;
                conferenceUrl: string;
                earliestStartMs: number;
                latestEndMs: number;
                participantCount: number;
                sessionId: string;
            }>();

            for (const session of sessions) {
                const sessionId = session.statsSessionId; // This is the conference sessionId
                const startMs = session.sessionStartTime?.getTime() || session.createDate.getTime();
                const endMs = session.sessionEndTime?.getTime() || session.createDate.getTime();

                if (!conferenceMap.has(sessionId)) {
                    // First record for this conference
                    conferenceMap.set(sessionId, {
                        componentCount: 0,
                        conferenceUrl: session.meetingUrl,
                        earliestStartMs: startMs,
                        latestEndMs: endMs,
                        participantCount: 0,
                        sessionId
                    });
                }

                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const conf = conferenceMap.get(sessionId)!;

                // Update earliest start time
                if (startMs < conf.earliestStartMs) {
                    conf.earliestStartMs = startMs;
                }

                // Update latest end time
                if (endMs > conf.latestEndMs) {
                    conf.latestEndMs = endMs;
                }

                // Count actual participants (all clients: Jitsi Meet, 8x8 Work, etc. - excluding JVB and Jicofo)
                if (this.isClientApp(session.app)) {
                    conf.participantCount++;
                }
                // Count all components (participants + JVB + Jicofo)
                conf.componentCount++;
            }

            logger.debug(`Grouped into ${conferenceMap.size} unique conferences`);

            // Map to ConferenceSearchResult format
            let results: ConferenceSearchResult[] = Array.from(conferenceMap.values()).map(conf => {
                const durationMs = conf.latestEndMs - conf.earliestStartMs;

                return {
                    conferenceId: conf.sessionId, // Use sessionId (UUID) as conferenceId
                    duration: durationMs,
                    durationFormatted: this.formatDuration(durationMs),
                    environment,
                    participantCount: conf.participantCount, // Actual participants only (Jitsi Meet clients)
                    searchPattern: pattern,
                    timestamp: new Date(conf.earliestStartMs)
                };
            });

            // Filter by date range if provided
            if (startDate || endDate) {
                results = results.filter(result => {
                    if (!result.timestamp) return false;

                    const resultTime = result.timestamp.getTime();

                    if (startDate && resultTime < startDate.getTime()) return false;
                    if (endDate && resultTime > endDate.getTime()) return false;

                    return true;
                });

                logger.debug(`Date filtering: ${sessions.length} sessions -> ${results.length} unique conferences`);
            }

            // Sort by timestamp descending (newest first)
            results.sort((a, b) => {
                const timeA = a.timestamp?.getTime() || 0;
                const timeB = b.timestamp?.getTime() || 0;

                return timeB - timeA; // Descending order
            });

            const searchTime = Date.now() - startTime;

            logger.debug(`RTCStats search completed: Found ${results.length} conferences in ${searchTime}ms`);

            return results;

        } catch (error) {
            logger.error(`RTCStats search failed for pattern "${pattern}":`, error);
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(`Conference search failed: ${message}`);
        }
    }

    /**
     * Get download status for a conference
     */
    getDownloadStatus(conferenceId: string): DownloadStatus | null {
        return this.downloadStatuses.get(conferenceId) || null;
    }

    /**
     * Get all download statuses
     */
    getAllDownloadStatuses(): DownloadStatus[] {
        return Array.from(this.downloadStatuses.values());
    }

    /**
     * Download conference dumps using native S3 integration
     */
    async downloadConference(
            conferenceId: string,
            environment: RTCStatsEnvironment = RTCStatsEnvironment.PROD
    ): Promise<DownloadResult> {
        const startTime = Date.now();
        const downloadKey = `${environment}-${conferenceId}`;

        // Check if already downloading
        if (this.activeDownloads.has(downloadKey)) {
            throw new Error(`Conference ${conferenceId} is already being downloaded`);
        }

        // Check concurrent download limit
        if (this.activeDownloads.size >= rtcstatsConfig.maxConcurrentDownloads) {
            throw new Error('Maximum concurrent downloads reached. Please try again later.');
        }

        const downloadDir = path.join(this.downloadsPath, environment, conferenceId);

        // Initialize download status
        const downloadStatus: DownloadStatus = {
            conferenceId,
            environment,
            progress: 0,
            startTime: new Date(),
            status: 'pending'
        };

        this.downloadStatuses.set(conferenceId, downloadStatus);
        this.activeDownloads.add(downloadKey);

        try {
            await fs.ensureDir(downloadDir);

            logger.debug(`RTCStats download: conferenceId=${conferenceId} env=${environment} dir=${downloadDir}`);

            // Update status to downloading
            this.updateDownloadStatus(conferenceId, {
                downloadPath: downloadDir,
                status: 'downloading'
            });

            // Query DynamoDB to get all sessions for this conference
            // conferenceId is the sessionId (UUID) from the search results
            logger.debug('Querying DynamoDB for conference sessions', { conferenceId });

            let allSessions: any[] = [];

            // Check if it's a UUID (sessionId) - has dashes in UUID format
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conferenceId);

            if (isUUID) {
                // Query by sessionId to get ALL records for this specific conference session
                logger.debug('Detected UUID, querying by sessionId', { conferenceId, environment });
                allSessions = await this.dataService.getConferenceBySessionId(conferenceId, environment);
                logger.debug(`Found ${allSessions.length} components for this conference session`);
            } else {
                // It's a conference name or URL, search directly
                logger.debug('Querying by conference name/URL', { conferenceId, environment });
                allSessions = await this.dataService.searchConferences(conferenceId, 90, environment);
            }

            if (allSessions.length === 0) {
                throw new Error(`No sessions found for conference: ${conferenceId}`);
            }

            // Extract unique dumpIds from all sessions
            // dumpId is the actual S3 filename including .gz extension
            logger.debug('Sample session data (first 3):', {
                samples: allSessions.slice(0, 3).map(s => ({
                    displayName: s.displayName,
                    dumpId: s.dumpId,
                    meetingUrl: s.meetingUrl,
                    sessionId: s.statsSessionId
                }))
            });

            // Use dumpId which includes the .gz extension already
            const dumpIds = [ ...new Set(allSessions.map(s => s.dumpId).filter(Boolean)) ];

            logger.debug(`Found ${dumpIds.length} dump files for conference`, {
                conferenceId,
                dumpIds: dumpIds.slice(0, 10), // Log first 10 for debugging
                sessionCount: allSessions.length
            });

            if (dumpIds.length === 0) {
                throw new Error(`No dump IDs found for conference: ${conferenceId}`);
            }

            const s3Service = this.getS3Service(environment);

            // Download using dump IDs (files stored flat in S3)
            const actualDownloadPath = await s3Service.downloadConferenceDumpsByIds(
                dumpIds,
                conferenceId,
                path.join(this.downloadsPath, environment),
                progress => {
                    const progressPercent = Math.floor((progress.filesCompleted / progress.totalFiles) * 100);

                    this.updateDownloadStatus(conferenceId, {
                        fileCount: progress.totalFiles,
                        progress: progressPercent
                    });
                }
            );

            // Get list of downloaded files
            const files = await fs.readdir(actualDownloadPath);
            const duration = Date.now() - startTime;

            // Decompress .gz files for DumpProcessor
            logger.debug('Decompressing downloaded .gz files...');
            const gzFiles = files.filter(f => f.endsWith('.gz'));

            for (const gzFile of gzFiles) {
                const gzPath = path.join(actualDownloadPath, gzFile);
                const jsonPath = gzPath.replace('.gz', '.json');

                try {
                    // Use gunzip to decompress the file
                    execSync(`gunzip -c "${gzPath}" > "${jsonPath}"`, { stdio: 'pipe' });
                    logger.debug(`Decompressed ${gzFile} -> ${path.basename(jsonPath)}`);

                    // Remove the .gz file after successful decompression
                    await fs.unlink(gzPath);
                } catch (error) {
                    logger.warn(`Failed to decompress ${gzFile}:`, error);
                }
            }

            // Re-read directory after decompression
            const decompressedFiles = await fs.readdir(actualDownloadPath);

            // Extract console logs from .json files into .txt files (same as rtcstats-cli)
            logger.debug('Extracting console logs from dump files...');
            const jsonFiles = decompressedFiles.filter(f => f.endsWith('.json'));

            for (const jsonFile of jsonFiles) {
                const jsonPath = path.join(actualDownloadPath, jsonFile);
                const txtPath = jsonPath.replace('.json', '.txt');

                try {
                    // Extract console logs using jq (same as rtcstats-cli)
                    // Command: cat "$JSON_FILE" | jq -r '. | select(type == "array" and length != 0) | select(.[0] == "logs") | .[2][] | .text'
                    execSync(
                        `cat "${jsonPath}" | jq -r '. | select(type == "array" and length != 0) | select(.[0] == "logs") | .[2][] | .text' > "${txtPath}"`,
                        { stdio: 'pipe' }
                    );
                    logger.debug(`Extracted console logs from ${jsonFile} -> ${path.basename(txtPath)}`);
                } catch (error) {
                    logger.warn(`Failed to extract console logs from ${jsonFile}:`, error);
                }
            }

            // Validate files
            let validFiles = 0;
            const emptyFiles: string[] = [];

            for (const file of decompressedFiles) {
                // Check for .ndjson or .json files (after decompression)
                if (file.endsWith('.ndjson') || file.endsWith('.json')) {
                    const filePath = path.join(actualDownloadPath, file);
                    const stats = await fs.stat(filePath);

                    if (stats.size > 0) {
                        validFiles++;
                    } else {
                        emptyFiles.push(file);
                    }
                }
            }

            logger.debug(`Validation: ${validFiles} valid files, ${emptyFiles.length} empty files`);

            if (validFiles === 0) {
                throw new Error('Downloaded files are empty or no valid dump files found.');
            }

            const result: DownloadResult = {
                conferenceId,
                downloadPath: actualDownloadPath,
                duration,
                environment,
                files,
                success: true
            };

            // Update final status
            this.updateDownloadStatus(conferenceId, {
                endTime: new Date(),
                fileCount: files.length,
                progress: 100,
                status: 'completed'
            });

            this.activeDownloads.delete(downloadKey);

            logger.info(`RTCStats download success: conferenceId=${conferenceId} files=${validFiles}/${files.length} duration=${duration}ms`);

            return result;

        } catch (error) {
            this.activeDownloads.delete(downloadKey);
            const errorMsg = error instanceof Error ? error.message : String(error);

            this.updateDownloadStatus(conferenceId, {
                endTime: new Date(),
                error: errorMsg,
                status: 'failed'
            });

            logger.error(`RTCStats download failed for ${conferenceId}:`, error);
            throw error;
        }
    }

    /**
     * Cancel download
     */
    async cancelDownload(conferenceId: string, environment: RTCStatsEnvironment): Promise<boolean> {
        const downloadKey = `${environment}-${conferenceId}`;

        if (!this.activeDownloads.has(downloadKey)) {
            return false;
        }

        this.activeDownloads.delete(downloadKey);
        this.updateDownloadStatus(conferenceId, {
            endTime: new Date(),
            status: 'cancelled'
        });

        logger.info(`RTCStats download cancelled for ${conferenceId}`);

        return true;
    }

    /**
     * Check if conference is downloaded and ready for analysis
     * A conference is considered downloaded if it has .json dump files
     * (decompressed from .gz files)
     */
    async isConferenceDownloaded(
            conferenceId: string,
            environment: RTCStatsEnvironment
    ): Promise<boolean> {
        const downloadDir = path.join(this.downloadsPath, environment, conferenceId);

        logger.debug(`Checking if conference is downloaded: ${downloadDir}`);

        try {
            const stat = await fs.stat(downloadDir);

            if (!stat.isDirectory()) {
                logger.debug(`Path exists but is not a directory: ${downloadDir}`);

                return false;
            }

            const files = await fs.readdir(downloadDir);
            // Only count .json files (decompressed dumps ready for processing)
            const jsonFiles = files.filter(f => f.endsWith('.json'));

            logger.debug(`Directory exists with ${files.length} total files, ${jsonFiles.length} .json files`);

            return jsonFiles.length > 0; // Has decompressed dump files ready for analysis
        } catch (error) {
            logger.debug(`Directory does not exist or error checking: ${downloadDir}`, { error: (error as Error).message });

            return false;
        }
    }

    /**
     * Get conference download path
     */
    getConferenceDownloadPath(
            conferenceId: string,
            environment: RTCStatsEnvironment
    ): string {
        return path.join(this.downloadsPath, environment, conferenceId);
    }

    /**
     * Get conference dumps path (same as download path with native integration)
     */
    getConferenceDumpsPath(
            conferenceId: string,
            environment: RTCStatsEnvironment
    ): string {
        return path.join(this.downloadsPath, environment, conferenceId);
    }

    /**
     * List all downloaded conferences
     */
    async getDownloadedConferences():
    Promise<Array<{ conferenceId: string; downloadPath: string; environment: RTCStatsEnvironment; }>> {
        const results = [];

        for (const env of [ RTCStatsEnvironment.PROD, RTCStatsEnvironment.PILOT ]) {
            const envDir = path.join(this.downloadsPath, env);

            try {
                const conferences = await fs.readdir(envDir);

                for (const conferenceId of conferences) {
                    const downloadPath = path.join(envDir, conferenceId);
                    const stat = await fs.stat(downloadPath);

                    if (stat.isDirectory()) {
                        results.push({
                            conferenceId,
                            downloadPath,
                            environment: env
                        });
                    }
                }
            } catch (error) {
                // Environment directory doesn't exist yet, skip
                continue;
            }
        }

        return results;
    }

    /**
     * Clean up old downloads
     */
    async cleanupOldDownloads(): Promise<void> {
        const cutoffDate = new Date();

        cutoffDate.setDate(cutoffDate.getDate() - rtcstatsConfig.cleanupAfterDays);

        logger.info(`Cleaning up downloads older than ${cutoffDate.toISOString()}`);

        for (const env of [ RTCStatsEnvironment.PROD, RTCStatsEnvironment.PILOT ]) {
            const envDir = path.join(this.downloadsPath, env);

            try {
                const conferences = await fs.readdir(envDir);

                for (const conferenceId of conferences) {
                    const downloadPath = path.join(envDir, conferenceId);
                    const stat = await fs.stat(downloadPath);

                    if (stat.isDirectory() && stat.mtime < cutoffDate) {
                        await fs.remove(downloadPath);
                        logger.debug(`Cleaned up old download: ${conferenceId} from ${env}`);
                    }
                }
            } catch (error) {
                logger.warn(`Failed to cleanup downloads in ${env}:`, error);
            }
        }
    }

    /**
     * Get component metadata for a conference from DynamoDB
     * Returns information about all participants, JVBs, and Jicofo instances
     *
     * @param conferenceId - Conference session ID (UUID)
     * @param environment - Environment (prod/pilot)
     * @returns Component metadata grouped by type
     */
    async getConferenceComponents(
            conferenceId: string,
            environment: RTCStatsEnvironment = RTCStatsEnvironment.PILOT
    ): Promise<{
                jicofo: Array<{
                    dumpId: string;
                    durationMs?: number;
                    endTime?: Date;
                    jicofoId: string;
                    startTime: Date;
                }>;
                jvbs: Array<{
                    dumpId: string;
                    durationMs?: number;
                    endTime?: Date;
                    jvbId: string;
                    startTime: Date;
                }>;
                participants: Array<{
                    displayName?: string;
                    dumpId: string;
                    durationMs?: number;
                    endTime?: Date;
                    startTime: Date;
                    userId: string;
                }>;
            }> {
        try {
            // Query all components for this conference
            const allSessions = await this.dataService.getConferenceBySessionId(conferenceId, environment);

            logger.debug(`Retrieved ${allSessions.length} components for conference ${conferenceId}`);

            const participants: any[] = [];
            const jvbs: any[] = [];
            const jicofo: any[] = [];

            for (const session of allSessions) {
                const component = {
                    dumpId: session.dumpId || '',
                    durationMs: session.sessionDurationMs,
                    endTime: session.sessionEndTime,
                    startTime: session.sessionStartTime || session.createDate
                };

                // Categorize by component type
                if (this.isClientApp(session.app)) {
                    // Client/participant (Jitsi Meet, 8x8 Work, etc.)
                    participants.push({
                        ...component,
                        displayName: session.displayName,
                        userId: session.displayName || session.endpointId
                    });
                } else {
                    // Backend components
                    switch (session.app) {
                    case 'JVB':
                        jvbs.push({
                            ...component,
                            jvbId: session.displayName || session.endpointId
                        });
                        break;
                    case 'Jicofo':
                        jicofo.push({
                            ...component,
                            jicofoId: session.displayName || session.endpointId
                        });
                        break;
                    default:
                        logger.warn(`Unknown backend component type: ${session.app}`, { session });
                    }
                }
            }

            logger.debug(`Conference components: ${participants.length} participants, ${jvbs.length} JVBs, ${jicofo.length} Jicofo instances`);

            return {
                jicofo,
                jvbs,
                participants
            };
        } catch (error) {
            logger.error(`Failed to get conference components for ${conferenceId}:`, error);
            throw error;
        }
    }

    /**
     * Disconnect from Redshift when shutting down
     */
    async disconnect(): Promise<void> {
        await this.dataService.disconnect();
    }
}

export default RTCStatsService;
