/**
 * File Upload Routes
 * Handles conference dump file uploads for analysis
 */

import { getLogger } from '@jitsi/logger';
import express, { Request, Response } from 'express';
import * as fs from 'fs-extra';
import multer, { StorageEngine } from 'multer';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { CallSession } from '../../../shared/types';
import DumpProcessor from '../services/DumpProcessor';
import { ApiErrorCode, HttpStatus } from '../types/api';

const logger = getLogger('backend/src/routes/uploads');
const router = express.Router();

// Shared session storage (same as sessions_analyze.ts)
const uploadedSessions: Map<string, CallSession> = new Map();

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), 'uploads');

// Ensure upload directory exists
fs.ensureDirSync(uploadDir);

const storage: StorageEngine = multer.diskStorage({
    destination: (_req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
        cb(null, uploadDir);
    },
    filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
        // Preserve original filename with timestamp
        const uniquePrefix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;

        cb(null, `${uniquePrefix}-${file.originalname}`);
    }
});

const upload = multer({
    limits: {
        fieldSize: 500 * 1024 * 1024, // 500MB field size
        fileSize: 200 * 1024 * 1024 // 200MB per file
    },
    storage
});

/**
 * Upload and analyze conference dump files
 * POST /api/v1/uploads/analyze
 */
router.post('/analyze', upload.array('dumps', 100), async (req: Request, res: Response) => {
    const uploadSessionId = uuidv4();

    // Use the same directory structure as RTCStats downloads
    // This allows all existing endpoints to work without modification
    const rtcstatsDownloadsPath = process.env.RTCSTATS_DOWNLOADS_PATH || '/data/rtcstats-downloads';
    const sessionUploadDir = path.join(rtcstatsDownloadsPath, 'uploaded', uploadSessionId);

    try {
        // When using upload.array(), req.files is an array of files
        const files = req.files as Express.Multer.File[];

        if (!files || files.length === 0) {
            return res.apiError({
                code: ApiErrorCode.MISSING_PARAMETER,
                field: 'dumps',
                message: 'No files uploaded'
            }, HttpStatus.BAD_REQUEST);
        }

        logger.info(`Received ${files.length} dump files for analysis`, {
            files: files.map(f => ({ name: f.originalname, size: f.size })),
            sessionId: uploadSessionId
        });

        // Create session directory in RTCStats downloads location
        await fs.ensureDir(sessionUploadDir);

        // Move all uploaded files to session directory
        for (const file of files) {
            const destPath = path.join(sessionUploadDir, file.originalname);

            await fs.move(file.path, destPath, { overwrite: true });
        }

        // Process the dumps using the SAME pipeline as RTCStats
        logger.info(`Processing dumps from RTCStats-compatible directory: ${sessionUploadDir}`);
        const processor = new DumpProcessor(sessionUploadDir);
        const session = await processor.processConferenceDumps();

        // Calculate stats
        const stats = {
            backendComponents: {
                jibris: [],
                jvbs: session.metadata?.jvbInstances || [ 'uploaded-jvb' ],
                shards: session.metadata?.jicofoShard ? [ session.metadata.jicofoShard ] : [ 'uploaded-shard' ]
            },
            meetingDuration: session.endTime ? session.endTime - session.startTime : 0,
            peakConcurrent: calculatePeakConcurrent(session),
            qualityMetrics: generateQualityMetrics(session),
            totalUsers: session.participants.length
        };

        // Create timeline
        const timeline = {
            sessionOverview: {
                duration: stats.meetingDuration,
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
                status: participant.leaveTime ? 'left' : 'active'
            }))
        };

        // Store session in memory (same as other routes do)
        const finalSession: CallSession = { ...session, sessionId: uploadSessionId };

        uploadedSessions.set(uploadSessionId, finalSession);

        // Clean up uploaded files after 24 hours (same retention as RTCStats downloads)
        setTimeout(async () => {
            try {
                await fs.remove(sessionUploadDir);
                uploadedSessions.delete(uploadSessionId);
                logger.info(`Cleaned up uploaded session: ${uploadSessionId}`);
            } catch (error) {
                logger.error('Failed to clean up upload directory', { error, sessionId: uploadSessionId });
            }
        }, 86400000); // 24 hours

        return res.apiSuccess({
            session: finalSession,
            stats,
            timeline,
            // Return the dumps path so frontend can use it with existing endpoints
            dumpsPath: sessionUploadDir
        });
    } catch (error) {
        logger.error('Upload analysis failed:', error);

        // Clean up on error
        try {
            await fs.remove(sessionUploadDir);
        } catch (cleanupError) {
            logger.error('Failed to clean up after error', cleanupError);
        }

        return res.apiError({
            code: ApiErrorCode.ANALYSIS_FAILED,
            details: error instanceof Error ? error.message : 'Unknown error',
            message: 'Failed to analyze uploaded dumps'
        }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
});

