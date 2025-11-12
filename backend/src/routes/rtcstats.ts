/**
 * RTCStats Routes
 * API endpoints for RTCStats CLI integration
 */

import { getLogger } from '@jitsi/logger';
import express, { Request, Response } from 'express';

import {
    RTCStatsDownloadRequest,
    RTCStatsEnvironment
} from '../../../shared/types/rtcstats';
import RTCStatsService from '../services/RTCStatsService';
import { ApiErrorCode, HttpStatus } from '../types/api';

const logger = getLogger('backend/src/routes/rtcstats');
const router = express.Router();

// Initialize RTCStats service
const rtcstatsService = new RTCStatsService();

/**
 * Search conferences in production RTCStats
 *
 * @api {GET} /api/rtcstats/search Search conferences
 * @param {Request} req - Express request object
 * @param {string} req.query.q - Search pattern for conference IDs/names
 * @param {string} req.query.env - Environment: 'prod' or 'pilot' (optional, defaults to 'prod')
 * @param {string} req.query.startDate - Start date for search range (ISO 8601 format, optional)
 * @param {string} req.query.endDate - End date for search range (ISO 8601 format, optional)
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with conference search results
 * @returns {boolean} returns.success - Whether the search was successful
 * @returns {Object} returns.data - Search results container
 * @returns {Array} returns.data.conferences - Array of conference search results
 * @returns {string} returns.data.searchPattern - The search pattern used
 * @returns {string} returns.data.environment - Environment searched
 * @returns {number} returns.data.count - Number of conferences found
 * @returns {Object} returns.data.dateRange - Date range used for filtering
 * @returns {string} returns.data.dateRange.startDate - Start date (ISO 8601)
 * @returns {string} returns.data.dateRange.endDate - End date (ISO 8601)
 * @throws {400} Bad request if search pattern is missing or date format is invalid
 * @throws {500} Internal server error if search fails
 */
