/**
 * Session API Routes
 * Handles call session queries and analytics
 */

import { getLogger } from '@jitsi/logger';
import express, { Request, Response } from 'express';

import {
    CallEventType,
    CallSession,
    EnhancedCallEvent
} from '../../../shared/types';
import { RTCStatsEnvironment } from '../../../shared/types/rtcstats';
import DumpProcessor from '../services/DumpProcessor';
import RTCStatsService from '../services/RTCStatsService';
import { ApiErrorCode, HttpStatus } from '../types/api';

const logger = getLogger('backend/src/routes/sessions');

const router = express.Router();

// Mock data for development
const mockSessions: Map<string, CallSession> = new Map();

// Initialize RTCStats service
const rtcStatsService = new RTCStatsService();

// Helper function to create timeline from session data
function createTimelineFromSession(session: CallSession): any {
    const tracks = session.participants.map(participant => ({
        clientInfo: participant.clientInfo,
        displayName: participant.displayName,
        endTime: participant.leaveTime,
        events: session.events.filter(e => e.participantId === participant.participantId),
        participantId: participant.participantId,
        role: participant.role,
        startTime: participant.joinTime,
        status: participant.leaveTime ? 'left' : 'active'
    }));

    return {
        sessionOverview: {
            duration: session.endTime ? session.endTime - session.startTime : Date.now() - session.startTime,
            events: session.events.length,
            participants: session.participants.length
        },
        tracks
    };
}

/**
 * Analyze real conference dumps to extract session data and metrics
 *
 * @api {GET} /api/sessions/analyze/real Analyze real conference dumps
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with session data, statistics, and timeline
 * @returns {boolean} returns.success - Whether the operation was successful
 * @returns {Object} returns.data - Session analysis data
 * @returns {CallSession} returns.data.session - Complete session data from real dumps
 * @returns {Object} returns.data.stats - Calculated session statistics
 * @returns {number} returns.data.stats.meetingDuration - Duration of the meeting in milliseconds
 * @returns {number} returns.data.stats.totalUsers - Total number of participants
 * @returns {number} returns.data.stats.peakConcurrent - Peak concurrent participants
 * @returns {Object} returns.data.stats.backendComponents - Backend infrastructure components
 * @returns {string[]} returns.data.stats.backendComponents.jvbs - JVB instances
 * @returns {string[]} returns.data.stats.backendComponents.shards - Jicofo shards
 * @returns {string[]} returns.data.stats.backendComponents.jibris - Jibri instances
 * @returns {Object} returns.data.stats.qualityMetrics - Quality metrics from real data
 * @returns {Object} returns.data.timeline - Timeline data for visualization
 * @throws {500} Internal server error if dump processing fails
 * @throws {Error} Specific error message about dump processing failure
 */