// Helper functions
function calculatePeakConcurrent(session: any): number {
    const timePoints: Map<number, number> = new Map();

    session.participants.forEach((p: any) => {
        const joinTime = p.joinTime;
        const leaveTime = p.leaveTime || Date.now();

        timePoints.set(joinTime, (timePoints.get(joinTime) || 0) + 1);
        timePoints.set(leaveTime, (timePoints.get(leaveTime) || 0) - 1);
    });

    let currentCount = 0;
    let peak = 0;

    Array.from(timePoints.keys())
        .sort((a, b) => a - b)
        .forEach(time => {
            currentCount += timePoints.get(time) || 0;
            peak = Math.max(peak, currentCount);
        });

    return peak;
}

function generateQualityMetrics(session: any): any {
    const participants = session.participants || [];

    if (participants.length === 0) {
        return {
            audioQuality: 0,
            avgJitter: 0,
            avgPacketLoss: 0,
            avgRTT: 0,
            connectionSuccessRate: 0,
            mediaInterruptions: 0,
            networkStability: 0,
            overallScore: 0,
            participantDropouts: 0,
            videoQuality: 0
        };
    }

    // Calculate averages from participant quality metrics
    let totalPacketLoss = 0;
    let totalJitter = 0;
    let totalRTT = 0;
    let participantsWithMetrics = 0;

    participants.forEach((p: any) => {
        if (p.qualityMetrics) {
            totalPacketLoss += p.qualityMetrics.packetLoss || 0;
            totalJitter += p.qualityMetrics.jitter || 0;
            totalRTT += p.qualityMetrics.roundTripTime || 0;
            participantsWithMetrics++;
        }
    });

    const avgPacketLoss = participantsWithMetrics > 0 ? totalPacketLoss / participantsWithMetrics : 0;
    const avgJitter = participantsWithMetrics > 0 ? totalJitter / participantsWithMetrics : 0;
    const avgRTT = participantsWithMetrics > 0 ? totalRTT / participantsWithMetrics : 0;

    // Count issues
    const networkIssues = (session.events || []).filter((e: any) =>
        e.eventType === 'networkIssue' || e.eventType === 'connectionIssue'
    ).length;
    const mediaInterruptions = (session.events || []).filter((e: any) =>
        e.eventType === 'mediaInterruption'
    ).length;

    // Calculate quality scores (0-5 scale)
    const audioQuality = Math.max(0, 5 - avgPacketLoss * 10);
    const videoQuality = Math.max(0, 5 - avgJitter / 20);
    const networkStability = Math.max(0, 5 - networkIssues / 2);
    const overallScore = (audioQuality + videoQuality + networkStability) / 3;

    return {
        audioQuality: Math.round(audioQuality * 10) / 10,
        avgJitter: Math.round(avgJitter),
        avgPacketLoss: Math.round(avgPacketLoss * 100) / 100,
        avgRTT: Math.round(avgRTT),
        connectionSuccessRate: 100,
        mediaInterruptions,
        networkStability: Math.round(networkStability * 10) / 10,
        overallScore: Math.round(overallScore * 10) / 10,
        participantDropouts: participants.filter((p: any) => p.leaveTime).length,
        videoQuality: Math.round(videoQuality * 10) / 10
    };
}

export default router;