router.get('/search', async (req: Request, res: Response) => {
    try {
        const { q: pattern, env, startDate: startDateStr, endDate: endDateStr } = req.query;

        if (!pattern || typeof pattern !== 'string') {
            return res.apiError({
                code: ApiErrorCode.INVALID_PARAMETER,
                message: 'Search pattern (q) is required'
            }, HttpStatus.BAD_REQUEST);
        }

        const environment = (env === RTCStatsEnvironment.PILOT)
            ? env as RTCStatsEnvironment : RTCStatsEnvironment.PROD;

        // Parse date parameters
        let startDate: Date | undefined;
        let endDate: Date | undefined;

        if (startDateStr && typeof startDateStr === 'string') {
            startDate = new Date(startDateStr);
            if (isNaN(startDate.getTime())) {
                return res.apiError({
                    code: ApiErrorCode.INVALID_PARAMETER,
                    message: 'Invalid startDate format. Use ISO 8601 format.'
                }, HttpStatus.BAD_REQUEST);
            }
        }

        if (endDateStr && typeof endDateStr === 'string') {
            endDate = new Date(endDateStr);
            if (isNaN(endDate.getTime())) {
                return res.apiError({
                    code: ApiErrorCode.INVALID_PARAMETER,
                    message: 'Invalid endDate format. Use ISO 8601 format.'
                }, HttpStatus.BAD_REQUEST);
            }
        }

        logger.info(`RTCStats search request: pattern="${pattern}", environment="${environment}"`, {
            startDate: startDate?.toISOString(),
            endDate: endDate?.toISOString()
        });

        const startTime = Date.now();
        const conferences = await rtcstatsService.searchConferences(pattern, environment, startDate, endDate);
        const searchTime = Date.now() - startTime;

        logger.info(`RTCStats search completed: ${conferences.length} results in ${searchTime}ms`);

        res.apiSuccess({
            conferences,
            searchPattern: pattern,
            environment,
            count: conferences.length,
            searchTime,
            dateRange: {
                startDate: startDate?.toISOString(),
                endDate: endDate?.toISOString()
            }
        });
    } catch (error) {
        logger.error('RTCStats search failed:', error);
        res.apiError({
            code: ApiErrorCode.SERVICE_UNAVAILABLE,
            message: `Conference search failed: ${(error as Error).message}`
        }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
});

/**
 * Trigger download of specific conference
 *
 * @api {POST} /api/rtcstats/download/:conferenceId Download conference dumps
 * @param {Request} req - Express request object
 * @param {string} req.params.conferenceId - Conference ID to download
 * @param {Object} req.body - Request body
 * @param {string} req.body.environment - Environment: 'prod' or 'pilot' (optional, defaults to 'prod')
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with download initiation status
 * @returns {boolean} returns.success - Whether download was started successfully
 * @returns {Object} returns.data - Download response data
 * @returns {string} returns.data.message - Success message
 * @returns {string} returns.data.conferenceId - Conference ID being downloaded
 * @returns {string} returns.data.environment - Environment being downloaded from
 * @throws {400} Bad request if conference ID is invalid
 * @throws {409} Conflict if download is already in progress
 * @throws {500} Internal server error if download initiation fails
 */
router.post('/download/:conferenceId', async (req: Request, res: Response) => {
    try {
        const { conferenceId } = req.params;
        const { environment = RTCStatsEnvironment.PROD } = req.body as RTCStatsDownloadRequest;

        if (!conferenceId || typeof conferenceId !== 'string') {
            return res.apiError({
                code: ApiErrorCode.INVALID_PARAMETER,
                message: 'Conference ID is required'
            }, HttpStatus.BAD_REQUEST);
        }

        const env = (environment === RTCStatsEnvironment.PILOT)
            ? environment : RTCStatsEnvironment.PROD;

        logger.info(`RTCStats download request: conferenceId="${conferenceId}", environment="${env}"`);

        // Check if already downloaded
        const isDownloaded = await rtcstatsService.isConferenceDownloaded(conferenceId, env);
        const downloadPath = rtcstatsService.getConferenceDownloadPath(conferenceId, env);

        logger.info(`Download check: path="${downloadPath}", isDownloaded=${isDownloaded}`);

        if (isDownloaded) {
            logger.info(`Conference already downloaded at: ${downloadPath}`);

            return res.apiSuccess({
                message: 'Conference already downloaded',
                conferenceId,
                environment: env,
                alreadyDownloaded: true
            });
        }

        // Check if currently downloading
        const currentStatus = rtcstatsService.getDownloadStatus(conferenceId);

        if (currentStatus && (currentStatus.status === 'downloading' || currentStatus.status === 'pending')) {
            return res.apiError({
                code: ApiErrorCode.RESOURCE_ALREADY_EXISTS,
                message: 'Conference download is already in progress'
            }, HttpStatus.CONFLICT);
        }

        // Start download (don't await - it runs in background)
        rtcstatsService.downloadConference(conferenceId, env).catch(error => {
            logger.error(`Background download failed for ${conferenceId}:`, error);
        });

        res.apiSuccess({
            message: 'Conference download started',
            conferenceId,
            environment: env
        });

    } catch (error) {
        logger.error('RTCStats download initiation failed:', error);
        res.apiError({
            code: ApiErrorCode.SERVICE_UNAVAILABLE,
            message: `Failed to start download: ${(error as Error).message}`
        }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
});

/**
 * Get download status/progress for a specific conference
 *
 * @api {GET} /api/rtcstats/download/:conferenceId/status Get download status
 * @param {Request} req - Express request object
 * @param {string} req.params.conferenceId - Conference ID to check status for
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with download status
 * @returns {boolean} returns.success - Whether the request was successful
 * @returns {Object} returns.data - Download status data or null if not found
 * @throws {404} Not found if no download status exists
 */
router.get('/download/:conferenceId/status', async (req: Request, res: Response) => {
    try {
        const { conferenceId } = req.params;

        const status = rtcstatsService.getDownloadStatus(conferenceId);

        if (!status) {
            return res.apiError({
                code: ApiErrorCode.RESOURCE_NOT_FOUND,
                message: 'Download status not found'
            }, HttpStatus.NOT_FOUND);
        }

        res.apiSuccess(status);

    } catch (error) {
        logger.error('Failed to get download status:', error);
        res.apiError({
            code: ApiErrorCode.INTERNAL_ERROR,
            message: 'Failed to get download status'
        }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
});

/**
 * Get all download statuses
 *
 * @api {GET} /api/rtcstats/downloads Get all download statuses
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with all download statuses
 * @returns {boolean} returns.success - Whether the request was successful
 * @returns {Array} returns.data - Array of all download statuses
 */
router.get('/downloads', async (req: Request, res: Response) => {
    try {
        const statuses = rtcstatsService.getAllDownloadStatuses();

        res.apiSuccess({
            downloads: statuses,
            count: statuses.length
        });

    } catch (error) {
        logger.error('Failed to get download statuses:', error);
        res.apiError({
            code: ApiErrorCode.INTERNAL_ERROR,
            message: 'Failed to get download statuses'
        }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
});

/**
 * List downloaded conferences available for analysis
 *
 * @api {GET} /api/rtcstats/downloaded List downloaded conferences
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with downloaded conferences
 * @returns {boolean} returns.success - Whether the request was successful
 * @returns {Array} returns.data.conferences - Array of downloaded conferences
 * @returns {number} returns.data.count - Number of downloaded conferences
 */
router.get('/downloaded', async (req: Request, res: Response) => {
    try {
        const conferences = await rtcstatsService.getDownloadedConferences();

        res.apiSuccess({
            conferences,
            count: conferences.length
        });

    } catch (error) {
        logger.error('Failed to get downloaded conferences:', error);
        res.apiError({
            code: ApiErrorCode.INTERNAL_ERROR,
            message: 'Failed to get downloaded conferences'
        }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
});

/**
 * Cancel ongoing download
 *
 * @api {DELETE} /api/rtcstats/download/:conferenceId Cancel download
 * @param {Request} req - Express request object
 * @param {string} req.params.conferenceId - Conference ID to cancel download for
 * @param {Object} req.body - Request body
 * @param {string} req.body.environment - Environment of the download to cancel
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with cancellation status
 * @returns {boolean} returns.success - Whether cancellation was successful
 * @returns {Object} returns.data - Cancellation response data
 * @throws {404} Not found if download is not active
 */
router.delete('/download/:conferenceId', async (req: Request, res: Response) => {
    try {
        const { conferenceId } = req.params;
        const { environment = RTCStatsEnvironment.PROD } = req.body;

        const env = (environment === RTCStatsEnvironment.PILOT)
            ? environment : RTCStatsEnvironment.PROD;

        const cancelled = await rtcstatsService.cancelDownload(conferenceId, env);

        if (!cancelled) {
            return res.apiError({
                code: ApiErrorCode.RESOURCE_NOT_FOUND,
                message: 'No active download found to cancel'
            }, HttpStatus.NOT_FOUND);
        }

        res.apiSuccess({
            message: 'Download cancelled successfully',
            conferenceId,
            environment: env
        });

    } catch (error) {
        logger.error('Failed to cancel download:', error);
        res.apiError({
            code: ApiErrorCode.INTERNAL_ERROR,
            message: 'Failed to cancel download'
        }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
});

/**
 * Cleanup old downloads
 *
 * @api {POST} /api/rtcstats/cleanup Cleanup old downloads
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @returns {Object} JSON response with cleanup status
 * @returns {boolean} returns.success - Whether cleanup was successful
 * @returns {Object} returns.data - Cleanup response data
 */
router.post('/cleanup', async (req: Request, res: Response) => {
    try {
        logger.info('Manual cleanup of old RTCStats downloads requested');

        await rtcstatsService.cleanupOldDownloads();

        res.apiSuccess({
            message: 'Cleanup completed successfully'
        });

    } catch (error) {
        logger.error('Failed to cleanup downloads:', error);
        res.apiError({
            code: ApiErrorCode.INTERNAL_ERROR,
            message: 'Failed to cleanup downloads'
        }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
});

export default router;