router.get('/analyze/real', async (req: Request, res: Response) => {
    try {
        const { conferenceId, environment, rtcstatsMode } = req.query;

        logger.info('Processing real conference dumps...', { conferenceId, environment, rtcstatsMode });

        let session: CallSession;
        let processor: DumpProcessor;

        // RTCStats mode: Use RTCStats downloaded dumps
        if (rtcstatsMode === 'true' && conferenceId && environment) {
            const actualDumpsPath = rtcStatsService.getConferenceDumpsPath(
                conferenceId as string,
                environment as RTCStatsEnvironment
            );

            logger.debug(`Using RTCStats dumps path: ${actualDumpsPath}`);

            // Get component metadata from DynamoDB
            // This provides reliable information about participants, JVBs, and Jicofo
            let componentMetadata;

            try {
                componentMetadata = await rtcStatsService.getConferenceComponents(
                    conferenceId as string,
                    environment as RTCStatsEnvironment
                );

                logger.debug('Component metadata from DynamoDB:', {
                    participantCount: componentMetadata.participants.length,
                    jvbCount: componentMetadata.jvbs.length,
                    jicofoCount: componentMetadata.jicofo.length,
                    participants: componentMetadata.participants.map(p => ({
                        displayName: p.displayName,
                        durationMs: p.durationMs
                    }))
                });
            } catch (error) {
                logger.warn('Failed to retrieve component metadata from DynamoDB:', error);
                // Continue with dump processing even if metadata retrieval fails
            }

            // Pass metadata to DumpProcessor for enhanced analysis
            processor = new DumpProcessor(actualDumpsPath, componentMetadata);
            session = await processor.processConferenceDumps();

            // Validate that we got actual data
            if (!session.participants || session.participants.length === 0) {
                throw new Error('No participants found, the conference may not be fully downloaded yet.');
            }
        } else {
            throw new Error('Conference ID and environment are required for real conference dump analysis');
        }

        // Apply the same complete classification logic used in participant events
        // Process all participant mediaEvents to generate comprehensive events
        const allProcessedEvents: EnhancedCallEvent[] = [ ...session.events ];

        // Process media events for each participant to generate network and media events
        session.participants.forEach(participant => {
            const networkAndMediaEvents: EnhancedCallEvent[] = [];

            if (participant.mediaEvents) {
                participant.mediaEvents.forEach((mediaEvent: any) => {
                    const extendedMediaEvent = mediaEvent as any;

                    // CLEAR CLASSIFICATION LOGIC:
                    // 1. ICE failures = networkIssue (ICE restart/failure events)
                    // 2. BWE issues = mediaInterruption (bandwidth estimation/remote source events)
                    // 3. Strophe errors = connectionIssue (connection/websocket errors)

                    const isIceFailure = extendedMediaEvent.subcategory === 'ice_failures'
                        || (extendedMediaEvent.data
                            && typeof extendedMediaEvent.data === 'string'
                            && extendedMediaEvent.data.includes('ice restart'));

                    const isBweIssue = extendedMediaEvent.subcategory === 'remote_source_events'
                        || (extendedMediaEvent.name && (
                            extendedMediaEvent.name.includes('remoteSourceSuspended')
                            || extendedMediaEvent.name.includes('remoteSourceInterrupted')
                            || extendedMediaEvent.name.includes('RemoteSourceSuspended')
                            || extendedMediaEvent.name.includes('RemoteSourceInterrupted')
                        ))
                        || (extendedMediaEvent.data && typeof extendedMediaEvent.data === 'string' && (
                            extendedMediaEvent.data.includes('remoteSourceSuspended')
                            || extendedMediaEvent.data.includes('remoteSourceInterrupted')
                        ));

                    const isStropheError = extendedMediaEvent.subcategory === 'connection_errors'
                        || extendedMediaEvent.subcategory === 'websocket_errors'
                        || (extendedMediaEvent.data && typeof extendedMediaEvent.data === 'string' && (
                            extendedMediaEvent.data.includes('strophe')
                            || extendedMediaEvent.data.includes('websocket')
                            || extendedMediaEvent.data.includes('connection failed')
                            || extendedMediaEvent.data.includes('connection lost')
                        ))
                        || (extendedMediaEvent.name && (
                            extendedMediaEvent.name.includes('connection')
                            || extendedMediaEvent.name.includes('websocket')
                            || extendedMediaEvent.name.includes('strophe')
                        ));

                    if (isIceFailure) {
                        // ICE failures are Network Issues
                        networkAndMediaEvents.push({
                            timestamp: mediaEvent.timestamp,
                            sessionId: 'real-conference-session',
                            participantId: participant.participantId || participant.displayName,
                            eventType: CallEventType.NETWORK_ISSUE,
                            source: 'client',
                            correlationId: `ice_failure_${mediaEvent.timestamp}`,
                            participant: {
                                endpointId: extendedMediaEvent.endpointId || participant.endpointId,
                                displayName: participant.displayName,
                                clientVersion: participant.jitsiClient?.version || 'unknown',
                                osType: participant.clientInfo?.os || 'unknown',
                                browserType: participant.clientInfo?.browser || 'unknown'
                            },
                            technicalContext: {
                                userAgent: participant.connection?.userAgent || '',
                                webrtcStats: {},
                                networkConditions: participant.qualityMetrics ? {
                                    rtt: participant.qualityMetrics.roundTripTime,
                                    packetLoss: participant.qualityMetrics.packetLoss,
                                    jitter: participant.qualityMetrics.jitter,
                                    bandwidth: {
                                        available: participant.qualityMetrics.bandwidth?.download || 0,
                                        used: participant.qualityMetrics.bandwidth?.upload || 0
                                    },
                                    connectionType: participant.connection?.networkType || 'unknown',
                                    quality: 'fair'
                                } : undefined
                            },
                            metadata: {
                                type: 'ICE failure',
                                category: extendedMediaEvent.category || 'network_issue',
                                subcategory: extendedMediaEvent.subcategory || 'ice_failures',
                                subType: 'ice_restart'
                            }
                        });
                    } else if (isBweIssue || extendedMediaEvent.category === 'media_interruption') {
                        // BWE issues are Media Interruptions
                        networkAndMediaEvents.push({
                            timestamp: mediaEvent.timestamp,
                            sessionId: 'real-conference-session',
                            participantId: participant.participantId || participant.displayName,
                            eventType: CallEventType.MEDIA_INTERRUPTION,
                            source: 'client',
                            correlationId: `bwe_issue_${mediaEvent.timestamp}`,
                            participant: {
                                endpointId: extendedMediaEvent.endpointId || participant.endpointId,
                                displayName: participant.displayName,
                                clientVersion: participant.jitsiClient?.version || 'unknown',
                                osType: participant.clientInfo?.os || 'unknown',
                                browserType: participant.clientInfo?.browser || 'unknown'
                            },
                            technicalContext: {
                                userAgent: participant.connection?.userAgent || '',
                                webrtcStats: {},
                                networkConditions: participant.qualityMetrics ? {
                                    rtt: participant.qualityMetrics.roundTripTime,
                                    packetLoss: participant.qualityMetrics.packetLoss,
                                    jitter: participant.qualityMetrics.jitter,
                                    bandwidth: {
                                        available: participant.qualityMetrics.bandwidth?.download || 0,
                                        used: participant.qualityMetrics.bandwidth?.upload || 0
                                    },
                                    connectionType: participant.connection?.networkType || 'unknown',
                                    quality: 'fair'
                                } : undefined
                            },
                            metadata: {
                                type: 'BWE issue',
                                originalData: extendedMediaEvent.data || 'Remote source BWE issue',
                                category: extendedMediaEvent.category || 'media_interruption',
                                subcategory: extendedMediaEvent.subcategory || 'remote_source_events',
                                subType: (() => {
                                    const dataStr = (typeof extendedMediaEvent.data === 'string')
                                        ? extendedMediaEvent.data
                                        : JSON.stringify(extendedMediaEvent.data || {});

                                    if (dataStr.includes('remoteSourceSuspended')) {
                                        return 'remoteSourceSuspended';
                                    } else if (dataStr.includes('remoteSourceInterrupted')) {
                                        return 'remoteSourceInterrupted';
                                    } else if (extendedMediaEvent.subcategory === 'remote_source_events') {
                                        if (extendedMediaEvent.name?.includes('Suspended')) {
                                            return 'remoteSourceSuspended';
                                        } else if (extendedMediaEvent.name?.includes('Interrupted')) {
                                            return 'remoteSourceInterrupted';
                                        }

                                        return 'remoteSourceSuspended';
                                    }

                                    return 'bwe_issue';
                                })()
                            }
                        });
                    } else if (isStropheError) {
                        // Strophe/Connection errors are Connection Issues
                        networkAndMediaEvents.push({
                            timestamp: mediaEvent.timestamp,
                            sessionId: 'real-conference-session',
                            participantId: participant.participantId || participant.displayName,
                            eventType: CallEventType.CONNECTION_ISSUE,
                            source: 'client',
                            correlationId: `connection_error_${mediaEvent.timestamp}`,
                            participant: {
                                endpointId: extendedMediaEvent.endpointId || participant.endpointId,
                                displayName: participant.displayName,
                                clientVersion: participant.jitsiClient?.version || 'unknown',
                                osType: participant.clientInfo?.os || 'unknown',
                                browserType: participant.clientInfo?.browser || 'unknown'
                            },
                            technicalContext: {
                                userAgent: participant.connection?.userAgent || '',
                                webrtcStats: {},
                                networkConditions: participant.qualityMetrics ? {
                                    rtt: participant.qualityMetrics.roundTripTime,
                                    packetLoss: participant.qualityMetrics.packetLoss,
                                    jitter: participant.qualityMetrics.jitter,
                                    bandwidth: {
                                        available: participant.qualityMetrics.bandwidth?.download || 0,
                                        used: participant.qualityMetrics.bandwidth?.upload || 0
                                    },
                                    connectionType: participant.connection?.networkType || 'unknown',
                                    quality: 'poor'
                                } : undefined
                            },
                            metadata: {
                                type: 'Strophe/Connection error',
                                originalData: extendedMediaEvent.data || 'Connection error detected',
                                category: extendedMediaEvent.category || 'connection_issue',
                                subcategory: extendedMediaEvent.subcategory || 'connection_errors',
                                subType: 'strophe_error'
                            }
                        });
                    }
                });
            }

            // Add processed events to the main events array
            allProcessedEvents.push(...networkAndMediaEvents);
        });

        // Deduplicate events based on timestamp, participantId, eventType, and metadata.subType
        const eventMap = new Map<string, EnhancedCallEvent>();

        allProcessedEvents.forEach(event => {
            const key = `${event.timestamp}_${event.participantId}_${event.eventType}_${event.metadata?.subType || ''}`;

            if (!eventMap.has(key)) {
                eventMap.set(key, event);
            }
        });

        const correctedEvents = Array.from(eventMap.values());

        // For RTCStats mode, use conferenceId as sessionId to match frontend URL
        const finalSessionId = (rtcstatsMode === 'true' && conferenceId)
            ? conferenceId as string
            : session.sessionId;

        // Create corrected session with fixed events
        const correctedSession = {
            ...session,
            sessionId: finalSessionId,
            events: correctedEvents
        };

        // Store the corrected session in mockSessions Map so timeline can access it
        mockSessions.set(finalSessionId, correctedSession);

        // Calculate stats from real data
        const stats = {
            backendComponents: {
                jibris: [], // Would need to detect from dumps
                jvbs: session.metadata?.jvbInstances || [ 'bridge-from-real-dump' ],
                shards: session.metadata?.jicofoShard ? [ session.metadata.jicofoShard ] : [ 'shard-from-real-dump' ]
            },
            meetingDuration: session.endTime ? session.endTime - session.startTime : Date.now() - session.startTime,
            peakConcurrent: calculatePeakConcurrent(correctedSession),
            qualityMetrics: generateQualityMetricsFromRealData(correctedSession),
            totalUsers: correctedSession.participants.length
        };

        res.apiSuccess({
            session: correctedSession,
            stats,
            timeline: generateTimelineData(correctedSession)
        });
    } catch (error) {
        logger.error('Error processing real dumps:', error);
        res.apiError({
            code: ApiErrorCode.ANALYSIS_FAILED,
            message: 'Failed to process conference dumps',
            details: (error as Error).message
        }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
});

/**
 * Analyze meeting session by URL with support for mock, test, and real data modes
 *
 * @api {GET} /api/sessions/analyze Analyze meeting session
 * @param {Request} req - Express request object
 * @param {string} req.query.meetingUrl - Required meeting URL to analyze
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with session analysis
 * @returns {boolean} returns.success - Whether the operation was successful
 * @returns {Object} returns.data - Analysis result data
 * @returns {CallSession} returns.data.session - Session data (mock or real)
 * @returns {Object} returns.data.stats - Session statistics
 * @returns {number} returns.data.stats.meetingDuration - Meeting duration in milliseconds
 * @returns {number} returns.data.stats.totalUsers - Total number of participants
 * @returns {number} returns.data.stats.peakConcurrent - Peak concurrent participants
 * @returns {Object} returns.data.stats.backendComponents - Backend components used
 * @returns {Object} returns.data.stats.qualityMetrics - Quality metrics and scores
 * @returns {Object} returns.data.timeline - Timeline visualization data
 * @throws {400} Bad request if meetingUrl is missing
 * @throws {500} Internal server error if analysis fails
 */
router.get('/analyze', async (req: Request, res: Response) => {
    try {
        const dumpsPath = req.query.dumpsPath as string;

        if (!dumpsPath) {
            return res.apiError({
                code: ApiErrorCode.MISSING_PARAMETER,
                message: 'Dumps path is required',
                field: 'dumpsPath'
            }, HttpStatus.BAD_REQUEST);
        }

        // Custom dumps path: Use specified local directory
        try {
            logger.debug(`Analyzing conference dumps from custom path: ${dumpsPath}`);
            const customProcessor = new DumpProcessor(dumpsPath);
            const realSession = await customProcessor.processConferenceDumps();
            const qualityMetrics = generateQualityMetricsFromRealData(realSession);

            // Store session in mockSessions map so timeline can access it
            mockSessions.set(realSession.sessionId, realSession);

            const analysisResult = {
                session: realSession,
                stats: {
                    backendComponents: {
                        jibris: [],
                        jvbs: realSession.metadata?.jvbInstances || [ 'local-jvb' ],
                        shards: [ realSession.metadata?.jicofoShard || 'local-shard' ]
                    },
                    meetingDuration: realSession.endTime ? realSession.endTime - realSession.startTime : 0,
                    peakConcurrent: calculatePeakConcurrent(realSession),
                    qualityMetrics,
                    totalUsers: realSession.participants.length
                },
                timeline: createTimelineFromSession(realSession)
            };

            return res.apiSuccess(analysisResult);
        } catch (error) {
            logger.error('Custom dumps path analysis failed:', error);

            return res.apiError({
                code: ApiErrorCode.ANALYSIS_FAILED,
                message: 'Failed to analyze dumps from custom path',
                details: error instanceof Error ? error.message : 'Unknown error'
            }, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    } catch (error) {
        logger.error('Error analyzing session:', error);
        res.apiError({
            code: ApiErrorCode.ANALYSIS_FAILED,
            message: 'Failed to analyze meeting'
        }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
});

/**
 * Get JVB (Jitsi VideoBridge) details and statistics from conference dumps
 *
 * @api {GET} /api/sessions/bridge/:bridgeId Get bridge details
 * @param {Request} req - Express request object
 * @param {string} req.params.bridgeId - JVB bridge identifier
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with bridge details
 * @returns {boolean} returns.success - Whether the operation was successful
 * @returns {Object} returns.data - Bridge data container
 * @returns {Object} returns.data.bridge - Complete bridge information
 * @returns {string} returns.data.bridge.id - Bridge identifier
 * @returns {string} returns.data.bridge.name - Bridge display name
 * @returns {string} returns.data.bridge.region - Geographic region
 * @returns {string} returns.data.bridge.status - Bridge health status
 * @returns {Array} returns.data.bridge.conferences - Active conferences
 * @returns {number} returns.data.bridge.endpoints - Maximum endpoints
 * @returns {Array} returns.data.bridge.logs - Bridge log entries
 * @returns {Object} returns.data.bridge.stats - Endpoint statistics
 * @returns {Object} returns.data.bridge.metrics - Bridge performance metrics
 * @throws {404} Not found if bridge data is unavailable
 * @throws {500} Internal server error if bridge processing fails
 */
router.get('/bridge/:bridgeId', async (req: Request, res: Response) => {
    try {
        const { bridgeId } = req.params;
        const { conferenceId, environment, dumpsPath } = req.query;

        let processor: DumpProcessor;

        // Determine which dumps path to use
        if (conferenceId && environment) {
            // RTCStats conference
            const actualDumpsPath = rtcStatsService.getConferenceDumpsPath(
                conferenceId as string,
                environment as RTCStatsEnvironment
            );

            processor = new DumpProcessor(actualDumpsPath);
        } else if (dumpsPath) {
            // Custom local dumps path
            processor = new DumpProcessor(dumpsPath as string);
        } else {
            return res.apiError({
                code: ApiErrorCode.MISSING_PARAMETER,
                message: 'Conference ID and environment, or dumps path is required'
            }, HttpStatus.BAD_REQUEST);
        }

        // Process Bridge data from dumps
        const bridgeData = await processor.processBridgeData(bridgeId);

        if (!bridgeData) {
            return res.apiError({
                code: ApiErrorCode.RESOURCE_NOT_FOUND,
                message: 'Bridge data not found'
            }, HttpStatus.NOT_FOUND);
        }

        res.apiSuccess({
            bridge: {
                conferences: bridgeData.conferences,
                endpoints: bridgeData.maxEndpoints,
                id: bridgeData.bridgeId,
                logs: bridgeData.logs,
                metrics: bridgeData.bridgeMetrics,
                name: bridgeData.bridgeId,
                region: 'us-east-1',
                stats: bridgeData.endpointStats,
                status: 'healthy'
            }
        });
    } catch (error) {
        logger.error('Error getting Bridge details:', error);
        res.apiError({
            code: ApiErrorCode.BRIDGE_ERROR,
            message: 'Failed to get Bridge details'
        }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
});

/**
 * Get Jicofo shard details and conference management statistics
 *
 * @api {GET} /api/sessions/jicofo/:shardId Get Jicofo shard details
 * @param {Request} req - Express request object
 * @param {string} req.params.shardId - Jicofo shard identifier
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with Jicofo shard details
 * @returns {boolean} returns.success - Whether the operation was successful
 * @returns {Object} returns.data - Shard data container
 * @returns {Object} returns.data.shard - Complete shard information
 * @returns {string} returns.data.shard.id - Shard identifier
 * @returns {string} returns.data.shard.name - Shard display name
 * @returns {string} returns.data.shard.region - Geographic region
 * @returns {string} returns.data.shard.status - Shard health status
 * @returns {Array} returns.data.shard.conferences - Managed conferences
 * @returns {number} returns.data.shard.participants - Active participants count
 * @returns {Array} returns.data.shard.logs - Jicofo log entries
 * @throws {404} Not found if Jicofo data is unavailable
 * @throws {500} Internal server error if Jicofo processing fails
 */
router.get('/jicofo/:shardId', async (req: Request, res: Response) => {
    try {
        const { shardId } = req.params;
        const { conferenceId, environment, dumpsPath } = req.query;

        let processor: DumpProcessor;

        // Determine which dumps path to use
        if (conferenceId && environment) {
            // RTCStats conference
            const actualDumpsPath = rtcStatsService.getConferenceDumpsPath(
                conferenceId as string,
                environment as RTCStatsEnvironment
            );

            processor = new DumpProcessor(actualDumpsPath);
        } else if (dumpsPath) {
            // Custom local dumps path
            processor = new DumpProcessor(dumpsPath as string);
        } else {
            return res.apiError({
                code: ApiErrorCode.MISSING_PARAMETER,
                message: 'Conference ID and environment, or dumps path is required'
            }, HttpStatus.BAD_REQUEST);
        }

        // Process Jicofo data from dumps
        const jicofoData = await processor.processJicofoData(shardId);

        if (!jicofoData) {
            return res.apiError({
                code: ApiErrorCode.RESOURCE_NOT_FOUND,
                message: 'Jicofo data not found'
            }, HttpStatus.NOT_FOUND);
        }

        res.apiSuccess({
            shard: {
                conferences: jicofoData.jicofo.conferences || [],
                id: jicofoData.jicofo.id,
                logs: jicofoData.jicofo.logs || [],
                name: jicofoData.jicofo.displayName,
                participants: jicofoData.jicofo.activeParticipants || 0,
                region: 'us-east-1',
                status: 'healthy',
                componentType: jicofoData.jicofo.componentType,
                applicationName: jicofoData.jicofo.applicationName,
                instanceId: jicofoData.jicofo.instanceId
            }
        });
    } catch (error) {
        logger.error('Error getting Jicofo details:', error);
        res.apiError({
            code: ApiErrorCode.JICOFO_ERROR,
            message: 'Failed to get Jicofo details'
        }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
});

/**
 * Get console logs for a participant by display name, supporting merged logs from multiple endpoints
 *
 * @api {GET} /api/sessions/participant/:displayName/logs Get participant console logs
 * @param {Request} req - Express request object
 * @param {string} req.params.displayName - Participant display name
 * @param {string} [req.query.sessionId] - Optional session ID for filtering
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with participant console logs
 * @returns {boolean} returns.success - Whether the operation was successful
 * @returns {Array} returns.data - Array of console log entries
 * @returns {string} returns.data[].timestamp - Log timestamp
 * @returns {string} returns.data[].level - Log level (debug, info, warn, error)
 * @returns {string} returns.data[].message - Log message content
 * @returns {string} returns.data[].source - Log source (browser console, client)
 * @throws {500} Internal server error if log retrieval fails
 */
router.get('/participant/:displayName/logs', async (req: Request, res: Response) => {
    try {
        const { displayName } = req.params;
        const { sessionId, rtcstats, conferenceId, environment } = req.query;
        const { dumpsPath } = req.query;
        let processor: DumpProcessor;

        // Determine which dumps path to use
        if (rtcstats === 'true' && conferenceId && environment) {
            logger.debug(`Fetching RTCStats participant logs for ${displayName} in conference ${conferenceId}
                (${environment})`);
            const actualDumpsPath = rtcStatsService.getConferenceDumpsPath(
                conferenceId as string,
                environment as RTCStatsEnvironment
            );

            processor = new DumpProcessor(actualDumpsPath);
        } else if (dumpsPath) {
            // Custom local dumps path
            processor = new DumpProcessor(dumpsPath as string);
        } else {
            return res.apiError({
                code: ApiErrorCode.MISSING_PARAMETER,
                message: 'RTCStats parameters (conferenceId, environment) or dumps path is required'
            }, HttpStatus.BAD_REQUEST);
        }

        const logs
            = await processor.getParticipantConsoleLogs(displayName, sessionId as string || conferenceId as string);

        res.apiSuccess(logs);
    } catch (error) {
        logger.error('Error fetching participant console logs:', error);
        res.apiError({
            code: ApiErrorCode.LOG_RETRIEVAL_FAILED,
            message: 'Failed to get participant console logs'
        }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
});

/**
 * Get console logs for a participant by endpoint ID (legacy endpoint for backward compatibility)
 *
 * @api {GET} /api/sessions/endpoint/:endpointId/logs Get participant logs by endpoint
 * @param {Request} req - Express request object
 * @param {string} req.params.endpointId - Participant endpoint identifier
 * @param {string} [req.query.sessionId] - Optional session ID for filtering
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with participant console logs
 * @returns {boolean} returns.success - Whether the operation was successful
 * @returns {Array} returns.data - Array of console log entries
 * @returns {string} returns.data[].timestamp - Log timestamp
 * @returns {string} returns.data[].level - Log level (debug, info, warn, error)
 * @returns {string} returns.data[].message - Log message content
 * @returns {string} returns.data[].source - Log source (browser console, client)
 * @throws {500} Internal server error if log retrieval fails
 * @deprecated Use /participant/:displayName/logs instead
 */
router.get('/endpoint/:endpointId/logs', async (req: Request, res: Response) => {
    try {
        const { endpointId } = req.params;
        const { sessionId, rtcstats, conferenceId, environment, dumpsPath } = req.query;

        let processor: DumpProcessor;

        // Determine which dumps path to use
        if (rtcstats === 'true' && conferenceId && environment) {
            logger.info(
                `Fetching RTCStats endpoint logs for ${endpointId} in conference ${conferenceId} (${environment})`
            );
            const actualDumpsPath = rtcStatsService.getConferenceDumpsPath(
                conferenceId as string,
                environment as RTCStatsEnvironment
            );

            processor = new DumpProcessor(actualDumpsPath);
        } else if (dumpsPath) {
            processor = new DumpProcessor(dumpsPath as string);
        } else {
            return res.apiError({
                code: ApiErrorCode.MISSING_PARAMETER,
                message: 'RTCStats parameters (conferenceId, environment) or dumps path is required'
            }, HttpStatus.BAD_REQUEST);
        }

        const participantLogs = await processor.getParticipantConsoleLogs(
            endpointId,
            sessionId as string || conferenceId as string
        );

        res.apiSuccess(participantLogs);
    } catch (error) {
        logger.error('Error fetching participant console logs:', error);
        res.apiError({
            code: ApiErrorCode.LOG_RETRIEVAL_FAILED,
            message: 'Failed to get participant console logs'
        }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
});

/**
 * Get RTCStats data for a participant by display name, supporting merged stats from multiple endpoints
 *
 * @api {GET} /api/sessions/participant/:displayName/rtcstats Get participant RTCStats
 * @param {Request} req - Express request object
 * @param {string} req.params.displayName - Participant display name
 * @param {string} [req.query.sessionId] - Optional session ID for filtering
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with RTCStats data
 * @returns {boolean} returns.success - Whether the operation was successful
 * @returns {Object} returns.data - RTCStats data container
 * @returns {Object} returns.data.stats - WebRTC statistics
 * @returns {Object} returns.data.stats.audio - Audio track statistics
 * @returns {Object} returns.data.stats.video - Video track statistics
 * @returns {Object} returns.data.stats.transport - Transport layer statistics
 * @returns {Object} returns.data.stats.connection - Connection quality metrics
 * @throws {500} Internal server error if RTCStats retrieval fails
 */
router.get('/participant/:displayName/rtcstats', async (req: Request, res: Response) => {
    try {
        const { displayName } = req.params;
        const { sessionId, rtcstats, conferenceId, environment, dumpsPath } = req.query;

        let processor: DumpProcessor;

        // Determine which dumps path to use
        if (rtcstats === 'true' && conferenceId && environment) {
            const actualDumpsPath = rtcStatsService.getConferenceDumpsPath(
                conferenceId as string,
                environment as RTCStatsEnvironment
            );

            processor = new DumpProcessor(actualDumpsPath);
        } else if (dumpsPath) {
            processor = new DumpProcessor(dumpsPath as string);
        } else {
            return res.apiError({
                code: ApiErrorCode.MISSING_PARAMETER,
                message: 'RTCStats parameters (conferenceId, environment) or dumps path is required'
            }, HttpStatus.BAD_REQUEST);
        }

        // Get RTCStats data for the participant
        const stats = await processor.getParticipantRTCStats(
            displayName,
            sessionId as string || conferenceId as string
        );

        res.apiSuccess({ stats });
    } catch (error) {
        logger.error('Error fetching participant RTCStats:', error);
        res.apiError({
            code: ApiErrorCode.STATS_RETRIEVAL_FAILED,
            message: 'Failed to get participant RTCStats'
        }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
});

/**
 * Get specific session data by session ID from mock data store
 *
 * @api {GET} /api/sessions/:sessionId Get session by ID
 * @param {Request} req - Express request object
 * @param {string} req.params.sessionId - Session identifier
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with session data
 * @returns {boolean} returns.success - Whether the operation was successful
 * @returns {CallSession} returns.data - Complete session data
 * @returns {string} returns.data.sessionId - Session identifier
 * @returns {number} returns.data.startTime - Session start timestamp
 * @returns {number} [returns.data.endTime] - Session end timestamp
 * @returns {ParticipantDetails[]} returns.data.participants - Array of participant details
 * @returns {EnhancedCallEvent[]} returns.data.events - Array of session events
 * @returns {Object} returns.data.metrics - Session quality metrics
 * @throws {404} Not found if session does not exist
 * @throws {500} Internal server error if session retrieval fails
 */
router.get('/:sessionId', (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const session = mockSessions.get(sessionId);

        if (!session) {
            return res.apiError({
                code: ApiErrorCode.SESSION_NOT_FOUND,
                message: 'Session not found'
            }, HttpStatus.NOT_FOUND);
        }

        res.apiSuccess(session);
    } catch (error) {
        logger.error('Error getting session:', error);
        res.apiError({
            code: ApiErrorCode.INTERNAL_ERROR,
            message: 'Failed to get session'
        }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
});

// Get events for a specific participant
router.get('/participant/:displayName/events', async (req: Request, res: Response) => {
    try {
        const { displayName } = req.params;
        const { rtcstats, conferenceId, environment, dumpsPath } = req.query;

        logger.debug(`Getting events for participant: ${displayName}`);
        let processor: DumpProcessor;

        // Determine which dumps path to use
        if (rtcstats === 'true' && conferenceId && environment) {
            logger.debug(`Fetching RTCStats participant events for ${displayName} in conference ${conferenceId}
                (${environment})`);
            const actualDumpsPath
                = rtcStatsService.getConferenceDumpsPath(conferenceId as string, environment as RTCStatsEnvironment);

            processor = new DumpProcessor(actualDumpsPath);
        } else if (dumpsPath) {
            logger.debug(`Fetching participant events for ${displayName} from dumps path: ${dumpsPath}`);
            processor = new DumpProcessor(dumpsPath as string);
        } else {
            return res.apiError({
                code: ApiErrorCode.MISSING_PARAMETER,
                message: 'RTCStats parameters (conferenceId, environment) or dumps path is required'
            }, HttpStatus.BAD_REQUEST);
        }

        const result = await processor.processConferenceDumps();

        // Filter events for the specific participant
        const participantEvents = result.events.filter((event: EnhancedCallEvent) =>
            event.participantId === displayName
            || result.participants.some((p: any) => p.displayName === displayName && (
                p.participantId === event.participantId
                || p.endpointId === event.participantId
            ))
        );

        // Find the participant to get their mediaEvents
        const participant = result.participants.find((p: any) => p.displayName === displayName);

        // Convert media events to proper event categories
        const networkAndMediaEvents: EnhancedCallEvent[] = [];

        if (participant?.mediaEvents) {
            logger.debug(`Processing ${participant.mediaEvents.length} media events for ${displayName}`);
            participant.mediaEvents.forEach((mediaEvent: any) => {
                // Type assertion to handle the actual data structure which has more properties than the type definition
                const extendedMediaEvent = mediaEvent as any;

                logger.debug(`Media event: type=${extendedMediaEvent.type},
                    subcategory=${extendedMediaEvent.subcategory}, category=${extendedMediaEvent.category}`);

                // CLEAR CLASSIFICATION LOGIC:
                // 1. ICE failures = networkIssue (ICE restart/failure events)
                // 2. BWE issues = mediaInterruption (bandwidth estimation/remote source events)
                // 3. Strophe errors = connectionIssue (connection/websocket errors)

                const isIceFailure = extendedMediaEvent.subcategory === 'ice_failures'
                    || (extendedMediaEvent.data
                        && typeof extendedMediaEvent.data === 'string'
                        && extendedMediaEvent.data.includes('ice restart'));

                const isBweIssue = extendedMediaEvent.subcategory === 'remote_source_events'
                                 || (extendedMediaEvent.name && (
                                     extendedMediaEvent.name.includes('remoteSourceSuspended')
                                     || extendedMediaEvent.name.includes('remoteSourceInterrupted')
                                     || extendedMediaEvent.name.includes('RemoteSourceSuspended')
                                     || extendedMediaEvent.name.includes('RemoteSourceInterrupted')
                                 ))
                                 || (extendedMediaEvent.data && typeof extendedMediaEvent.data === 'string' && (
                                     extendedMediaEvent.data.includes('remoteSourceSuspended')
                                     || extendedMediaEvent.data.includes('remoteSourceInterrupted')
                                 ));

                const isStropheError = extendedMediaEvent.subcategory === 'connection_errors'
                                     || extendedMediaEvent.subcategory === 'websocket_errors'
                                     || (extendedMediaEvent.data && typeof extendedMediaEvent.data === 'string' && (
                                         extendedMediaEvent.data.includes('strophe')
                                         || extendedMediaEvent.data.includes('websocket')
                                         || extendedMediaEvent.data.includes('connection failed')
                                         || extendedMediaEvent.data.includes('connection lost')
                                     ))
                                     || (extendedMediaEvent.name && (
                                         extendedMediaEvent.name.includes('connection')
                                         || extendedMediaEvent.name.includes('websocket')
                                         || extendedMediaEvent.name.includes('strophe')
                                     ));

                if (isIceFailure) {
                    // ICE failures are Network Issues
                    networkAndMediaEvents.push({
                        timestamp: mediaEvent.timestamp,
                        sessionId: 'real-conference-session',
                        participantId: participant.participantId || displayName,
                        eventType: CallEventType.NETWORK_ISSUE,
                        source: 'client',
                        correlationId: `ice_failure_${mediaEvent.timestamp}`,
                        participant: {
                            endpointId: extendedMediaEvent.endpointId || participant.endpointId,
                            displayName: displayName,
                            clientVersion: participant.jitsiClient?.version || 'unknown',
                            osType: participant.clientInfo?.os || 'unknown',
                            browserType: participant.clientInfo?.browser || 'unknown'
                        },
                        technicalContext: {
                            userAgent: participant.connection?.userAgent || '',
                            webrtcStats: {},
                            networkConditions: participant.qualityMetrics ? {
                                rtt: participant.qualityMetrics.roundTripTime,
                                packetLoss: participant.qualityMetrics.packetLoss,
                                jitter: participant.qualityMetrics.jitter,
                                bandwidth: {
                                    available: participant.qualityMetrics.bandwidth?.download || 0,
                                    used: participant.qualityMetrics.bandwidth?.upload || 0
                                },
                                connectionType: participant.connection?.networkType || 'unknown',
                                quality: 'poor'
                            } : undefined
                        },
                        metadata: {
                            type: 'ICE restart/failure',
                            originalData: extendedMediaEvent.data || 'ICE failure detected',
                            category: extendedMediaEvent.category || 'network_issue',
                            subcategory: extendedMediaEvent.subcategory || 'ice_restart',
                            subType: 'ice_restart'
                        }
                    });
                } else if (isBweIssue || extendedMediaEvent.category === 'media_interruption') {
                    // BWE issues are Media Interruptions - create events with mediaInterruption eventType
                    networkAndMediaEvents.push({
                        timestamp: mediaEvent.timestamp,
                        sessionId: 'real-conference-session',
                        participantId: participant.participantId || displayName,
                        eventType: CallEventType.MEDIA_INTERRUPTION, // Use mediaInterruption for BWE issues
                        source: 'client',
                        correlationId: `bwe_issue_${mediaEvent.timestamp}`,
                        participant: {
                            endpointId: extendedMediaEvent.endpointId || participant.endpointId,
                            displayName: displayName,
                            clientVersion: participant.jitsiClient?.version || 'unknown',
                            osType: participant.clientInfo?.os || 'unknown',
                            browserType: participant.clientInfo?.browser || 'unknown'
                        },
                        technicalContext: {
                            userAgent: participant.connection?.userAgent || '',
                            webrtcStats: {},
                            networkConditions: participant.qualityMetrics ? {
                                rtt: participant.qualityMetrics.roundTripTime,
                                packetLoss: participant.qualityMetrics.packetLoss,
                                jitter: participant.qualityMetrics.jitter,
                                bandwidth: {
                                    available: participant.qualityMetrics.bandwidth?.download || 0,
                                    used: participant.qualityMetrics.bandwidth?.upload || 0
                                },
                                connectionType: participant.connection?.networkType || 'unknown',
                                quality: 'fair'
                            } : undefined
                        },
                        metadata: {
                            type: 'BWE issue',
                            originalData: extendedMediaEvent.data || 'Bandwidth estimation issue',
                            category: extendedMediaEvent.category || 'media_interruption',
                            subcategory: extendedMediaEvent.subcategory || 'bwe_issues',
                            subType: (() => {
                                // Determine specific subType based on event data
                                const dataStr = (typeof extendedMediaEvent.data === 'string')
                                    ? extendedMediaEvent.data
                                    : JSON.stringify(extendedMediaEvent.data || {});

                                // All remote source events are BWE issues, but we need to track specific types
                                if (dataStr.includes('remoteSourceSuspended')) {
                                    return 'remoteSourceSuspended';
                                } else if (dataStr.includes('remoteSourceInterrupted')) {
                                    return 'remoteSourceInterrupted';
                                } else if (extendedMediaEvent.subcategory === 'remote_source_events') {
                                    // Check event name/type for remote source events
                                    if (extendedMediaEvent.name?.includes('Suspended')) {
                                        return 'remoteSourceSuspended';
                                    } else if (extendedMediaEvent.name?.includes('Interrupted')) {
                                        return 'remoteSourceInterrupted';
                                    }

                                    return 'remoteSourceSuspended'; // Default for remote source events
                                }

                                return 'bwe_issue'; // Default BWE issue
                            })()
                        }
                    });
                } else if (isStropheError) {
                    // Strophe/Connection errors are Connection Issues
                    networkAndMediaEvents.push({
                        timestamp: mediaEvent.timestamp,
                        sessionId: 'real-conference-session',
                        participantId: participant.participantId || displayName,
                        eventType: CallEventType.CONNECTION_ISSUE,
                        source: 'client',
                        correlationId: `connection_error_${mediaEvent.timestamp}`,
                        participant: {
                            endpointId: extendedMediaEvent.endpointId || participant.endpointId,
                            displayName: displayName,
                            clientVersion: participant.jitsiClient?.version || 'unknown',
                            osType: participant.clientInfo?.os || 'unknown',
                            browserType: participant.clientInfo?.browser || 'unknown'
                        },
                        technicalContext: {
                            userAgent: participant.connection?.userAgent || '',
                            webrtcStats: {},
                            networkConditions: participant.qualityMetrics ? {
                                rtt: participant.qualityMetrics.roundTripTime,
                                packetLoss: participant.qualityMetrics.packetLoss,
                                jitter: participant.qualityMetrics.jitter,
                                bandwidth: {
                                    available: participant.qualityMetrics.bandwidth?.download || 0,
                                    used: participant.qualityMetrics.bandwidth?.upload || 0
                                },
                                connectionType: participant.connection?.networkType || 'unknown',
                                quality: 'poor'
                            } : undefined
                        },
                        metadata: {
                            type: 'Strophe/Connection error',
                            originalData: extendedMediaEvent.data || 'Connection error detected',
                            category: extendedMediaEvent.category || 'connection_issue',
                            subcategory: extendedMediaEvent.subcategory || 'connection_errors',
                            subType: 'strophe_error'
                        }
                    });
                }
                // Note: Only ICE, BWE, and Strophe events are classified
            });
        }

        // Combine regular events with converted network and media events
        const combinedEvents = [ ...participantEvents, ...networkAndMediaEvents ];

        // Deduplicate events based on timestamp, participantId, eventType, and metadata.subType
        const eventMap = new Map<string, EnhancedCallEvent>();

        combinedEvents.forEach(event => {
            const key = `${event.timestamp}_${event.participantId}_${event.eventType}_${event.metadata?.subType || ''}`;

            if (!eventMap.has(key)) {
                eventMap.set(key, event);
            }
        });

        const allEvents = Array.from(eventMap.values());

        logger.debug(`Found ${participantEvents.length} regular events and ${networkAndMediaEvents.length}
            network/media events for participant ${displayName}`);

        // Calculate real performance metrics based on events
        const performanceMetrics = {
            // Network/connection quality metrics (from existing qualityMetrics)
            packetLoss: participant?.qualityMetrics?.packetLoss || 0,
            avgRTT: participant?.qualityMetrics?.roundTripTime || 0,
            avgJitter: participant?.qualityMetrics?.jitter || 0,

            // Issue counts based on actual events
            issueStats: {
                bweIssues: allEvents.filter(e => e.eventType === 'mediaInterruption').length,
                networkIssues: allEvents.filter(e => e.eventType === 'networkIssue').length,
                connectionIssues: allEvents.filter(e => e.eventType === 'connectionIssue').length,
                totalIssues: allEvents.filter(e =>
                    e.eventType === 'mediaInterruption'
                    || e.eventType === 'networkIssue'
                    || e.eventType === 'connectionIssue'
                ).length
            }
        };

        // Enhanced participant object with calculated metrics
        const enhancedParticipant = participant ? {
            ...participant,
            performanceMetrics
        } : null;

        return res.apiSuccess({
            events: allEvents,
            participant: enhancedParticipant
        });
    } catch (error) {
        logger.error(`Error getting events for participant ${req.params.displayName}:`, error);
        res.apiError({
            code: ApiErrorCode.INTERNAL_ERROR,
            message: 'Failed to get participant events'
        }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
});

function calculatePeakConcurrent(session: CallSession): number {
    const timePoints: { change: number; timestamp: number; }[] = [];

    logger.debug(`[DEBUG] calculatePeakConcurrent: Processing ${session.participants.length} participants:`);

    // Add join/leave events using aggregated participant data
    session.participants.forEach(participant => {
        logger.debug(
            `  - ${participant.displayName}: join=${new Date(participant.joinTime).toISOString()},
                leave=${participant.leaveTime ? new Date(participant.leaveTime).toISOString() : 'still connected'}`
        );

        // Add join event
        timePoints.push({ timestamp: participant.joinTime, change: 1 });

        // Add leave event if participant left
        if (participant.leaveTime) {
            timePoints.push({ timestamp: participant.leaveTime, change: -1 });
        }
    });

    // Sort by timestamp
    timePoints.sort((a, b) => a.timestamp - b.timestamp);

    let current = 0;
    let peak = 0;

    logger.debug(`[DEBUG] calculatePeakConcurrent: Processing ${timePoints.length} time points:`);
    timePoints.forEach(point => {
        current += point.change;
        peak = Math.max(peak, current);
        logger.debug(
            `  - ${new Date(point.timestamp).toISOString()}:
                ${point.change > 0 ? 'JOIN' : 'LEAVE'} -> current=${current}, peak=${peak}`
        );
    });

    logger.debug(`[DEBUG] calculatePeakConcurrent: Final peak concurrent = ${peak}`);

    return peak;
}

function generateQualityMetricsFromRealData(session: CallSession) {
    // Calculate quality metrics from real participant data
    const participants = session.participants;
    const totalParticipants = participants.length;

    if (totalParticipants === 0) {
        return {
            audioQuality: 0,
            avgJitter: 0,
            avgPacketLoss: 0,
            avgRTT: 0,
            connectionSuccessRate: 0,
            eventCounts: {
                mediaInterruptions: 0,
                iceRestarts: 0,
                stropheErrors: 0
            },
            mediaInterruptions: 0,
            networkStability: 0,
            overallScore: 0,
            participantDropouts: 0,
            videoQuality: 0
        };
    }

    // Calculate averages from real participant quality metrics
    const avgAudioQuality = participants.reduce((sum, p) => sum + p.qualityMetrics.audioQuality, 0) / totalParticipants;
    const avgVideoQuality = participants.reduce((sum, p) => sum + p.qualityMetrics.videoQuality, 0) / totalParticipants;
    const avgPacketLoss = participants.reduce((sum, p) => sum + p.qualityMetrics.packetLoss, 0) / totalParticipants;
    const avgRTT = participants.reduce((sum, p) => sum + p.qualityMetrics.roundTripTime, 0) / totalParticipants;
    const avgJitter = participants.reduce((sum, p) => sum + p.qualityMetrics.jitter, 0) / totalParticipants;

    // Calculate network stability based on real metrics
    const networkStability = Math.max(0, 5 - avgPacketLoss * 0.5 - (avgRTT > 100 ? 1 : 0));

    // Calculate overall score as weighted average
    const overallScore = avgAudioQuality * 0.35 + avgVideoQuality * 0.35 + networkStability * 0.3;

    // Count events by eventType (following our classification standards)
    const mediaInterruptions = session.events.filter(e => e.eventType === 'mediaInterruption').length;
    const iceRestarts = session.events.filter(e => e.eventType === 'networkIssue').length;
    const stropheErrors = session.events.filter(e => e.eventType === 'connectionIssue').length;

    // Count real participant dropouts (left within first 5 minutes)
    const participantDropouts = participants.filter(
        p => p.leaveTime && p.leaveTime - p.joinTime < 5 * 60 * 1000
    ).length;

    // Calculate real connection success rate
    const totalConnections = participants.length;
    const successfulConnections = participants.filter(
        p => (p.leaveTime
            ? p.leaveTime - p.joinTime
            : (session.endTime || Date.now()) - p.joinTime) > 30000 // Connected for more than 30s
    ).length;
    const connectionSuccessRate = totalConnections > 0 ? (successfulConnections / totalConnections) * 100 : 100;

    return {
        audioQuality: avgAudioQuality,
        avgJitter: Math.round(avgJitter),
        avgPacketLoss,
        avgRTT: Math.round(avgRTT),
        connectionSuccessRate: Math.min(100, Math.max(0, connectionSuccessRate)),
        eventCounts: {
            mediaInterruptions,
            iceRestarts,
            stropheErrors
        },
        mediaInterruptions,
        networkStability,
        overallScore: Math.min(5, Math.max(0, overallScore)),
        participantDropouts,
        videoQuality: avgVideoQuality
    };
}

function generateTimelineData(session: CallSession) {
    return {
        sessionOverview: {
            duration: session.endTime ? session.endTime - session.startTime : Date.now() - session.startTime,
            events: session.events.length,
            participants: session.participants.length
        },
        tracks: session.participants.map(participant => ({
            clientInfo: participant.clientInfo,
            displayName: participant.displayName,
            endTime: participant.leaveTime,
            events: session.events.filter(e => e.participantId === participant.participantId),
            participantId: participant.participantId,
            role: participant.role,
            startTime: participant.joinTime,
            status: participant.leaveTime ? ('left' as const) : ('active' as const)
        }))
    };
}

export default router;
