/**
 * Dump Processor Service
 * Processes real conference dumps from Jicofo, Bridge, and Client endpoints
 * Extracts quality metrics, participant data, and timeline events
 */
import { getLogger } from '@jitsi/logger';
import * as fs from 'fs';
import * as path from 'path';
import { UAParser } from 'ua-parser-js';

const logger = getLogger('backend/src/services/DumpProcessor');

import {
    CallEventType,
    CallSession,
    DumpEventType,
    EnhancedCallEvent,
    MediaEventType,
    ParticipantDetails
} from '../../../shared/types';

interface IRTCStatsEntry {
    0: string; // event type
    1: string; // connection id or null
    2: any; // data
    3: number; // timestamp
    4: number; // sequence
}

interface IConnectionInfo {
    clientType: string;
    path: string;
    statsSessionId: string;
    userAgent: string;
}

interface IIdentityInfo {
    applicationName?: string;
    confID: string;
    confName: string;
    // "JVB", "Jicofo", or undefined for participant endpoints
    deploymentInfo?: {
        environment: string;
        region: string;
        shard: string;
        userRegion: string;
    };
    displayName?: string;
    endpointId: string;
    siteID?: string;
    statisticsDisplayName?: string;
    statisticsId?: string;
}

export interface IComponentMetadata {
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
}

export class DumpProcessor {
    private dumpsPath: string;
    private participantIdentityMap: Map<string, string> = new Map(); // displayName -> participantId
    private componentMetadata?: IComponentMetadata;

    /**
     * Creates a new DumpProcessor instance.
     * Processes real conference dumps from Jicofo, Bridge, and Client endpoints.
     *
     * @param dumpsPath - Path to the directory containing dump files
     * @param componentMetadata - Optional metadata from DynamoDB for more accurate analysis
     */
    constructor(dumpsPath: string, componentMetadata?: IComponentMetadata) {
        this.dumpsPath = dumpsPath;
        this.componentMetadata = componentMetadata;

        if (componentMetadata) {
            logger.info('DumpProcessor initialized with component metadata', {
                jicofoCount: componentMetadata.jicofo.length,
                jvbCount: componentMetadata.jvbs.length,
                participantCount: componentMetadata.participants.length
            });
        }
    }

    // ============================================================================
    // PRIVATE UTILITY METHODS
    // ============================================================================

    /**
     * Get all dump files from the dumps directory.
     * Scans the configured dumps directory for all available files.
     *
     * @private
     * @returns Array of absolute file paths to all dump files
     * @throws Error if dumps directory doesn't exist
     */
    private _getDumpFiles(): string[] {
        if (!fs.existsSync(this.dumpsPath)) {
            throw new Error(`Dumps directory not found: ${this.dumpsPath}`);
        }

        return fs
            .readdirSync(this.dumpsPath)
            .map(file => path.join(this.dumpsPath, file))
            .filter(file => fs.statSync(file).isFile());
    }

    /**
     * Extract conference information from a dump file.
     * Reads the first few lines to find identity information with conference details.
     *
     * @private
     * @param filePath - Path to the dump file to extract info from
     * @returns Conference identity information or null if not found
     */
    private _extractConferenceInfo(filePath: string): any {
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            const lines = data.split('\n').slice(0, 10);

            for (const line of lines) {
                if (!line.trim()) continue;
                const entry = JSON.parse(line);

                // Handle new object format: {"type":"identity","data":{...}}
                if (entry.type === DumpEventType.IDENTITY && entry.data) {
                    return entry.data;

                // Handle old array format: ["identity", null, data]
                } else if (entry[0] === DumpEventType.IDENTITY && entry[2]) {
                    return entry[2];
                }
            }
        } catch (error) {
            logger.error('Error extracting conference info:', error);
        }

