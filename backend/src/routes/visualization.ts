/**
 * Visualization Routes
 * Provides RTC visualizer compatible endpoints for WebRTC stats visualization
 */

import { getLogger } from '@jitsi/logger';
import { Router } from 'express';

import { RTCStatsEnvironment } from '../../../shared/types/rtcstats';
import DumpProcessor from '../services/DumpProcessor';
import RTCStatsService from '../services/RTCStatsService';
import { ApiErrorCode, HttpStatus } from '../types/api';

const logger = getLogger('backend/src/routes/visualization');

const router = Router();
const rtcStatsService = new RTCStatsService();

/**
 * Get participant visualization data compatible with rtc-visualizer
 * Returns individual session data for each session UUID (not merged)
 * Format matches rtc-visualizer's expected data structure
 */
router.get('/participant/:participantId', async (req, res) => {
    try {
        const { participantId } = req.params;
        const { rtcstats, conferenceId, environment, dumpsPath } = req.query;

        logger.debug(`Fetching visualization data for participant: ${participantId}`);

        // Determine which dump processor to use
        let processor: DumpProcessor;
        let session;
        let actualDumpsPath: string;

        if (rtcstats === 'true' && conferenceId && environment) {
            // Use RTCStats dumps
            actualDumpsPath = rtcStatsService.getConferenceDumpsPath(
                conferenceId as string,
                environment as RTCStatsEnvironment
            );
            logger.debug(`Using RTCStats dumps path: ${actualDumpsPath}`);
            processor = new DumpProcessor(actualDumpsPath);
            session = await processor.processConferenceDumps();
        } else if (dumpsPath) {
            // Use custom dumps path
            actualDumpsPath = dumpsPath as string;
            logger.debug(`Using custom dumps path: ${actualDumpsPath}`);
            processor = new DumpProcessor(actualDumpsPath);
            session = await processor.processConferenceDumps();
        } else {
            return res.apiError({
                code: ApiErrorCode.MISSING_PARAMETER,
                message: 'RTCStats parameters (conferenceId, environment) or dumps path is required'
            }, HttpStatus.BAD_REQUEST);
        }
        const participant = session.participants.find(
            p => p.participantId === participantId || p.displayName === participantId
        );

        if (!participant?.sessionMap?.size) {
            return res.apiError({
                code: ApiErrorCode.PARTICIPANT_NOT_FOUND,
                message: 'Participant not found or has no sessions',
                details: { participantId }
            }, HttpStatus.NOT_FOUND);
        }

        const sessionUUIDs = Array.from(participant.sessionMap.keys());
        const visualizationData = [];

        logger.debug(`Processing ${sessionUUIDs.length} sessions for participant: ${participant.displayName}`);

        // Process each session UUID individually (not merged)
        for (const sessionUUID of sessionUUIDs) {
            const endpointId = participant.sessionMap.get(sessionUUID);

            logger.trace(`Processing session ${sessionUUID} with endpoint ${endpointId}`);

            // Get RTCStats data for this specific session
            const sessionPath = `${actualDumpsPath}/${sessionUUID}.json`;

            const rtcStats = await (processor as any)._processNDJSONFile(
                sessionPath,
                // Filter: Only include RTCStats entries (getstats events)
                (entry: any) => Array.isArray(entry) && entry.length >= 4 && entry[0] === 'getstats',
                // Transformer: Convert to rtc-visualizer format
                (entry: any) => ({
                    timestamp: entry[3], // timestamp is at index 3
                    connectionId: entry[1], // connection ID at index 1
                    data: entry[2] // RTCStats data at index 2
                })
            );

            // Get connection events for this session
            const connectionEvents = await (processor as any)._processNDJSONFile(
                sessionPath,
                // Filter: Connection-related events
                (entry: any) => {
                    if (!Array.isArray(entry) || entry.length < 1) return false;

                    return [
                        'iceConnectionState',
                        'connectionState',
                        'signalingState',
                        'iceCandidate',
                        'datachannel'
                    ].includes(entry[0]);
                },
                // Transformer: Convert to rtc-visualizer format
                (entry: any) => ({
                    timestamp: entry[3],
                    type: entry[0],
                    connectionId: entry[1],
                    data: entry[2]
                })
            );

            // Get media track events for this session
            const mediaEvents = await (processor as any)._processNDJSONFile(
                sessionPath,
                // Filter: Media-related events
                (entry: any) => {
                    if (!Array.isArray(entry) || entry.length < 1) return false;

                    return [ 'addTrack', 'removeTrack', 'track', 'mute', 'unmute' ].includes(entry[0]);
                },
                // Transformer: Convert to rtc-visualizer format
                (entry: any) => ({
                    timestamp: entry[3],
                    type: entry[0],
                    trackId: entry[1],
                    data: entry[2]
                })
            );

            // Create rtc-visualizer compatible session data
            const sessionData = {
                sessionId: sessionUUID,
                endpointId,
                displayName: participant.displayName,
                participantId: participant.participantId,
                stats: rtcStats.sort((a: any, b: any) => a.timestamp - b.timestamp),
                connectionEvents: connectionEvents.sort((a: any, b: any) => a.timestamp - b.timestamp),
                mediaEvents: mediaEvents.sort((a: any, b: any) => a.timestamp - b.timestamp),
                metadata: {
                    startTime: rtcStats.length > 0 ? Math.min(...rtcStats.map((s: any) => s.timestamp)) : Date.now(),
                    endTime: rtcStats.length > 0 ? Math.max(...rtcStats.map((s: any) => s.timestamp)) : Date.now(),
                    duration: rtcStats.length > 0
                        ? Math.max(...rtcStats.map((s: any) => s.timestamp))
                            - Math.min(...rtcStats.map((s: any) => s.timestamp))
                        : 0,
                    statsCount: rtcStats.length,
                    connectionEventsCount: connectionEvents.length,
                    mediaEventsCount: mediaEvents.length
                }
            };

            visualizationData.push(sessionData);
        }

        logger.debug(`Generated visualization data for ${visualizationData.length} sessions`);

        // Sort sessions chronologically by start time
        visualizationData.sort((a, b) => a.metadata.startTime - b.metadata.startTime);

        res.apiSuccess({
            participantId: participant.participantId,
            displayName: participant.displayName,
            sessions: visualizationData,
            summary: {
                totalSessions: visualizationData.length,
                totalStats: visualizationData.reduce((sum, s) => sum + s.stats.length, 0),
                totalConnectionEvents: visualizationData.reduce((sum, s) => sum + s.connectionEvents.length, 0),
                totalMediaEvents: visualizationData.reduce((sum, s) => sum + s.mediaEvents.length, 0),
                sessionIds: sessionUUIDs
            }
        });

    } catch (error) {
        logger.error(`Error fetching visualization data for ${req.params.participantId}:`, error);
        res.apiError({
            code: ApiErrorCode.INTERNAL_ERROR,
            message: 'Failed to fetch visualization data',
            details: (error as Error).message
        }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
});

/**
 * Get individual session visualization data (rtc-visualizer compatible)
 * Returns data for a specific session UUID in rtc-visualizer format
 */
router.get('/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { rtcstats, conferenceId, environment, dumpsPath } = req.query;

        logger.debug(`Fetching visualization data for session: ${sessionId}`);

        // Determine which dump processor to use
        let processor: DumpProcessor;
        let actualDumpsPath: string;

        if (rtcstats === 'true' && conferenceId && environment) {
            // Use RTCStats dumps
            actualDumpsPath = rtcStatsService.getConferenceDumpsPath(
                conferenceId as string,
                environment as RTCStatsEnvironment
            );
            logger.debug(`Using RTCStats dumps path for session: ${actualDumpsPath}`);
            processor = new DumpProcessor(actualDumpsPath);
        } else if (dumpsPath) {
            // Use custom dumps path
            actualDumpsPath = dumpsPath as string;
            logger.debug(`Using custom dumps path for session: ${actualDumpsPath}`);
            processor = new DumpProcessor(actualDumpsPath);
        } else {
            return res.apiError({
                code: ApiErrorCode.MISSING_PARAMETER,
                message: 'RTCStats parameters (conferenceId, environment) or dumps path is required'
            }, HttpStatus.BAD_REQUEST);
        }

        // Get RTCStats data for this session
        const sessionPath = `${actualDumpsPath}/${sessionId}.json`;

        const rtcStats = await (processor as any)._processNDJSONFile(
            sessionPath,
            (entry: any) => Array.isArray(entry) && entry.length >= 4 && entry[0] === 'getstats',
            (entry: any) => ({
                timestamp: entry[3],
                connectionId: entry[1],
                data: entry[2]
            })
        );

        // Get connection events
        const connectionEvents = await (processor as any)._processNDJSONFile(
            sessionPath,
            (entry: any) => {
                if (!Array.isArray(entry) || entry.length < 1) return false;

                return [
                    'iceConnectionState',
                    'connectionState',
                    'signalingState',
                    'iceCandidate',
                    'datachannel'
                ].includes(entry[0]);
            },
            (entry: any) => ({
                timestamp: entry[3],
                type: entry[0],
                connectionId: entry[1],
                data: entry[2]
            })
        );

        // Create rtc-visualizer compatible data
        const visualizationData = {
            sessionId,
            stats: rtcStats.sort((a: any, b: any) => a.timestamp - b.timestamp),
            connectionEvents: connectionEvents.sort((a: any, b: any) => a.timestamp - b.timestamp),
            metadata: {
                startTime: rtcStats.length > 0 ? Math.min(...rtcStats.map((s: any) => s.timestamp)) : Date.now(),
                endTime: rtcStats.length > 0 ? Math.max(...rtcStats.map((s: any) => s.timestamp)) : Date.now(),
                duration: rtcStats.length > 0
                    ? Math.max(...rtcStats.map((s: any) => s.timestamp))
                        - Math.min(...rtcStats.map((s: any) => s.timestamp))
                    : 0,
                statsCount: rtcStats.length,
                connectionEventsCount: connectionEvents.length
            }
        };

        res.apiSuccess(visualizationData);

    } catch (error) {
        logger.error(`Error fetching visualization data for session ${req.params.sessionId}:`, error);
        res.apiError({
            code: ApiErrorCode.INTERNAL_ERROR,
            message: 'Failed to fetch session visualization data',
            details: (error as Error).message
        }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
});

/**
 * Get participant sessions list for visualization selection
 * Returns list of sessions for a participant to choose from
 */
router.get('/participant/:participantId/sessions', async (req, res) => {
    try {
        const { participantId } = req.params;
        const { rtcstats, conferenceId, environment, dumpsPath } = req.query;

        logger.debug(`Fetching sessions list for participant: ${participantId}`);

        // Determine which dump processor to use
        let processor: DumpProcessor;
        let session;
        let actualDumpsPath: string;

        if (rtcstats === 'true' && conferenceId && environment) {
            // Use RTCStats dumps
            actualDumpsPath = rtcStatsService.getConferenceDumpsPath(
                conferenceId as string,
                environment as RTCStatsEnvironment
            );
            logger.debug(`Using RTCStats dumps path for sessions: ${actualDumpsPath}`);
            processor = new DumpProcessor(actualDumpsPath);
            session = await processor.processConferenceDumps();
        } else if (dumpsPath) {
            // Use custom dumps path
            actualDumpsPath = dumpsPath as string;
            logger.debug(`Using custom dumps path for sessions: ${actualDumpsPath}`);
            processor = new DumpProcessor(actualDumpsPath);
            session = await processor.processConferenceDumps();
        } else {
            return res.apiError({
                code: ApiErrorCode.MISSING_PARAMETER,
                message: 'RTCStats parameters (conferenceId, environment) or dumps path is required'
            }, HttpStatus.BAD_REQUEST);
        }
        const participant = session.participants.find(
            p => p.participantId === participantId || p.displayName === participantId
        );

        if (!participant?.sessionMap?.size) {
            return res.apiError({
                code: ApiErrorCode.PARTICIPANT_NOT_FOUND,
                message: 'Participant not found or has no sessions',
                details: { participantId }
            }, HttpStatus.NOT_FOUND);
        }

        const sessionUUIDs = Array.from(participant.sessionMap.keys());
        const sessionsList = [];

        for (const sessionUUID of sessionUUIDs) {
            const endpointId = participant.sessionMap.get(sessionUUID);

            // Get basic session info
            const sessionPath = `${actualDumpsPath}/${sessionUUID}.json`;

            const statsCount = await (processor as any)._processNDJSONFile(
                sessionPath,
                (entry: any) => Array.isArray(entry) && entry.length >= 4 && entry[0] === 'getstats',
                // Transformer: Convert to rtc-visualizer format to get timestamp
                (entry: any) => ({
                    timestamp: entry[3], // timestamp is at index 3
                    connectionId: entry[1], // connection ID at index 1
                    data: entry[2] // RTCStats data at index 2
                })
            );

            // Get start time for sorting
            const startTime = statsCount.length > 0 ? Math.min(...statsCount.map((s: any) => s.timestamp)) : Date.now();

            sessionsList.push({
                sessionId: sessionUUID,
                endpointId,
                displayName: participant.displayName,
                statsCount: statsCount.length,
                hasData: statsCount.length > 0,
                startTime: startTime
            });
        }

        // Sort sessions chronologically by start time
        sessionsList.sort((a, b) => a.startTime - b.startTime);

        res.apiSuccess({
            participantId: participant.participantId,
            displayName: participant.displayName,
            sessions: sessionsList,
            totalSessions: sessionsList.length
        });

    } catch (error) {
        logger.error(`Error fetching sessions list for ${req.params.participantId}:`, error);
        res.apiError({
            code: ApiErrorCode.INTERNAL_ERROR,
            message: 'Failed to fetch sessions list',
            details: (error as Error).message
        }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
});

export default router;
