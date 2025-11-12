/**
 * API Response wrapper middleware for standardized responses
 */
import { getLogger } from '@jitsi/logger';
import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

import {
    ApiErrorCode,
    HttpStatus,
    IApiError,
    IApiMetadata,
    IApiResponse,
    IPaginationInfo
} from '../types/api';

const logger = getLogger('middleware/apiResponse');
const API_VERSION = '1.0.0';

export function apiResponseMiddleware(req: Request, res: Response, next: NextFunction): void {
    // Add request ID and timing
    req.requestId = uuidv4();
    req.startTime = Date.now();

    // Success response helper
    res.apiSuccess = function<T>(data: T, metadata: Partial<IApiMetadata> = {}, status = HttpStatus.OK): Response {
        const responseTime = Date.now() - req.startTime;

        const response: IApiResponse<T> = {
            success: true,
            data,
            metadata: {
                timestamp: new Date().toISOString(),
                version: API_VERSION,
                requestId: req.requestId,
                responseTime: `${responseTime}ms`,
                ...metadata
            }
        };

        // Skip verbose logging for status check endpoints to reduce noise
        const isStatusCheck = req.path.includes('/status');

        if (!isStatusCheck) {
            logger.debug(`API Success: ${req.method} ${req.path} - ${status} (${responseTime}ms)`);
        }

        return res.status(status).json(response);
    };

    // Error response helper
    res.apiError
        = function(error: IApiError | string, status = HttpStatus.INTERNAL_SERVER_ERROR, details?: any): Response {
            const responseTime = Date.now() - req.startTime;

            let apiError: IApiError;

            if (typeof error === 'string') {
                apiError = {
                    code: ApiErrorCode.INTERNAL_ERROR,
                    message: error,
                    details
                };
            } else {
                apiError = { ...error, details: details || error.details };
            }

            const response: IApiResponse = {
                success: false,
                error: apiError,
                metadata: {
                    timestamp: new Date().toISOString(),
                    version: API_VERSION,
                    requestId: req.requestId,
                    responseTime: `${responseTime}ms`
                }
            };

            logger.warn(`API Error: ${req.method} ${req.path} - ${status} (${responseTime}ms): ${apiError.message}`, {
                error: apiError,
                requestId: req.requestId
            });

            return res.status(status).json(response);
        };

    // Paginated response helper
    res.apiPaginated = function<T>(data: T[], pagination: IPaginationInfo, metadata: Partial<IApiMetadata> = {}) {
        return res.apiSuccess(data, {
            ...metadata,
            pagination
        });
    };

    next();
}

// Helper function to create pagination info
export function createPaginationInfo(
        page: number,
        limit: number,
        total: number
): IPaginationInfo {
    const totalPages = Math.ceil(total / limit);

    return {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
    };
}

// Helper function to parse pagination query
export function parsePaginationQuery(req: Request) {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

    return {
        page,
        limit,
        sortBy,
        sortOrder,
        offset: (page - 1) * limit
    };
}

// Error handling middleware
export function globalErrorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
    logger.error(`Global error handler: ${err.message}`, {
        error: err,
        requestId: req.requestId,
        path: req.path,
        method: req.method
    });

    // Don't send error response if headers already sent
    if (res.headersSent) {
        return next(err);
    }

    // Handle different error types
    if (err.name === 'ValidationError') {
        res.apiError({
            code: ApiErrorCode.INVALID_REQUEST,
            message: 'Validation failed',
            details: err.details || err.message
        }, HttpStatus.BAD_REQUEST);

        return;
    }

    if (err.name === 'CastError') {
        res.apiError({
            code: ApiErrorCode.INVALID_PARAMETER,
            message: 'Invalid parameter format',
            field: err.path
        }, HttpStatus.BAD_REQUEST);

        return;
    }

    if (err.status === 404) {
        res.apiError({
            code: ApiErrorCode.RESOURCE_NOT_FOUND,
            message: err.message || 'Resource not found'
        }, HttpStatus.NOT_FOUND);

        return;
    }

    // Default internal server error
    res.apiError({
        code: ApiErrorCode.INTERNAL_ERROR,
        message: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message
    }, HttpStatus.INTERNAL_SERVER_ERROR);
}

// Request logging middleware
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
    // Skip verbose logging for status check endpoints to reduce noise
    const isStatusCheck = req.path.includes('/status');

    if (!isStatusCheck) {
        logger.debug(`${req.method} ${req.path}`, {
            requestId: req.requestId,
            userAgent: req.get('User-Agent'),
            ip: req.ip,
            query: req.query,
            body: req.method !== 'GET' ? req.body : undefined
        });
    }

    next();
}