        return null;
    }

    /**
     * Extract Jitsi Meet version from RTCStats entries.
     * Searches through log entries to find lib-jitsi-meet version information.
     *
     * @private
     * @param entries - Array of RTCStats entries to search
     * @returns Jitsi Meet version string or null if not found
     */
    private _extractJitsiVersion(entries: IRTCStatsEntry[]): string | null {
        for (const entry of entries) {
            if (entry[0] === DumpEventType.LOGS && entry[2] && Array.isArray(entry[2])) {
                for (const log of entry[2]) {
                    if (log?.text.includes('lib-jitsi-meet version:')) {
                        const version = log.text.match(/version: (\w+)/)?.[1];

                        if (version) return version;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Parse user agent string to extract client information.
     * Uses UAParser (same library used by lib-jitsi-meet) for consistent parsing.
     *
     * @private
     * @param userAgent - User agent string to parse
     * @returns Parsed client information object with browser, OS, and device details
     */
    private _parseUserAgent(userAgent: string) {
        const parser = new UAParser(userAgent);
        const browserInfo = parser.getBrowser();
        const osInfo = parser.getOS();
        const deviceInfo = parser.getDevice();

        // Detect if it's React Native (mobile app)
        const isReactNative = userAgent.match(/\b(react[ \t_-]*native)(?:\/(\S+))?/i) !== null;
        const isMobile = deviceInfo.type === 'mobile' || userAgent.includes('Mobile') || userAgent.includes('iPhone');
        const isTablet = deviceInfo.type === 'tablet' || userAgent.includes('iPad');

        // Determine device type
        let deviceType: 'desktop' | 'mobile' | 'tablet' = 'desktop';

        if (isTablet) {
            deviceType = 'tablet';
        } else if (isMobile || isReactNative) {
            deviceType = 'mobile';
        }

        // Determine browser type - normalize to our expected values
        let browser: 'Chrome' | 'Firefox' | 'Safari' | 'Edge' = 'Chrome';
        const browserName = browserInfo.name?.toLowerCase() || '';

        if (browserName.includes('firefox')) {
            browser = 'Firefox';
        } else if (browserName.includes('safari') && !browserName.includes('chrome')) {
            browser = 'Safari';
        } else if (browserName.includes('edge') || browserName.includes('edg')) {
            browser = 'Edge';
        } else if (browserName.includes('chrome') || browserName.includes('chromium')) {
            browser = 'Chrome';
        }

        // Get browser version
        const browserVersion = browserInfo.version || 'unknown';

        // Determine OS - normalize to our expected values
        const osName = osInfo.name?.toLowerCase() || '';
        let os: 'Windows' | 'macOS' | 'Linux' | 'iOS' | 'Android' = 'Windows';

        if (osName.includes('mac')) {
            os = 'macOS';
        } else if (osName.includes('windows')) {
            os = 'Windows';
        } else if (osName.includes('linux')) {
            os = 'Linux';
        } else if (osName.includes('ios')) {
            os = 'iOS';
        } else if (osName.includes('android')) {
            os = 'Android';
        }

        // Get OS version
        const osVersion = osInfo.version || 'unknown';

        return {
            type: isReactNative ? ('mobile' as const) : ('web' as const),
            browser,
            browserVersion,
            os,
            osVersion,
            deviceType
        };
    }

    /**
     * Detect network type from user agent string.
     * Simple heuristic to determine if connection is likely mobile or WiFi.
     *
     * @private
     * @param userAgent - User agent string to analyze
     * @returns Detected network type ('Mobile' or 'WiFi')
     */
    private _detectNetworkType(userAgent: string): string {
        if (userAgent.includes('ios') || userAgent.includes('android') || userAgent.includes('JitsiMeetSDK')) {
            return 'Mobile';
        }

        return 'WiFi';
    }

    /**
     * Generate a stable participant ID based on displayName.
     * Creates consistent participant identifiers across multiple sessions.
     *
     * @private
     * @param displayName - The participant's display name
     * @returns Generated participant ID with random suffix
     */
    private _generateParticipantId(displayName: string): string {
        // Check if we already have a participant ID for this displayName
        if (this.participantIdentityMap.has(displayName)) {
            const existingId = this.participantIdentityMap.get(displayName);

            if (existingId) {
                return existingId;
            }
        }

        // Generate a new participant ID: displayName + short random string
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const participantId = `${displayName.replace(/[^a-zA-Z0-9]/g, '')}-${randomSuffix}`;

        // Store the mapping for future use
        this.participantIdentityMap.set(displayName, participantId);

        return participantId;
    }

    /**
     * Extract log level from log content.
     * Analyzes log content to determine appropriate log level classification.
     *
     * @private
     * @param logContent - The log message content to analyze
     * @returns Detected log level (TRACE, DEBUG, INFO, WARN, ERROR)
     */
    private _extractLogLevel(logContent: string): string {
        if (!logContent) return 'INFO';

        // First, check for explicit log level markers in brackets
        const bracketMatch = logContent.match(/\[(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\]/i);

        if (bracketMatch) {
            const level = bracketMatch[1].toUpperCase();

            // Normalize WARNING to WARN
            return level === 'WARNING' ? 'WARN' : level;
        }

        // Fallback to existing content-based logic
        const content = logContent.toLowerCase();

        // Explicit log level keywords
        if (
            content.includes('error')
            || content.includes('failed')
            || content.includes('exception')
            || content.includes('fatal')
        )
            return 'ERROR';
        if (content.includes('warn') || content.includes('warning') || content.includes('deprecated')) return 'WARN';
        if (content.includes('debug') || content.includes('verbose')) return 'DEBUG';
        if (content.includes('trace') || content.includes('entering') || content.includes('exiting')) return 'TRACE';

        return 'INFO';
    }

    // ============================================================================
    // PRIVATE DATA PROCESSING METHODS
    // ============================================================================

    /**
     * Find the latest timestamp from all participant dump files.
     * Used as fallback for determining session end time when leave events are missing.
     *
     * @private
     * @param dumpFiles - Array of dump file paths to analyze
     * @returns Latest timestamp found, or 0 if none found
     */
    private _findLatestTimestampFromDumps(dumpFiles: string[]): number {
        let latestTimestamp = 0;

        // Only check client files, not bridge/jicofo
        const clientFiles = dumpFiles.filter(file => file.endsWith('.json'));

        for (const file of clientFiles) {
            try {
                const data = fs.readFileSync(file, 'utf8');
                const lines = data.split('\n').filter(line => line.trim());

                // Get the last few lines and find the latest timestamp
                const lastLines = lines.slice(-10); // Check last 10 entries

                for (const line of lastLines.reverse()) {
                    try {
                        const entry = JSON.parse(line);

                        if (entry[3] && typeof entry[3] === 'number') {
                            latestTimestamp = Math.max(latestTimestamp, entry[3]);
                        }
                    } catch (e) {
                        // Skip malformed entries
                        continue;
                    }
                }
            } catch (error) {
                logger.warn(`Error reading timestamps from ${file}:`, error);
            }
        }

        return latestTimestamp || 0;
    }

    /**
     * Extract conference start timestamp from participant dumps.
     * Searches dump files for conferenceStartTimestamp entries to determine when the conference began.
     *
     * @private
     * @param dumpFiles - Array of dump file paths to search
     * @returns Promise resolving to conference start timestamp or null if not found
     */
    private async _extractConferenceStartTimestamp(dumpFiles: string[]): Promise<number | null> {
        try {
            // Try to find conferenceStartTimestamp in any of the dump files
            for (const file of dumpFiles) {
                // Handle both absolute paths and relative filenames
                const filePath = path.isAbsolute(file) ? file : path.join(this.dumpsPath, file);

                if (!fs.existsSync(filePath)) {
                    continue;
                }

                const content = fs.readFileSync(filePath, 'utf8');
                const lines = content.split('\n').filter(line => line.trim());

                for (const line of lines) {
                    try {
                        const entry = JSON.parse(line);

                        // Look for conferenceStartTimestamp entries:
                        // ["conferenceStartTimestamp",null,"1757514634000",timestamp,index]
                        if (
                            Array.isArray(entry)
                            && entry.length >= 3
                            && entry[0] === DumpEventType.CONFERENCE_START_TIMESTAMP
                            && typeof entry[2] === 'string'
                        ) {
                            const timestamp = parseInt(entry[2]);

                            if (!isNaN(timestamp)) {
                                return timestamp;
                            }
                        }
                    } catch (parseError) {
                        // Skip invalid JSON lines
                        continue;
                    }
                }
            }

            return null;
        } catch (error) {
            logger.error('Error extracting conference start timestamp:', error);

            return null;
        }
    }

    /**
     * Generic NDJSON file processor - parses newline-delimited JSON files.
     * Can filter and transform entries based on provided functions for flexible data extraction.
     *
     * @private
     * @template T - The type of objects to return after transformation
     * @param filePath - Path to the NDJSON file to process
     * @param entryFilter - Optional filter function to select specific entries
     * @param entryTransformer - Optional transformer function to convert entries to desired format
     * @returns Promise resolving to array of processed entries of type T
     */
    private async _processNDJSONFile<T>(
            filePath: string,
            entryFilter?: (entry: any) => boolean,
            entryTransformer?: (entry: any, endpointId: string) => T
    ): Promise<T[]> {
        const results: T[] = [];
        const endpointId = path.basename(filePath, '.json');

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n').filter(line => line.trim());

            for (const line of lines) {
                try {
                    const entry = JSON.parse(line);

                    // Apply filter if provided
                    if (entryFilter && !entryFilter(entry)) {
                        continue;
                    }

                    // Apply transformer if provided
                    if (entryTransformer) {
                        const transformed = entryTransformer(entry, endpointId);

                        if (transformed) {
                            results.push(transformed);
                        }
                    } else {
                        results.push(entry as T);
                    }
                } catch (parseError) {
                    // Skip invalid JSON lines
                    continue;
                }
            }
        } catch (error) {
            logger.error(`Error processing NDJSON file ${filePath}:`, error);
        }

        return results;
    }

    /**
     * Parse a single console log line and extract structured information.
     * Handles multiple console log formats and extracts timestamp, component, and message.
     *
     * @private
     * @param line - The console log line to parse
     * @param lineNumber - Line number in the file for reference
     * @returns Parsed log entry object or null if parsing fails
     */
    private _parseConsoleLogLine(line: string, lineNumber: number): any | null {
        // Match format: timestamp [LEVEL] [component:class] message
        // Example: "2025-09-16T23:47:43.632Z [DEBUG] [videosipgw:VideoSIPGW] <new qu>: creating VideoSIPGW ?"
        const levelComponentMatch
          = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s*\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.*)$/);

        if (levelComponentMatch) {
            const [ , timestampStr, level, componentPath, message ] = levelComponentMatch;
            const timestamp = new Date(timestampStr).getTime();

            // Extract component from "component:class" format
            const component = componentPath.includes(':')
                ? componentPath.split(':')[0]
                : componentPath;

            return {
                timestamp,
                level: level.trim(),
                message: message.trim(),
                component: component.trim(),
                rawLine: line,
                lineNumber
            };
        }

        // Match original format: timestamp [component] message
        const consoleLogMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s*\[([^\]]+)\]\s*(.*)$/);

        if (consoleLogMatch) {
            const [ , timestampStr, componentPath, message ] = consoleLogMatch;
            const timestamp = new Date(timestampStr).getTime();
            const level = this._extractLogLevel(message);

            // Extract component from "component:class" format
            const component = componentPath.includes(':')
                ? componentPath.split(':')[0]
                : componentPath;

            return {
                timestamp,
                level,
                message: message.trim(),
                component: component.trim(),
                rawLine: line,
                lineNumber
            };
        }

        // Try alternative format without square brackets
        const altMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+(.*)$/);

        if (altMatch) {
            const [ , timestampStr, message ] = altMatch;
            const timestamp = new Date(timestampStr).getTime();
            const level = this._extractLogLevel(message);

            return {
                timestamp,
                level,
                message: message.trim(),
                component: 'Unknown',
                rawLine: line,
                lineNumber
            };
        }

        return null;
    }

    /**
     * Get console logs for a session from .txt files using session UUID.
     * Parses console log files and structures the data for analysis.
     *
     * @private
     * @param sessionUUID - The session UUID to get console logs for
     * @returns Promise resolving to parsed console logs with metadata
     */
    private async _getSessionConsoleLogs(sessionUUID: string): Promise<any> {
        try {
            const logFile = path.join(this.dumpsPath, `${sessionUUID}.txt`);

            if (!fs.existsSync(logFile)) {
                logger.debug(`Session log file not found: ${logFile}`);

                return {
                    logs: [],
                    totalLines: 0,
                    fileExists: false
                };
            }

            const logContent = fs.readFileSync(logFile, 'utf8');
            const logLines = logContent.split('\n').filter(line => line.trim());
            const parsedLogs: any[] = [];

            logLines.forEach((line, index) => {
                try {
                    // Try to parse as JSON first
                    const logEntry = JSON.parse(line);

                    // Ensure log entry has level field
                    if (!logEntry.level) {
                        logEntry.level = this._extractLogLevel(logEntry.message || line);
                    }
                    parsedLogs.push({
                        ...logEntry,
                        lineNumber: index + 1,
                        sessionId: sessionUUID
                    });
                } catch {
                    // If not JSON, parse as console log format:
                    // "25-09-16T23:47:45.990Z [INFO] [xmpp:ChatRoom] <Cc.onMessage>:  Subject is changed to "
                    const consoleLogEntry = this._parseConsoleLogLine(line, index + 1);

                    if (consoleLogEntry) {
                        consoleLogEntry.sessionId = sessionUUID;
                        parsedLogs.push(consoleLogEntry);
                    } else {
                        // Fallback for unrecognized format
                        parsedLogs.push({
                            timestamp: Date.now() + index, // Fallback timestamp
                            level: this._extractLogLevel(line),
                            message: line,
                            component: 'Unknown',
                            rawLine: line,
                            lineNumber: index + 1,
                            sessionId: sessionUUID
                        });
                    }
                }
            });

            return {
                logs: parsedLogs,
                totalLines: logLines.length,
                fileExists: true
            };
        } catch (error) {
            logger.error(`Error reading session logs for ${sessionUUID}:`, error);

            return {
                logs: [],
                totalLines: 0,
                fileExists: false,
                error: (error as Error).message
            };
        }
    }

    // ============================================================================
    // PRIVATE COMPLEX PROCESSING METHODS
    // ============================================================================

    /**
     * Process individual component dump (participant endpoint, JVB instance, or Jicofo instance).
     * Parses NDJSON dump files and extracts participant or component information.
     *
     * @private
     * @param filePath - Path to the dump file to process
     * @param participantId - The participant/component ID extracted from filename
     * @returns Promise resolving to participant details with component type, or null if processing fails
     */
    private async _processComponentDump(
            filePath: string,
            participantId: string
    ): Promise<(ParticipantDetails & { componentType: string; }) | null> {
        logger.debug(`Processing file: ${path.basename(filePath)} for participant: ${participantId}`);
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            const entries: IRTCStatsEntry[] = data
                .split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            let connectionInfo: IConnectionInfo | null = null;
            let identityInfo: IIdentityInfo | null = null;
            let joinTime: number | null = null;
            let leaveTime: number | undefined = undefined;
            const mediaEvents: any[] = [];
            let earliestTimestamp: number | null = null;
            let latestTimestamp: number | null = null;
            // Track peer connections and their close timestamps
            const peerConnections = new Set<string>();
            const peerConnectionCloseTimestamps = new Map<string, number>();

            logger.debug(`Processing ${entries.length} entries for participant ${participantId}`);

            // Parse entries - handle both array format and object format
            for (const entry of entries) {
                let eventType, _connectionId, entryData, timestamp;

                // Check if entry is array format (participant files) or object format (JVB/Jicofo files)
                if (Array.isArray(entry)) {
                    // Array format: ['eventType', connectionId, data, timestamp]
                    eventType = entry[0];
                    _connectionId = entry[1];
                    entryData = entry[2];
                    timestamp = entry[3];
                } else if ((entry as any).type) {
                    // Object format: {type: 'eventType', data: {...}, timestamp: ...}
                    const objectEntry = entry as any;

                    eventType = objectEntry.type;
                    _connectionId = null;
                    entryData = objectEntry.data;
                    timestamp = objectEntry.timestamp;
                } else {
                    // Unknown format, skip
                    continue;
                }

                // Track earliest and latest timestamps
                if (timestamp) {
                    if (earliestTimestamp === null || timestamp < earliestTimestamp) {
                        earliestTimestamp = timestamp;
                    }
                    if (latestTimestamp === null || timestamp > latestTimestamp) {
                        latestTimestamp = timestamp;
                    }
                }

                // Track peer connections from getstats and connectionInfo events
                if (_connectionId && typeof _connectionId === 'string' && _connectionId.startsWith('PC_')) {
                    peerConnections.add(_connectionId);
                }

                switch (eventType) {
                case DumpEventType.CONNECTION_INFO:
                    connectionInfo = entryData;
                    joinTime = timestamp;
                    break;
                case DumpEventType.IDENTITY:
                    logger.debug(`[IDENTITY] Processing identity for ${participantId}`);
                    logger.debug(`[IDENTITY] Data has displayName: ${!!entryData?.displayName}, value:
                        ${entryData?.displayName}`
                    );
                    logger.debug(`[IDENTITY] Data has endpointId: ${!!entryData?.endpointId}, value:
                        ${entryData?.endpointId}`
                    );
                    // Always keep the first identity that has displayName, or just the latest one
                    if (!identityInfo || (entryData?.displayName && !identityInfo.displayName)) {
                        identityInfo = entryData;
                        logger.debug(`[IDENTITY] Updated identityInfo for ${participantId}, displayName:
                            ${identityInfo?.displayName}`
                        );
                    }
                    break;
                case DumpEventType.SCREENSHARE_TOGGLED:
                    // entryData is boolean: false = screenshare started, true = screenshare stopped
                    mediaEvents.push({
                        timestamp,
                        type: entryData === false ? MediaEventType.SCREENSHARE_START : MediaEventType.SCREENSHARE_STOP,
                        data: {
                            screenshareActive: !entryData // false means started (active), true means stopped (inactive)
                        }
                    });
                    break;
                case DumpEventType.DOMINANT_SPEAKER_CHANGED:
                    // When this event is received, the sender becomes the dominant speaker
                    mediaEvents.push({
                        timestamp,
                        type: MediaEventType.DOMINANT_SPEAKER_START,
                        data: {
                            dominantSpeakerActive: true
                        }
                    });
                    break;
                case DumpEventType.VIDEO_MUTED_CHANGED:
                    // entryData is boolean: true = video stopped (muted), false = video started (unmuted)
                    if (typeof entryData === 'boolean') {
                        mediaEvents.push({
                            timestamp,
                            type: entryData === true ? MediaEventType.VIDEO_DISABLE : MediaEventType.VIDEO_ENABLE,
                            data: {
                                muted: entryData
                            }
                        });
                    }
                    break;
                case DumpEventType.AUDIO_MUTED_CHANGED:
                    // entryData is boolean: true = audio muted, false = audio unmuted
                    if (typeof entryData === 'boolean') {
                        mediaEvents.push({
                            timestamp,
                            type: entryData === true ? MediaEventType.AUDIO_MUTE : MediaEventType.AUDIO_UNMUTE,
                            data: {
                                muted: entryData
                            }
                        });
                    }
                    break;
                case DumpEventType.REMOTE_SOURCE_SUSPENDED:
                case DumpEventType.REMOTE_SOURCE_INTERRUPTED:
                    // Media interruptions - remote source events
                    mediaEvents.push({
                        timestamp,
                        type: MediaEventType.MEDIA_INTERRUPTION,
                        data: {
                            issueType: eventType,
                            category: MediaEventType.MEDIA_INTERRUPTION,
                            subcategory: 'remote_source_events'
                        }
                    });
                    break;
                case DumpEventType.JVB_ICE_RESTARTED:
                    // Network issues - BWE issues
                    mediaEvents.push({
                        timestamp,
                        type: MediaEventType.NETWORK_ISSUE,
                        data: {
                            issueType: DumpEventType.JVB_ICE_RESTARTED,
                            category: MediaEventType.NETWORK_ISSUE,
                            subcategory: 'bwe_issues'
                        }
                    });
                    break;
                case DumpEventType.STROPHE_DISCONNECTED:
                    // Connection issues - strophe errors
                    mediaEvents.push({
                        timestamp,
                        type: MediaEventType.CONNECTION_ISSUE,
                        data: {
                            issueType: DumpEventType.STROPHE_DISCONNECTED,
                            category: MediaEventType.CONNECTION_ISSUE,
                            subcategory: 'strophe_errors'
                        }
                    });
                    break;
                case DumpEventType.STROPHE_RECONNECTED:
                    // Connection issues - strophe errors (recovery)
                    mediaEvents.push({
                        timestamp,
                        type: MediaEventType.CONNECTION_RECOVERY,
                        data: {
                            issueType: DumpEventType.STROPHE_RECONNECTED,
                            category: MediaEventType.CONNECTION_RECOVERY,
                            subcategory: 'strophe_errors'
                        }
                    });
                    break;
                case DumpEventType.CLOSE:
                    // Track which peer connection closed and when
                    if (_connectionId && typeof _connectionId === 'string' && _connectionId.startsWith('PC_')) {
                        peerConnectionCloseTimestamps.set(_connectionId, timestamp);
                        logger.debug(`[CLOSE] Peer connection ${_connectionId} closed at ${timestamp} for ${participantId}`);
                    }
                    break;
                }
            }

            // Determine leaveTime based on peer connection close events
            if (peerConnectionCloseTimestamps.size > 0) {
                // If ANY peer connections were closed, check if ALL were closed
                const allPeersClosed = peerConnections.size > 0
                    && peerConnectionCloseTimestamps.size === peerConnections.size;

                if (allPeersClosed) {
                    // All PCs closed - use the LATEST (maximum) close timestamp
                    leaveTime = Math.max(...Array.from(peerConnectionCloseTimestamps.values()));
                    logger.debug(`[LEAVE_TIME] All ${peerConnections.size} peer connections closed, using latest close time ${leaveTime} for ${participantId}`);
                } else {
                    // Some PCs closed but not all - participant still active, use latest event timestamp
                    leaveTime = latestTimestamp ?? undefined;
                    logger.debug(`[LEAVE_TIME] Only ${peerConnectionCloseTimestamps.size}/${peerConnections.size} PCs closed, using latest timestamp ${leaveTime} for ${participantId}`);
                }
            } else {
                // No close events at all - use latest timestamp from dump or undefined
                leaveTime = latestTimestamp ?? undefined;
                logger.debug(`[LEAVE_TIME] No close events detected, using latest timestamp ${leaveTime} for ${participantId}`);
            }

            // Calculate quality metrics from WebRTC stats
            const qualityMetrics = this._calculateQualityFromStats(entries);

            // Determine component type based on applicationName in identity
            let componentType: string;

            if (identityInfo && identityInfo.applicationName === 'JVB') {
                componentType = 'JVB';
            } else if (identityInfo && identityInfo.applicationName === 'Jicofo') {
                componentType = 'Jicofo';
            } else {
                // No applicationName means it's a participant endpoint
                componentType = 'participant';
            }

            // Note: Media interruption events will be added during participant merging phase

            // For JVB and Jicofo components, connectionInfo is optional
            if (!identityInfo) {
                logger.warn(`Missing identity info for ${participantId}`);

                return null;
            }

            if (!connectionInfo && componentType === 'participant') {
                logger.warn(`Missing connection info for participant ${participantId}`);

                return null;
            }

            // Extract client info from user agent (use defaults for JVB/Jicofo)
            const clientInfo = connectionInfo
                ? this._parseUserAgent(connectionInfo.userAgent)
                : { type: componentType.toLowerCase(), version: 'unknown' };

            logger.debug(`Processing ${participantId} - componentType: ${componentType},
                displayName: ${identityInfo?.displayName}, applicationName: ${identityInfo?.applicationName}`
            );

            // Generate proper participantId from displayName for participants
            const displayName
                = identityInfo?.displayName || identityInfo?.statisticsId || participantId.substring(0, 8);

            logger.debug(`[FINAL] ${participantId}: identityInfo.displayName=${identityInfo?.displayName},
                final displayName=${displayName}`
            );
            const finalParticipantId
                = componentType === 'participant' && displayName
                    ? this._generateParticipantId(displayName)
                    : participantId;

            // For participant endpoints, ensure we always have an endpointId
            let finalEndpointId = identityInfo.endpointId;

            if (componentType === 'participant' && !finalEndpointId) {
                // Fallback: use session UUID as endpointId for participant endpoints
                finalEndpointId = participantId;
                logger.warn(
                    `Missing endpointId for participant endpoint ${participantId}, using session UUID as fallback`
                );
            }

            // Add participantId to all media events
            mediaEvents.forEach((event: any) => {
                event.participantId = finalParticipantId;
            });

            // Fallback for joinTime if CONNECTION_INFO was missing
            if (!joinTime && earliestTimestamp) {
                logger.warn(
                    `Missing CONNECTION_INFO for ${participantId}, using earliest event timestamp ${earliestTimestamp} as joinTime`
                );
                joinTime = earliestTimestamp;
            } else if (!joinTime) {
                logger.error(`No valid timestamps found for ${participantId}, using current time as fallback`);
                joinTime = Date.now();
            }

            return {
                clientInfo: clientInfo as any,
                componentType,
                connection: {
                    networkType: connectionInfo
                        ? (this._detectNetworkType(connectionInfo.userAgent) as
                              | '4G'
                              | '5G'
                              | 'WiFi'
                              | 'Ethernet'
                              | undefined)
                        : undefined,
                    region: identityInfo.deploymentInfo?.userRegion || 'unknown',
                    userAgent: connectionInfo?.userAgent || `${componentType} component`
                },
                displayName,
                statisticsDisplayName: identityInfo.statisticsDisplayName || identityInfo.statisticsId,
                // Ensure endpointIds array is always present for backward compatibility
                endpointIds: finalEndpointId ? [ finalEndpointId ] : [],
                endpointId: finalEndpointId,
                jitsiClient: {
                    buildNumber: '',
                    platform: clientInfo.type === 'mobile' ? 'react-native' : 'web',
                    releaseChannel: 'stable',
                    version: this._extractJitsiVersion(entries) || 'unknown'
                },
                joinTime,
                leaveTime,
                mediaEvents,
                metadata: {
                    originalSessionId: participantId
                },
                participantId: finalParticipantId,
                qualityMetrics,
                role: 'viewer' as const // Role detection would need more sophisticated analysis
            };
        } catch (error) {
            logger.error(`Error processing participant dump ${participantId}:`, error);

            return null;
        }
    }

    /**
     * Calculate quality metrics from WebRTC stats.
     * Analyzes RTCStats entries to compute audio/video quality, packet loss, RTT, and jitter.
     *
     * @private
     * @param entries - Array of RTCStats entries from dump file
     * @returns Quality metrics object with audio/video quality, network stats, and bandwidth
     */
    private _calculateQualityFromStats(entries: IRTCStatsEntry[]) {
        const statsEntries = entries.filter(entry => entry[0] === DumpEventType.STATS);

        const _totalPacketLoss = 0;
        let totalRTT = 0;
        let totalJitter = 0;
        let audioQuality = 4.0;
        let videoQuality = 4.0;
        let statsCount = 0;
        let packetsReceived = 0;
        let packetsLost = 0;

        // Analyze WebRTC stats for quality metrics
        statsEntries.forEach(entry => {
            const stats = entry[2];

            if (stats && typeof stats === 'object') {
                Object.values(stats).forEach((stat: any) => {
                    if (stat.type === 'candidate-pair' && stat.nominated) {
                        if (typeof stat.currentRoundTripTime === 'number') {
                            totalRTT += stat.currentRoundTripTime * 1000; // Convert to ms
                            statsCount++;
                        }
                    }

                    if (stat.type === 'inbound-rtp') {
                        if (typeof stat.packetsLost === 'number' && typeof stat.packetsReceived === 'number') {
                            packetsLost += stat.packetsLost;
                            packetsReceived += stat.packetsReceived;
                        }
                        if (typeof stat.jitter === 'number') {
                            totalJitter += stat.jitter * 1000; // Convert to ms
                        }
                    }
                });
            }
        });

        const avgRTT = statsCount > 0 ? totalRTT / statsCount : 45;
        const avgPacketLoss
            = packetsReceived + packetsLost > 0 ? (packetsLost / (packetsReceived + packetsLost)) * 100 : 0.5;
        const avgJitter = statsCount > 0 ? totalJitter / statsCount : 8;

        // Adjust quality based on network conditions
        if (avgPacketLoss > 2) audioQuality -= 0.5;
        if (avgPacketLoss > 5) videoQuality -= 1.0;
        if (avgRTT > 150) {
            audioQuality -= 0.3;
            videoQuality -= 0.3;
        }

        return {
            audioQuality: Math.max(1, Math.min(5, audioQuality)),
            videoQuality: Math.max(1, Math.min(5, videoQuality)),
            packetLoss: avgPacketLoss,
            roundTripTime: Math.round(avgRTT),
            jitter: Math.round(avgJitter),
            bandwidth: {
                upload: 1.5, // Would need more detailed calculation from stats
                download: 8.0
            }
        };
    }

    /**
     * Parse console logs for media interruption events across all sessions for a participant.
     * Searches console log files for ICE failures and BWE issues that indicate media problems.
     *
     * @private
     * @param sessionMap - Map of session UUIDs to endpoint IDs for the participant
     * @param displayName - The participant's display name for logging
     * @returns Array of media interruption events found in console logs
     */
    private _parseConsoleLogsForMediaInterruptions(sessionMap: Map<string, string>, displayName?: string): any[] {
        const allEvents: any[] = [];

        for (const [ sessionUUID, endpointId ] of sessionMap.entries()) {
            const logFile = path.join(this.dumpsPath, `${sessionUUID}.txt`);

            if (!fs.existsSync(logFile)) {
                continue; // Skip if console log file doesn't exist
            }

            try {
                const logContent = fs.readFileSync(logFile, 'utf8');
                const logLines = logContent.split('\n').filter(line => line.trim());

                logLines.forEach(line => {
                    const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);

                    if (!timestampMatch) return;

                    const timestamp = new Date(timestampMatch[1]).getTime();

                    // Detect media interruption events from console logs
                    if (
                        line.includes('triggering ice restart after')
                        || line.includes(
                            'ICE failed, force reloading the conference after failed attempts to re-establish ICE'
                        )
                    ) {
                        allEvents.push({
                            timestamp,
                            type: MediaEventType.ICE_FAILURE,
                            category: MediaEventType.MEDIA_INTERRUPTION,
                            subcategory: 'ice_failures',
                            displayName,
                            sessionUUID,
                            endpointId,
                            data: line.trim()
                        });
                    } else if (line.includes('TrackStreamingStatus') && line.includes('active => inactive')) {
                        allEvents.push({
                            timestamp,
                            type: MediaEventType.BWE_ISSUE,
                            category: MediaEventType.MEDIA_INTERRUPTION,
                            subcategory: 'bwe_issues',
                            displayName,
                            sessionUUID,
                            endpointId,
                            data: line.trim()
                        });
                    }
                });
            } catch (error) {
                logger.error(`Error parsing console log file ${logFile}:`, error);
            }
        }

        if (allEvents.length > 0) {
            logger.debug(`Found ${allEvents.length} media interruption events across ${sessionMap.size}
                sessions for ${displayName}`
            );
        }

        return allEvents;
    }

    /**
     * Extract events from participant dump data.
     * Creates join/leave events and other timeline events from participant data.
     *
     * @private
     * @param filePath - Path to the participant dump file
     * @param participant - The participant details to create events for
     * @returns Promise resolving to array of enhanced call events
     */
    private async _extractEventsFromDump(
            filePath: string,
            participant: ParticipantDetails
    ): Promise<EnhancedCallEvent[]> {
        const events: EnhancedCallEvent[] = [];
        const sessionId = 'real-conference-session';

        // Add join event
        events.push({
            timestamp: participant.joinTime,
            sessionId,
            participantId: participant.participantId,
            eventType: CallEventType.JOIN,
            source: 'client',
            correlationId: `join_${participant.participantId}_${participant.joinTime}`,
            participant: {
                endpointId: participant.endpointId,
                displayName: participant.displayName,
                clientVersion: participant.jitsiClient.version,
                osType: participant.clientInfo.os,
                browserType: participant.clientInfo.browser
            },
            technicalContext: {
                userAgent: participant.connection.userAgent,
                webrtcStats: {},
                networkConditions: {
                    rtt: participant.qualityMetrics.roundTripTime,
                    packetLoss: participant.qualityMetrics.packetLoss,
                    jitter: participant.qualityMetrics.jitter,
                    bandwidth: {
                        available:
                            participant.qualityMetrics.bandwidth.download + participant.qualityMetrics.bandwidth.upload,
                        used: participant.qualityMetrics.bandwidth.upload
                    },
                    connectionType: participant.connection.networkType || 'Unknown',
                    quality: participant.qualityMetrics.audioQuality > 3.5 ? 'good' : 'poor'
                }
            }
        });

        // Add leave event if available
        if (participant.leaveTime) {
            events.push({
                timestamp: participant.leaveTime,
                sessionId,
                participantId: participant.participantId,
                eventType: CallEventType.LEAVE,
                source: 'client',
                correlationId: `leave_${participant.participantId}_${participant.leaveTime}`,
                participant: {
                    endpointId: participant.endpointId,
                    displayName: participant.displayName,
                    clientVersion: participant.jitsiClient.version,
                    osType: participant.clientInfo.os,
                    browserType: participant.clientInfo.browser
                },
                technicalContext: {
                    userAgent: participant.connection.userAgent,
                    webrtcStats: {},
                    networkConditions: {
                        rtt: participant.qualityMetrics.roundTripTime,
                        packetLoss: participant.qualityMetrics.packetLoss,
                        jitter: participant.qualityMetrics.jitter,
                        bandwidth: {
                            available:
                                participant.qualityMetrics.bandwidth.download
                                + participant.qualityMetrics.bandwidth.upload,
                            used: participant.qualityMetrics.bandwidth.upload
                        },
                        connectionType: participant.connection.networkType || 'Unknown',
                        quality: participant.qualityMetrics.audioQuality > 3.5 ? 'good' : 'poor'
                    }
                }
            });
        }

        // Extract screenshare events from participant's mediaEvents
        const screenshareEvents = participant.mediaEvents.filter(
            (event: any) => event.type === MediaEventType.SCREENSHARE_START
            || event.type === MediaEventType.SCREENSHARE_STOP
        );

        for (const mediaEvent of screenshareEvents) {
            events.push({
                timestamp: mediaEvent.timestamp,
                sessionId,
                participantId: participant.participantId,
                eventType: CallEventType.SCREENSHARE,
                source: 'client',
                correlationId: `${mediaEvent.type}_${participant.participantId}_${mediaEvent.timestamp}`,
                participant: {
                    endpointId: participant.endpointId,
                    displayName: participant.displayName,
                    clientVersion: participant.jitsiClient.version,
                    osType: participant.clientInfo.os,
                    browserType: participant.clientInfo.browser
                },
                metadata: {
                    type: mediaEvent.type
                }
            });
        }

        // Console log events are now processed during aggregation phase
        // Timeline events should be generated from aggregated participant data, not individual sessions

        return events;
    }

    /**
     * Merge participants by displayName (multiple dump files per participant).
     * Consolidates multiple sessions from the same participant into a single participant record.
     *
     * @private
     * @param rawParticipants - Array of raw participant details from individual dump files
     * @returns Array of merged participant details with consolidated session data
     */
    private _mergeParticipantsByDisplayName(rawParticipants: ParticipantDetails[]): ParticipantDetails[] {
        const participantGroups = new Map<string, ParticipantDetails[]>();

        // Group participants by displayName
        for (const participant of rawParticipants) {
            const displayName = participant.displayName;

            if (!participantGroups.has(displayName)) {
                participantGroups.set(displayName, []);
            }
            const group = participantGroups.get(displayName);

            if (group) {
                group.push(participant);
            }
        }

        const mergedParticipants: ParticipantDetails[] = [];

        // Merge each group into a single participant
        participantGroups.forEach((participantList, _displayName) => {
            if (participantList.length === 1) {
                // Single participant, no merging needed but ensure sessionMap is present
                const participant = participantList[0];
                const sessionMap = new Map<string, string>();
                // Use original session UUID from metadata as key, not participant ID
                const originalSessionId = participant.metadata?.originalSessionId;

                if (originalSessionId && participant.endpointId) {
                    sessionMap.set(originalSessionId, participant.endpointId);
                }

                // Parse console logs for media interruption events for single participants too
                const mediaInterruptionEvents = this._parseConsoleLogsForMediaInterruptions(
                    sessionMap,
                    participant.displayName
                );
                const updatedMediaEvents = [ ...participant.mediaEvents, ...mediaInterruptionEvents ];

                mergedParticipants.push({
                    ...participant,
                    mediaEvents: updatedMediaEvents,
                    sessionMap: sessionMap,
                    endpointIds: participant.endpointId ? [ participant.endpointId ] : []
                });
            } else {
                // Multiple participants with same displayName, merge them
                const mergedParticipant = this._mergeParticipantData(participantList);

                mergedParticipants.push(mergedParticipant);
            }
        });

        logger.debug(
            `Merged ${rawParticipants.length} participant files into ${mergedParticipants.length} unique participants`
        );

        return mergedParticipants;
    }

    /**
     * Process global dominant speaker events across all participants.
     * Creates start/stop event pairs based on dominantSpeakerChanged events from RTCStats.
     * When a participant sends dominantSpeakerChanged, they become dominant until another participant sends it.
     *
     * @private
     * @param participants - Array of merged participants with media events
     */
    private _processGlobalDominantSpeakerEvents(participants: ParticipantDetails[]): void {
        // Collect all dominant speaker start events from all participants
        const allDominantSpeakerEvents: Array<{
            displayName: string;
            endpointId: string;
            participantId: string;
            timestamp: number;
        }> = [];

        // Extract dominant speaker events from all participants
        for (const participant of participants) {
            const dominantSpeakerStartEvents = participant.mediaEvents
                .filter(event => event.type === MediaEventType.DOMINANT_SPEAKER_START)
                .map(event => ({
                    timestamp: event.timestamp,
                    participantId: participant.participantId,
                    displayName: participant.displayName,
                    endpointId: participant.endpointId
                }));

            allDominantSpeakerEvents.push(...dominantSpeakerStartEvents);
        }

        // Sort all events by timestamp
        allDominantSpeakerEvents.sort((a, b) => a.timestamp - b.timestamp);

        // Process each participant's media events to add stop events
        for (const participant of participants) {
            const participantDominantEvents = participant.mediaEvents
                .filter(event => event.type === MediaEventType.DOMINANT_SPEAKER_START)
                .sort((a, b) => a.timestamp - b.timestamp);

            // For each start event of this participant, find when they should stop
            for (const startEvent of participantDominantEvents) {
                // Find the next global dominant speaker event (from any participant)
                const nextGlobalEvent = allDominantSpeakerEvents.find(
                    globalEvent =>
                        globalEvent.timestamp > startEvent.timestamp
                        && globalEvent.participantId !== participant.participantId
                );

                // If there's a next speaker, create a stop event
                if (nextGlobalEvent) {
                    participant.mediaEvents.push({
                        timestamp: nextGlobalEvent.timestamp - 1, // Stop just before next speaker starts
                        type: MediaEventType.DOMINANT_SPEAKER_STOP,
                        participantId: participant.participantId,
                        metadata: {
                            dominantSpeakerActive: false
                        }
                    });
                }
            }

            // Sort participant's media events by timestamp
            participant.mediaEvents.sort((a, b) => a.timestamp - b.timestamp);
        }
    }


    /**
     * Merge data from multiple participant dumps for the same person.
     * Combines session data, quality metrics, and media events across multiple sessions.
     *
     * @private
     * @param participants - Array of participant details to merge
     * @returns Single merged participant with consolidated data
     */
    private _mergeParticipantData(participants: ParticipantDetails[]): ParticipantDetails {
        // Use the first participant as base
        const baseParticipant = participants[0];

        // Find earliest join time and latest leave time
        const earliestJoin = Math.min(...participants.map(p => p.joinTime));

        // If any session doesn't have a leave time, the participant is still active
        const hasActiveSession = participants.some(p => !p.leaveTime);
        const latestLeave = hasActiveSession
            ? undefined
            : Math.max(...participants.map(p => p.leaveTime || 0).filter(t => t > 0));

        // Merge all media events from all sessions
        const allMediaEvents = participants.flatMap(p => p.mediaEvents);

        // Average the quality metrics (could be more sophisticated)
        const avgQualityMetrics = {
            audioQuality: participants.reduce((sum, p) => sum + p.qualityMetrics.audioQuality, 0) / participants.length,
            videoQuality: participants.reduce((sum, p) => sum + p.qualityMetrics.videoQuality, 0) / participants.length,
            packetLoss: participants.reduce((sum, p) => sum + p.qualityMetrics.packetLoss, 0) / participants.length,
            jitter: participants.reduce((sum, p) => sum + p.qualityMetrics.jitter, 0) / participants.length,
            roundTripTime:
                participants.reduce((sum, p) => sum + p.qualityMetrics.roundTripTime, 0) / participants.length,
            bandwidth: {
                upload:
                    participants.reduce((sum, p) => sum + p.qualityMetrics.bandwidth.upload, 0) / participants.length,
                download:
                    participants.reduce((sum, p) => sum + p.qualityMetrics.bandwidth.download, 0) / participants.length
            }
        };

        // Collect all endpoint IDs from all participants for console log merging
        const allEndpointIds = participants.map(p => p.endpointId).filter(Boolean);

        // Create session mapping: sessionUUID -> endpointId for accessing underlying session data
        const sessionMap = new Map<string, string>();

        participants.forEach(p => {
            // Use original session UUID from metadata as key, not participant ID
            const originalSessionId = p.metadata?.originalSessionId;

            if (originalSessionId && p.endpointId) {
                sessionMap.set(originalSessionId, p.endpointId);
            }
        });

        logger.debug(`Merged participant ${baseParticipant.displayName}: ${participants.length} sessions,
            ${sessionMap.size} session mappings`
        );

        // Parse console logs for media interruption events using the sessionMap
        const mediaInterruptionEvents = this._parseConsoleLogsForMediaInterruptions(
            sessionMap,
            baseParticipant.displayName
        );

        allMediaEvents.push(...mediaInterruptionEvents);

        // Note: Global dominant speaker processing is handled at session level

        return {
            ...baseParticipant,
            joinTime: earliestJoin,
            leaveTime: latestLeave || undefined,
            endpointId: allEndpointIds[0] || baseParticipant.endpointId,
            mediaEvents: allMediaEvents,
            qualityMetrics: avgQualityMetrics,
            endpointIds: allEndpointIds, // Keep for backward compatibility
            sessionMap: sessionMap // Session UUID -> endpointId mapping for accessing underlying session data
        };
    }

    /**
     * Extract media interruption events from aggregated participant data for stats processing.
     * Processes console logs to find ICE failures and BWE issues across all participants.
     *
     * @private
     * @param participants - Array of participants to extract media interruption events for
     * @returns Promise resolving to array of enhanced call events for media interruptions
     */
    private async _extractMediaInterruptionEvents(participants: ParticipantDetails[]): Promise<EnhancedCallEvent[]> {
        const mediaInterruptionEvents: EnhancedCallEvent[] = [];

        for (const participant of participants) {
            try {
                // Extract all interruption events from mediaEvents
                // - Media interruptions: remote source events
                // - Network issues: BWE issues
                // - Connection issues: strophe errors
                const interruptionEvents = participant.mediaEvents.filter(
                    (event: any) =>
                        event.type === 'media_interruption'
                        || event.type === 'network_issue'
                        || event.type === 'connection_issue'
                        || event.type === 'connection_recovery'
                );

                // Convert to EnhancedCallEvent format for stats processing
                for (const event of interruptionEvents) {
                    const customEvent = event as any; // Type assertion for custom event properties

                    // Determine event type based on the media event type
                    // CLEAR CLASSIFICATION LOGIC:
                    // 1. ICE failures = networkIssue (ICE restart/failure events)
                    // 2. BWE issues = mediaInterruption (bandwidth estimation/remote source events)
                    // 3. Strophe errors = connectionIssue (connection/websocket errors)
                    const eventType = (customEvent.type === 'connection_issue'
                        || customEvent.type === 'connection_recovery')
                        ? CallEventType.CONNECTION_ISSUE
                        : customEvent.type === 'network_issue'
                            ? CallEventType.NETWORK_ISSUE
                            : customEvent.type === 'media_interruption'
                                ? CallEventType.MEDIA_INTERRUPTION
                                : CallEventType.NETWORK_ISSUE; // Default fallback for unknown types

                    mediaInterruptionEvents.push({
                        timestamp: customEvent.timestamp,
                        sessionId: 'real-conference-session',
                        participantId: participant.participantId,
                        eventType: eventType,
                        source: 'analytics',
                        correlationId: `${customEvent.type}_${participant.participantId}_${customEvent.timestamp}`,
                        metadata: {
                            type: customEvent.type,
                            category: customEvent.data?.category || 'unknown',
                            subcategory: customEvent.data?.subcategory || 'unknown',
                            issueType: customEvent.data?.issueType || customEvent.type,
                            displayName: participant.displayName
                        },
                        participant: {
                            endpointId: participant.endpointId,
                            displayName: participant.displayName,
                            clientVersion: participant.jitsiClient.version,
                            osType: participant.clientInfo.os,
                            browserType: participant.clientInfo.browser
                        }
                    });
                }
            } catch (error) {
                logger.warn(
                    `Failed to extract media interruption events for participant ${participant.participantId}:`,
                    error
                );
            }
        }

        return mediaInterruptionEvents;
    }


    // ============================================================================
    // PUBLIC METHODS
    // ============================================================================

    /**
     * Process all dumps and reconstruct conference session.
     * Main entry point that orchestrates processing of all dump files.
     *
     * @returns Promise resolving to a complete CallSession with participants and events
     * @throws Error if dump directory doesn't exist or processing fails
     */
    async processConferenceDumps(): Promise<CallSession> {
        const dumpFiles = this._getDumpFiles();
        const participants: ParticipantDetails[] = [];
        const events: EnhancedCallEvent[] = [];
        let conferenceInfo: any = null;

        // Process client endpoint dumps
        const clientFiles = dumpFiles.filter(file => file.endsWith('.json'));

        logger.debug(`Total dump files found: ${dumpFiles.length}`);
        logger.debug(`File types: ${dumpFiles.map(f => path.extname(f)).join(', ')}`);
        logger.debug(`Processing ${clientFiles.length} client endpoint dumps...`);

        // Phase 1: Process all dump files and collect raw data by component type
        const rawParticipants: ParticipantDetails[] = [];
        const jvbInstances: any[] = [];
        const jicofoInstances: any[] = [];

        for (const file of clientFiles) {
            const participantId = path.basename(file, '.json');
            const componentData = await this._processComponentDump(file, participantId);

            if (componentData) {
                // Extract conference info - prioritize server components (JVB/Jicofo) as they have more complete info
                const currentConferenceInfo = this._extractConferenceInfo(file);

                if (!conferenceInfo) {
                    conferenceInfo = currentConferenceInfo;
                } else if (currentConferenceInfo?.confName && !conferenceInfo.confName) {
                    // Replace with better conference info if current one has confName
                    conferenceInfo = currentConferenceInfo;
                }

                // Route to appropriate collection based on component type
                if (componentData.componentType === 'JVB') {
                    jvbInstances.push(componentData);
                    logger.debug(
                        `Processed JVB instance: ${componentData.displayName || componentData.participantId}`
                    );
                } else if (componentData.componentType === 'Jicofo') {
                    jicofoInstances.push(componentData);
                    logger.debug(
                        `Processed Jicofo instance: ${componentData.displayName || componentData.participantId}`
                    );
                } else if (componentData.componentType === 'participant') {
                    rawParticipants.push(componentData);
                    logger.debug(`Processed participant endpoint: ${componentData.displayName}`);

                    // Extract events from participant data only
                    const participantEvents = await this._extractEventsFromDump(file, componentData);

                    logger.debug(`[DEBUG] Extracted ${participantEvents.length} events for participant
                        ${componentData.displayName}`
                    );
                    events.push(...participantEvents);
                }
            }
        }

        logger.debug(`Component summary: ${rawParticipants.length} participants, ${jvbInstances.length} JVB instances,
            ${jicofoInstances.length} Jicofo instances`
        );

        // Phase 2: Merge participants by displayName to consolidate multiple sessions per participant
        const mergedParticipants = this._mergeParticipantsByDisplayName(rawParticipants);

        participants.push(...mergedParticipants);

        // Phase 3: Extract media interruption events from console logs for stats processing
        logger.debug('[DEBUG] Extracting media interruption events for stats processing...');
        const mediaInterruptionEvents = await this._extractMediaInterruptionEvents(mergedParticipants);

        logger.debug(
            `[DEBUG] Found ${mediaInterruptionEvents.length} media interruption events (ice_failure, bwe_issue)`
        );
        events.push(...mediaInterruptionEvents);

        // Process global dominant speaker events across all participants
        this._processGlobalDominantSpeakerEvents(mergedParticipants);

        // No Jicofo/Bridge data processing for this dataset

        // Sort events by timestamp
        events.sort((a, b) => a.timestamp - b.timestamp);

        // Calculate session timing - use conference creation time from dumps if available
        const joinTimes = participants.map(p => p.joinTime);
        const leaveTimes = participants.map(p => p.leaveTime).filter(t => t !== null && t !== undefined) as number[];

        // Extract conference start timestamp from participant dumps
        const conferenceStartTimestamp = await this._extractConferenceStartTimestamp(dumpFiles);
        // Use the earliest of conferenceStartTimestamp or any participant joinTime
        // Some participants may connect before the conference officially starts
        const startTime = conferenceStartTimestamp
            ? Math.min(conferenceStartTimestamp, ...joinTimes)
            : Math.min(...joinTimes);

        // Better end time calculation: use the latest leave time if available,
        // otherwise fall back to the latest timestamp from any participant's data
        let endTime: number;

        if (leaveTimes.length > 0) {
            endTime = Math.max(...leaveTimes);
        } else {
            // Find the latest timestamp from all participant dump files as fallback
            endTime = this._findLatestTimestampFromDumps(dumpFiles);

            if (!endTime) {
                // Final fallback: estimated end time based on session start + reasonable duration
                endTime = startTime + 30 * 60 * 1000; // Assume 30 minute max session
                logger.warn('Could not determine session end time, using estimated duration');
            }
        }

        // Extract conference name from the conference data - use generic fallback if not found
        // Conference name should come from identity data in dump files
        let confName = conferenceInfo?.confName || 'unknown-room';

        // Clean up the confName (remove @conference.domain if present)
        if (confName?.includes('@')) {
            confName = confName.split('@')[0];
        }

        return {
            endTime,
            events,
            metadata: {
                environment: conferenceInfo?.deploymentInfo?.environment,
                jicofoInstances: jicofoInstances.map(jicofo => jicofo.displayName || jicofo.participantId),
                jicofoShard: conferenceInfo?.deploymentInfo?.shard || 'beta-us-ashburn-1-s5',
                jvbInstances: jvbInstances.map(jvb => jvb.displayName || jvb.participantId),
                region: conferenceInfo?.deploymentInfo?.region,
                shard: conferenceInfo?.deploymentInfo?.shard || 'beta-us-ashburn-1-s5',
                source: 'real-dumps'
            },
            metrics: {
                avgAudioQuality:
                    participants.reduce((sum, p) => sum + p.qualityMetrics.audioQuality, 0) / participants.length,
                avgVideoQuality:
                    participants.reduce((sum, p) => sum + p.qualityMetrics.videoQuality, 0) / participants.length,
                dominantSpeakerChanges: 0,
                duration: endTime - startTime,
                networkIssues: [],
                screenshareDuration: 0,
                totalParticipants: participants.length
            },
            participants,
            roomName: confName || 'Real Conference',
            sessionId: confName || 'real-conference-session',
            startTime
        };
    }

    /**
     * Process Jicofo dump for shard information and logs.
     * Extracts conference management data and participant statistics from Jicofo dumps.
     *
     * @param shardId - Jicofo shard ID to find the corresponding dump file
     * @returns Promise resolving to Jicofo data with shard info, logs, and stats, or null if file not found
     * @throws Error if file reading or parsing fails
     */
    public async processJicofoData(shardId?: string): Promise<any> {
        try {
            if (!shardId) {
                logger.warn('Shard ID not provided');

                return null;
            }

            // Read all JSON files in the dumps directory to find Jicofo data
            const dumpsFiles = fs.readdirSync(this.dumpsPath).filter(file => file.endsWith('.json'));

            logger.debug(`Looking for jicofo shard ${shardId} in ${dumpsFiles.length} dump files from
                ${this.dumpsPath}`);
            let jicofoData = null;

            for (const file of dumpsFiles) {
                const filePath = path.join(this.dumpsPath, file);
                const fileContent = fs.readFileSync(filePath, 'utf-8');

                // Parse dump data as lines of JSON entries (same format as _processComponentDump)
                const entries = fileContent
                    .split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));

                // Extract identity information from entries (handle both array and object formats)
                let identityInfo: any = null;

                for (const entry of entries) {
                    // Handle array format: ["identity", null, entryData, timestamp]
                    if (Array.isArray(entry) && entry[0] === DumpEventType.IDENTITY && entry[2]) {
                        identityInfo = entry[2];
                        break;

                    // Handle object format: {"type":"identity", "data": {...}}
                    } else if (entry.type === DumpEventType.IDENTITY && entry.data) {
                        identityInfo = entry.data;
                        break;
                    }
                }

                // Check if this file contains Jicofo data with the matching shard ID
                logger.debug(`File ${file}: applicationName=${identityInfo?.applicationName},
                    displayName=${identityInfo?.displayName}`);

                if (identityInfo?.applicationName === 'Jicofo' && identityInfo?.displayName === shardId) {
                    jicofoData = {
                        displayName: identityInfo.displayName,
                        instanceId: file.replace('.json', ''),
                        componentType: 'Jicofo',
                        applicationName: 'Jicofo',
                        entries: entries,
                        sessions: []
                    };
                    break;
                }
            }

            if (!jicofoData) {
                logger.warn(`No dump data found for jicofo shard ${shardId}`);

                return null;
            }

            return {
                jicofo: {
                    id: shardId,
                    logs: jicofoData.entries,
                    componentType: jicofoData.componentType,
                    applicationName: jicofoData.applicationName,
                    instanceId: jicofoData.instanceId,
                    displayName: jicofoData.displayName
                }
            };
        } catch (error) {
            logger.error('Error processing Jicofo data:', error);

            return null;
        }
    }

    /**
     * Process Bridge dump for JVB information and logs.
     * Extracts bridge metrics, endpoint statistics, and connection data from JVB dumps.
     *
     * @returns Promise resolving to bridge data with metrics, logs, and stats, or null if file not found
     * @throws Error if file reading or parsing fails
     */
    public async processBridgeData(bridgeId?: string): Promise<any> {
        try {
            if (!bridgeId) {
                logger.warn('Bridge ID not provided');

                return null;
            }

            // Read all JSON files in the dumps directory to find JVB data
            const dumpsFiles = fs.readdirSync(this.dumpsPath).filter(file => file.endsWith('.json'));

            logger.debug(`Looking for bridge ${bridgeId} in ${dumpsFiles.length} dump files from ${this.dumpsPath}`);
            let jvbData = null;

            for (const file of dumpsFiles) {
                const filePath = path.join(this.dumpsPath, file);
                const fileContent = fs.readFileSync(filePath, 'utf-8');

                // Parse dump data as lines of JSON entries (same format as _processComponentDump)
                const entries = fileContent
                    .split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));

                // Extract identity information from entries (handle both array and object formats)
                let identityInfo: any = null;

                for (const entry of entries) {
                    // Handle array format: ["identity", null, entryData, timestamp]
                    if (Array.isArray(entry) && entry[0] === DumpEventType.IDENTITY && entry[2]) {
                        identityInfo = entry[2];
                        break;

                    // Handle object format: {"type":"identity", "data": {...}}
                    } else if (entry.type === DumpEventType.IDENTITY && entry.data) {
                        identityInfo = entry.data;
                        break;
                    }
                }

                // Check if this file contains JVB data with the matching bridge ID
                logger.debug(`File ${file}: applicationName=${identityInfo?.applicationName},
                    displayName=${identityInfo?.displayName}`);

                if (identityInfo?.applicationName === 'JVB' && identityInfo?.displayName === bridgeId) {
                    jvbData = {
                        displayName: identityInfo.displayName,
                        instanceId: file.replace('.json', ''),
                        componentType: 'JVB',
                        applicationName: 'JVB',
                        entries: entries,
                        sessions: []
                    };
                    break;
                }
            }

            if (!jvbData) {
                logger.warn(`No dump data found for bridge ${bridgeId}`);

                return null;
            }

            return {
                bridge: {
                    id: bridgeId,
                    displayName: jvbData.displayName,
                    instanceId: jvbData.instanceId,
                    status: 'active',
                    componentType: jvbData.componentType,
                    applicationName: jvbData.applicationName,
                    sessions: jvbData.sessions || [],
                    lastSeen: Date.now()
                },
                logs: jvbData.entries || [],
                performance: {
                    cpu: 0,
                    memory: 0,
                    network: 0
                }
            };
        } catch (error) {
            logger.error('Error processing Bridge data:', error);

            return null;
        }
    }

    // ============================================================================
    // PARTICIPANT DATA ANALYSIS METHODS (using the helper functions above)
    // ============================================================================

    /**
     * Print participant structure for verification.
     * Debugging method that shows how a participant's sessions are structured.
     *
     * @param displayName - The participant's display name to analyze
     * @returns Promise that resolves when analysis is complete
     */
    public async printParticipantStructure(displayName: string): Promise<void> {
        try {
            logger.debug('\n=== PARTICIPANT STRUCTURE VERIFICATION ===');
            logger.debug(`Looking for participant with displayName: "${displayName}"\n`);

            // Process all dump files to find this participant
            const dumpFiles = this._getDumpFiles();
            const clientFiles = dumpFiles.filter(file => file.endsWith('.json'));

            // Find all sessions for this participant
            const participantSessions: { displayName: string; endpointId: string; sessionId: string; }[] = [];

            for (const file of clientFiles) {
                const sessionId = path.basename(file, '.json');

                try {
                    const data = fs.readFileSync(file, 'utf8');
                    const lines = data.split('\n').filter(line => line.trim());

                    // Look for identity data in first few lines
                    for (const line of lines.slice(0, 10)) {
                        try {
                            const entry = JSON.parse(line);

                            if (Array.isArray(entry) && entry[0] === DumpEventType.IDENTITY && entry[2]) {
                                const identityData = entry[2];

                                if (identityData.displayName === displayName) {
                                    participantSessions.push({
                                        sessionId: sessionId,
                                        endpointId: identityData.endpointId,
                                        displayName: identityData.displayName
                                    });
                                    break;
                                }
                            }
                        } catch (parseError) {
                            continue;
                        }
                    }
                } catch (fileError) {
                    continue;
                }
            }

            if (participantSessions.length === 0) {
                logger.debug(`No sessions found for participant "${displayName}"`);

                return;
            }

            // Generate participant ID
            const participantId = this._generateParticipantId(displayName);

            // Create sessions Map<endpointId, sessionId>
            const sessionsMap = new Map<string, string>();

            for (const session of participantSessions) {
                sessionsMap.set(session.endpointId, session.sessionId);
            }

            logger.debug(`Found ${participantSessions.length} sessions for participant "${displayName}":`);
            logger.debug(`   Generated participantId: ${participantId}\n`);

            logger.debug('Sessions Map<endpointId, sessionId>:');
            Array.from(sessionsMap.entries()).forEach(([ endpointId, sessionId ]) => {
                logger.debug(`   "${endpointId}" -> "${sessionId}"`);
            });

            logger.debug('\n📋 Session Timeline:');
            for (const session of participantSessions) {
                logger.debug(`   - EndpointId: ${session.endpointId}`);
                logger.debug(`     SessionId:  ${session.sessionId}`);
                logger.debug(`     DisplayName: ${session.displayName}`);
                logger.debug('');
            }

            logger.debug('=== END PARTICIPANT STRUCTURE VERIFICATION ===\n');
        } catch (error) {
            logger.error(`Error printing participant structure for ${displayName}:`, error);
        }
    }

    /**
     * Get merged console logs for a participant from all their session files.
     * Uses session UUIDs instead of endpoint IDs for proper file lookup and merges logs chronologically.
     *
     * @param participantId - The participant ID or display name to get logs for
     * @param _sessionId - Optional session ID (unused in current implementation)
     * @returns Promise resolving to merged console logs with metadata
     */
    public async getParticipantConsoleLogs(participantId: string, _sessionId?: string): Promise<any> {
        try {
            // Find the participant in the processed session data
            const session = await this.processConferenceDumps();
            const participant = session.participants.find(
                p => p.participantId === participantId || p.displayName === participantId
            );

            if (!participant?.sessionMap?.size) {
                logger.warn(`No session mappings found for participant: ${participantId}`);

                return;
            }

            const sessionIds = Array.from(participant.sessionMap.keys());

            logger.debug(`Found ${sessionIds.length} session IDs for participant ${participant.displayName}:
                ${sessionIds.join(', ')}`
            );

            // Fetch logs from all session UUID files
            const allLogs: any[] = [];
            let totalLines = 0;
            const sessionResults: any[] = [];

            for (const sessionUUID of sessionIds) {
                const sessionLogs = await this._getSessionConsoleLogs(sessionUUID);
                const endpointId = participant.sessionMap.get(sessionUUID);

                sessionResults.push({
                    sessionId: sessionUUID,
                    endpointId: endpointId,
                    logCount: sessionLogs.logs.length,
                    fileExists: sessionLogs.fileExists
                });

                if (sessionLogs.logs && sessionLogs.logs.length > 0) {
                    // Add session context to each log entry
                    const logsWithContext = sessionLogs.logs.map((log: any) => ({
                        ...log,
                        sourceSessionId: sessionUUID,
                        sourceEndpointId: endpointId,
                        participantId: participant.participantId
                    }));

                    allLogs.push(...logsWithContext);
                }
                totalLines += sessionLogs.totalLines;
            }

            // Sort all logs by timestamp (chronological order - oldest first)
            allLogs.sort((a, b) => a.timestamp - b.timestamp);

            logger.debug(`Merged ${allLogs.length} console log entries from ${sessionIds.length} sessions for
                participant ${participant.displayName}`
            );

            return {
                participantId: participant.participantId,
                displayName: participant.displayName,
                logs: allLogs,
                totalLines,
                sessionIds,
                sessionResults,
                fileExists: sessionResults.some(r => r.fileExists)
            };
        } catch (error) {
            logger.error(`Error reading participant logs for ${participantId}:`, error);

            return {
                participantId,
                logs: [],
                totalLines: 0,
                sessionIds: [],
                fileExists: false,
                error: (error as Error).message
            };
        }
    }

    /**
     * Get RTCStats data for a participant (by displayName or endpointId).
     * Uses processed session data instead of re-scanning files for efficiency.
     *
     * @param participantId - The participant ID or display name to get RTCStats for
     * @param _sessionId - Optional session ID (unused in current implementation)
     * @returns Promise resolving to array of RTCStats entries for the participant
     * @throws Error if session processing fails
     */
    public async getParticipantRTCStats(participantId: string, _sessionId?: string): Promise<any[]> {
        try {
            // Get processed session data to find participant's session mappings
            const processedSession = await this.processConferenceDumps();
            const participant = processedSession.participants.find(
                p => p.participantId === participantId || p.displayName === participantId
            );

            if (!participant?.sessionMap?.size) {
                logger.warn(`No session mappings found for participant: ${participantId}`);

                return [];
            }

            const sessionUUIDs = Array.from(participant.sessionMap.keys());
            const allStats: any[] = [];

            logger.debug(`Processing RTCStats for ${participant.displayName} from ${sessionUUIDs.length} sessions:
                ${sessionUUIDs.join(', ')}`
            );

            // Process each session file
            for (const sessionUUID of sessionUUIDs) {
                const filePath = path.join(this.dumpsPath, `${sessionUUID}.json`);
                const endpointId = participant.sessionMap.get(sessionUUID);

                if (fs.existsSync(filePath)) {
                    try {
                        const sessionStats = await this._processNDJSONFile(
                            filePath,
                            // Filter: Only include RTCStats entries (array format starting with "getstats")
                            entry => Array.isArray(entry) && entry.length >= 4 && entry[0] === DumpEventType.GETSTATS,
                            // Transformer: Add session and endpoint context
                            (entry, _sessionIdParam) => [ ...entry, sessionUUID, endpointId ]
                        );

                        allStats.push(...sessionStats);
                    } catch (error) {
                        logger.warn(`Error processing RTCStats from ${sessionUUID}:`, error);
                    }
                } else {
                    logger.warn(`Session file not found: ${filePath}`);
                }
            }

            // Sort by timestamp
            allStats.sort((a: any[], b: any[]) => {
                const timestampA = a[3] || 0; // timestamp is at index 3 in getstats entries
                const timestampB = b[3] || 0;

                return timestampA - timestampB;
            });

            logger.debug(`Collected ${allStats.length} RTCStats events from ${sessionUUIDs.length} sessions for
                participant ${participant.displayName}`
            );

            return allStats;
        } catch (error) {
            logger.error('Error getting participant RTCStats:', error);
            throw error;
        }
    }

    /**
     * Get WebRTC connection events for a participant.
     * Uses efficient session data lookup instead of file scanning to find connection-related events.
     *
     * @param participantId - The participant ID or display name to get connection events for
     * @returns Promise resolving to array of connection events for the participant
     * @throws Error if session processing fails
     */
    public async getParticipantConnectionEvents(participantId: string): Promise<any[]> {
        try {
            // Get processed session data to find participant's session mappings
            const processedSession = await this.processConferenceDumps();
            const participant = processedSession.participants.find(
                p => p.participantId === participantId || p.displayName === participantId
            );

            if (!participant?.sessionMap) {
                logger.debug(`No sessions found for participant ${participantId}`);

                return [];
            }

            const sessionUUIDs = Array.from(participant.sessionMap.keys());
            const allConnectionEvents: any[] = [];
            const processedEndpoints = new Set<string>();

            // Process each session file using session UUIDs instead of scanning all files
            for (const sessionUUID of sessionUUIDs) {
                const endpointId = participant.sessionMap.get(sessionUUID);

                if (!endpointId) continue;

                processedEndpoints.add(endpointId);
                const filePath = path.join(this.dumpsPath, `${sessionUUID}.json`);

                if (!fs.existsSync(filePath)) {
                    logger.warn(`Session file not found: ${filePath}`);
                    continue;
                }

                const sessionEvents = await this._processNDJSONFile(
                    filePath,
                    // Filter: Only connection-related events
                    entry => {
                        if (!Array.isArray(entry) || entry.length < 1) return false;
                        const eventType = entry[0];

                        return [
                            'iceConnectionState',
                            'connectionState',
                            'signalingState',
                            'iceCandidate',
                            'datachannel'
                        ].includes(eventType);
                    },
                    // Transformer: Structure the data with session context
                    entry => ({
                        eventType: entry[0],
                        connectionId: entry[1],
                        data: entry[2],
                        timestamp: entry[3],
                        sequence: entry[4],
                        endpointId,
                        sessionUUID
                    })
                );

                allConnectionEvents.push(...sessionEvents);
            }

            // Sort by timestamp to maintain chronological order
            allConnectionEvents.sort((a, b) => a.timestamp - b.timestamp);

            logger.debug(`Found ${allConnectionEvents.length} connection events from ${processedEndpoints.size}
                endpoints for participant ${participantId}`
            );

            return allConnectionEvents;
        } catch (error) {
            logger.error('Error getting participant connection events:', error);
            throw error;
        }
    }

    /**
     * Get media track events for a participant.
     * Uses efficient session data lookup instead of file scanning to find media-related events.
     *
     * @param participantId - The participant ID or display name to get media events for
     * @returns Promise resolving to array of media track events for the participant
     * @throws Error if session processing fails
     */
    public async getParticipantMediaEvents(participantId: string): Promise<any[]> {
        try {
            // Get processed session data to find participant's session mappings
            const processedSession = await this.processConferenceDumps();
            const participant = processedSession.participants.find(
                p => p.participantId === participantId || p.displayName === participantId
            );

            if (!participant?.sessionMap) {
                logger.debug(`No sessions found for participant ${participantId}`);

                return [];
            }

            const sessionUUIDs = Array.from(participant.sessionMap.keys());
            const allMediaEvents: any[] = [];
            const processedEndpoints = new Set<string>();

            // Process each session file using session UUIDs instead of scanning all files
            for (const sessionUUID of sessionUUIDs) {
                const endpointId = participant.sessionMap.get(sessionUUID);

                if (!endpointId) continue;

                processedEndpoints.add(endpointId);
                const filePath = path.join(this.dumpsPath, `${sessionUUID}.json`);

                if (!fs.existsSync(filePath)) {
                    logger.warn(`Session file not found: ${filePath}`);
                    continue;
                }

                const sessionEvents = await this._processNDJSONFile(
                    filePath,
                    // Filter: Only media-related events
                    entry => {
                        if (!Array.isArray(entry) || entry.length < 1) return false;
                        const eventType = entry[0];

                        return [ 'track', 'mute', 'unmute' ].includes(eventType);
                    },
                    // Transformer: Create structured media events with session context
                    entry => ({
                        eventType: entry[0],
                        trackId: entry[1],
                        trackInfo: entry[2],
                        timestamp: entry[3],
                        endpointId,
                        sessionUUID,
                        mediaType:
                            entry[2] && typeof entry[2] === 'string'
                                ? entry[2].includes('audio')
                                    ? 'audio'
                                    : 'video'
                                : 'unknown'
                    })
                );

                allMediaEvents.push(...sessionEvents);
            }

            // Sort by timestamp to maintain chronological order
            allMediaEvents.sort((a, b) => a.timestamp - b.timestamp);

            logger.debug(`Found ${allMediaEvents.length} media events from ${processedEndpoints.size} endpoints for
                participant ${participantId}`
            );

            return allMediaEvents;
        } catch (error) {
            logger.error('Error getting participant media events:', error);
            throw error;
        }
    }
}

export default DumpProcessor;
