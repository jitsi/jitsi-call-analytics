/**
 * Unit tests for API Response Middleware
 */
import { Request, Response } from 'express';
import { apiResponseMiddleware } from '../src/middleware/apiResponse';

describe('API Response Middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: jest.Mock;
    let jsonMock: jest.Mock;
    let statusMock: jest.Mock;

    beforeEach(() => {
        jsonMock = jest.fn();
        statusMock = jest.fn().mockReturnThis();

        mockReq = {
            method: 'GET',
            path: '/api/v1/test'
        };
        mockRes = {
            status: statusMock,
            json: jsonMock
        };
        mockNext = jest.fn();
    });

    describe('apiSuccess', () => {
        it('should format success response correctly', () => {
            apiResponseMiddleware(mockReq as Request, mockRes as Response, mockNext);

            const testData = { message: 'Success' };
            (mockRes as any).apiSuccess(testData);

            expect(jsonMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: testData,
                    metadata: expect.objectContaining({
                        timestamp: expect.any(String),
                        version: expect.any(String),
                        requestId: expect.any(String),
                        responseTime: expect.any(String)
                    })
                })
            );
        });

        it('should include pagination when provided', () => {
            apiResponseMiddleware(mockReq as Request, mockRes as Response, mockNext);

            const testData = { items: [] };
            const pagination = { page: 1, limit: 10, total: 100 };
            (mockRes as any).apiSuccess(testData, { pagination });

            expect(jsonMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: testData,
                    metadata: expect.objectContaining({
                        timestamp: expect.any(String),
                        version: expect.any(String),
                        requestId: expect.any(String),
                        responseTime: expect.any(String),
                        pagination
                    })
                })
            );
        });

        it('should use custom status code when provided', () => {
            apiResponseMiddleware(mockReq as Request, mockRes as Response, mockNext);

            const testData = { created: true };
            (mockRes as any).apiSuccess(testData, undefined, 201);

            expect(statusMock).toHaveBeenCalledWith(201);
            expect(jsonMock).toHaveBeenCalled();
        });

        it('should default to 200 status code', () => {
            apiResponseMiddleware(mockReq as Request, mockRes as Response, mockNext);

            const testData = { message: 'OK' };
            (mockRes as any).apiSuccess(testData);

            expect(statusMock).toHaveBeenCalledWith(200);
        });
    });

    describe('apiError', () => {
        it('should format error response correctly', () => {
            apiResponseMiddleware(mockReq as Request, mockRes as Response, mockNext);

            const errorMessage = 'Something went wrong';
            (mockRes as any).apiError(errorMessage);

            expect(jsonMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: {
                        code: 'INTERNAL_ERROR',
                        message: errorMessage
                    },
                    metadata: expect.objectContaining({
                        timestamp: expect.any(String),
                        version: expect.any(String),
                        requestId: expect.any(String),
                        responseTime: expect.any(String)
                    })
                })
            );
        });

        it('should use custom error code when provided', () => {
            apiResponseMiddleware(mockReq as Request, mockRes as Response, mockNext);

            const errorMessage = 'Invalid input';
            const errorObj = { code: 'VALIDATION_ERROR' as const, message: errorMessage };
            (mockRes as any).apiError(errorObj, 400);

            expect(jsonMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: errorMessage
                    },
                    metadata: expect.objectContaining({
                        timestamp: expect.any(String)
                    })
                })
            );
        });

        it('should use custom status code when provided', () => {
            apiResponseMiddleware(mockReq as Request, mockRes as Response, mockNext);

            const errorMessage = 'Not found';
            const errorObj = { code: 'NOT_FOUND' as const, message: errorMessage };
            (mockRes as any).apiError(errorObj, 404);

            expect(statusMock).toHaveBeenCalledWith(404);
            expect(jsonMock).toHaveBeenCalled();
        });

        it('should default to 500 status code', () => {
            apiResponseMiddleware(mockReq as Request, mockRes as Response, mockNext);

            const errorMessage = 'Server error';
            (mockRes as any).apiError(errorMessage);

            expect(statusMock).toHaveBeenCalledWith(500);
        });

        it('should include error details when provided', () => {
            apiResponseMiddleware(mockReq as Request, mockRes as Response, mockNext);

            const errorMessage = 'Validation failed';
            const details = { field: 'email', reason: 'invalid format' };
            (mockRes as any).apiError(errorMessage, 400, details);

            expect(jsonMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: {
                        code: 'INTERNAL_ERROR',
                        message: errorMessage,
                        details
                    },
                    metadata: expect.objectContaining({
                        timestamp: expect.any(String)
                    })
                })
            );
        });
    });

    describe('middleware execution', () => {
        it('should call next middleware', () => {
            apiResponseMiddleware(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
        });

        it('should attach apiSuccess to response object', () => {
            apiResponseMiddleware(mockReq as Request, mockRes as Response, mockNext);

            expect((mockRes as any).apiSuccess).toBeDefined();
            expect(typeof (mockRes as any).apiSuccess).toBe('function');
        });

        it('should attach apiError to response object', () => {
            apiResponseMiddleware(mockReq as Request, mockRes as Response, mockNext);

            expect((mockRes as any).apiError).toBeDefined();
            expect(typeof (mockRes as any).apiError).toBe('function');
        });
    });

    describe('timestamp format', () => {
        it('should generate valid ISO timestamp', () => {
            apiResponseMiddleware(mockReq as Request, mockRes as Response, mockNext);

            (mockRes as any).apiSuccess({ test: true });

            const call = jsonMock.mock.calls[0][0];
            const timestamp = new Date(call.metadata.timestamp);

            expect(timestamp).toBeInstanceOf(Date);
            expect(timestamp.toISOString()).toBe(call.metadata.timestamp);
        });
    });
});
