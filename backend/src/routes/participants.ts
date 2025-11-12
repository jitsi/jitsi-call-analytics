/**
 * Participants API routes
 */
import { getLogger } from '@jitsi/logger';
import { Request, Response, Router } from 'express';

import { createPaginationInfo, parsePaginationQuery } from '../middleware/apiResponse';
import {
    ApiErrorCode,
    HttpStatus,
    ILogEntryResponse,
    IParticipantResponse,
    IStatisticsResponse
} from '../types/api';

const logger = getLogger('routes/participants');
const router = Router();

// GET /api/participants - List all participants
router.get('/', async (req: Request, res: Response) => {
    try {
        const { page, limit, offset } = parsePaginationQuery(req);
        const { sessionId } = req.query;

        logger.debug('Fetching participants list', { page, limit, sessionId });

        // Mock data - replace with actual database queries
        const mockParticipants: IParticipantResponse[] = [
            {
                id: 'participant_1',
                displayName: 'John Doe',
                sessionId: 'session_1',
                endpointId: 'endpoint_123',
                joinTime: '2024-01-15T09:00:00Z',
                leaveTime: '2024-01-15T09:30:00Z',
                componentType: 'participant',
                applicationName: 'Jitsi Meet',
                eventCount: 150
            },
            {
                id: 'participant_2',
                displayName: 'Jane Smith',
                sessionId: 'session_1',
                endpointId: 'endpoint_456',
                joinTime: '2024-01-15T09:02:00Z',
                leaveTime: '2024-01-15T09:30:00Z',
                componentType: 'participant',
                applicationName: 'Jitsi Meet',
                eventCount: 142
            }
        ];

        // Filter by sessionId if provided
        const filteredParticipants = sessionId
            ? mockParticipants.filter(p => p.sessionId === sessionId)
            : mockParticipants;

        const total = filteredParticipants.length;
        const paginatedParticipants = filteredParticipants.slice(offset, offset + limit);
        const pagination = createPaginationInfo(page, limit, total);

        res.apiPaginated(paginatedParticipants, pagination);

    } catch (error) {
        logger.error('Error fetching participants:', error);
        res.apiError({
            code: ApiErrorCode.INTERNAL_ERROR,
            message: 'Failed to fetch participants'
        }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
});

// GET /api/participants/:id - Get participant by ID
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const participantId = req.params.id;

        if (!participantId) {
            return res.apiError({
                code: ApiErrorCode.MISSING_PARAMETER,
                message: 'Participant ID is required',
                field: 'id'
            }, HttpStatus.BAD_REQUEST);
        }

        logger.debug('Fetching participant details', { participantId });

        // Mock participant lookup - replace with actual database query
        const mockParticipant: IParticipantResponse | null = participantId === 'participant_1' ? {
            id: 'participant_1',
            displayName: 'John Doe',
            sessionId: 'session_1',
            endpointId: 'endpoint_123',
            joinTime: '2024-01-15T09:00:00Z',
            leaveTime: '2024-01-15T09:30:00Z',
            componentType: 'participant',
            applicationName: 'Jitsi Meet',
            eventCount: 150
        } : null;

        if (!mockParticipant) {
            return res.apiError({
                code: ApiErrorCode.PARTICIPANT_NOT_FOUND,
                message: 'Participant not found'
            }, HttpStatus.NOT_FOUND);
        }

        res.apiSuccess(mockParticipant);

    } catch (error) {
        logger.error('Error fetching participant:', error);
        res.apiError({
            code: ApiErrorCode.INTERNAL_ERROR,
            message: 'Failed to fetch participant'
        }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
});

// GET /api/participants/:id/logs - Get participant logs
router.get('/:id/logs', async (req: Request, res: Response) => {
    try {
        const participantId = req.params.id;
        const { page, limit, offset } = parsePaginationQuery(req);
        const { level, category, startTime, endTime } = req.query;

        if (!participantId) {
            return res.apiError({
                code: ApiErrorCode.MISSING_PARAMETER,
                message: 'Participant ID is required',
                field: 'id'
            }, HttpStatus.BAD_REQUEST);
        }

        logger.debug('Fetching participant logs', {
            participantId, page, limit, level, category, startTime, endTime
        });

        // Mock logs - replace with actual log retrieval from processing service
        const mockLogs: ILogEntryResponse[] = [
            {
                timestamp: '2024-01-15T09:00:00Z',
                level: 'INFO',
                message: 'Participant joined the meeting',
                category: 'connection',
                data: { endpointId: 'endpoint_123' }
            },
            {
                timestamp: '2024-01-15T09:00:30Z',
                level: 'DEBUG',
                message: 'ICE connection established',
                category: 'network',
                data: { candidatePair: 'udp' }
            },
            {
                timestamp: '2024-01-15T09:01:00Z',
                level: 'WARN',
                message: 'High packet loss detected',
                category: 'network',
                data: { packetLoss: 0.05 }
            }
        ];

        // Apply filters
        let filteredLogs = mockLogs;

        if (level) {
            filteredLogs = filteredLogs.filter(log => log.level === level);
        }
        if (category) {
            filteredLogs = filteredLogs.filter(log => log.category === category);
        }

        const total = filteredLogs.length;
        const paginatedLogs = filteredLogs.slice(offset, offset + limit);
        const pagination = createPaginationInfo(page, limit, total);

        res.apiPaginated(paginatedLogs, pagination);

    } catch (error) {
        logger.error('Error fetching participant logs:', error);
        res.apiError({
            code: ApiErrorCode.INTERNAL_ERROR,
            message: 'Failed to fetch participant logs'
        }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
});

// GET /api/participants/:id/statistics - Get participant statistics
router.get('/:id/statistics', async (req: Request, res: Response) => {
    try {
        const participantId = req.params.id;

        if (!participantId) {
            return res.apiError({
                code: ApiErrorCode.MISSING_PARAMETER,
                message: 'Participant ID is required',
                field: 'id'
            }, HttpStatus.BAD_REQUEST);
        }

        logger.debug('Fetching participant statistics', { participantId });

        // Mock statistics - replace with actual statistics calculation
        const mockStatistics: IStatisticsResponse = {
            participantId,
            sessionId: 'session_1',
            networkStats: {
                rtt: [ 50, 55, 48, 52, 49 ],
                packetLoss: [ 0.01, 0.02, 0.01, 0.03, 0.02 ],
                bandwidth: {
                    upload: [ 1000, 1200, 1100, 1050, 1150 ],
                    download: [ 2000, 2100, 2050, 2200, 2150 ]
                },
                jitter: [ 5, 7, 6, 8, 5 ]
            },
            audioStats: {
                packetsLost: 5,
                packetsReceived: 1000,
                bytesReceived: 128000,
                codecName: 'opus',
                sampleRate: 48000
            },
            videoStats: {
                packetsLost: 12,
                packetsReceived: 5000,
                bytesReceived: 1024000,
                framesDecoded: 900,
                framesDropped: 10,
                resolution: {
                    width: 1280,
                    height: 720
                },
                codecName: 'VP8'
            },
            connectionStats: {
                connectionState: 'connected',
                iceConnectionState: 'connected',
                dtlsState: 'connected'
            },
            generatedAt: new Date().toISOString()
        };

        res.apiSuccess(mockStatistics);

    } catch (error) {
        logger.error('Error fetching participant statistics:', error);
        res.apiError({
            code: ApiErrorCode.ANALYSIS_FAILED,
            message: 'Failed to generate participant statistics'
        }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
});

export default router;
