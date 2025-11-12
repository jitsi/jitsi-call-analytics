/**
 * Standardized API response types for consistent frontend integration
 */

export interface IApiResponse<T = any> {
    data?: T;
    error?: IApiError;
    metadata?: IApiMetadata;
    success: boolean;
}

export interface IApiError {
    code: string;
    details?: any;
    field?: string;
    message: string;
}

export interface IApiMetadata {
    pagination?: IPaginationInfo;
    requestId?: string;
    responseTime?: string;
    timestamp: string;
    version: string;
    warnings?: string[];
}

export interface IPaginationInfo {
    hasNext: boolean;
    hasPrev: boolean;
    limit: number;
    page: number;
    total: number;
    totalPages: number;
}

export interface IPaginationQuery {
    limit?: number;
    page?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

// HTTP Status Codes
export enum HttpStatus {
    OK = 200,
    CREATED = 201,
    NO_CONTENT = 204,
    BAD_REQUEST = 400,
    UNAUTHORIZED = 401,
    FORBIDDEN = 403,
    NOT_FOUND = 404,
    CONFLICT = 409,
    UNPROCESSABLE_ENTITY = 422,
    INTERNAL_SERVER_ERROR = 500,
    SERVICE_UNAVAILABLE = 503,
}

// Error Codes
export enum ApiErrorCode {
    // Analysis errors
    ANALYSIS_FAILED = 'ANALYSIS_FAILED',
    // Infrastructure errors
    BRIDGE_ERROR = 'BRIDGE_ERROR',
    DATABASE_ERROR = 'DATABASE_ERROR',

    INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
    // System errors
    INTERNAL_ERROR = 'INTERNAL_ERROR',

    INVALID_DISPLAY_NAME = 'INVALID_DISPLAY_NAME',
    INVALID_PARAMETER = 'INVALID_PARAMETER',
    // Generic errors
    INVALID_REQUEST = 'INVALID_REQUEST',

    INVALID_SESSION_DATA = 'INVALID_SESSION_DATA',
    JICOFO_ERROR = 'JICOFO_ERROR',

    // Data retrieval errors
    LOG_RETRIEVAL_FAILED = 'LOG_RETRIEVAL_FAILED',
    MISSING_PARAMETER = 'MISSING_PARAMETER',

    // Participant errors
    PARTICIPANT_NOT_FOUND = 'PARTICIPANT_NOT_FOUND',
    RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
    // Resource errors
    RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',

    SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
    // Session errors
    SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',

    SESSION_PROCESSING_ERROR = 'SESSION_PROCESSING_ERROR',
    STATS_RETRIEVAL_FAILED = 'STATS_RETRIEVAL_FAILED',
}

// Specific response types
export interface ISessionResponse {
    createdAt: string;
    endTime?: string;
    id: string;
    name: string;
    participantCount: number;
    startTime: string;
    status: 'active' | 'completed' | 'failed';
    updatedAt: string;
}

export interface IParticipantResponse {
    applicationName?: string;
    componentType: 'participant' | 'JVB' | 'focus';
    displayName: string;
    endpointId?: string;
    eventCount: number;
    id: string;
    joinTime: string;
    leaveTime?: string;
    sessionId: string;
}

export interface ILogEntryResponse {
    category?: string;
    data?: any;
    level: string;
    message: string;
    timestamp: string;
}

export interface IStatisticsResponse {
    audioStats?: IAudioStats;
    connectionStats?: IConnectionStats;
    generatedAt: string;
    networkStats?: INetworkStats;
    participantId: string;
    sessionId: string;
    videoStats?: IVideoStats;
}

export interface INetworkStats {
    bandwidth: {
        download: number[];
        upload: number[];
    };
    jitter: number[];
    packetLoss: number[];
    rtt: number[];
}

export interface IAudioStats {
    bytesReceived: number;
    codecName?: string;
    packetsLost: number;
    packetsReceived: number;
    sampleRate?: number;
}

export interface IVideoStats {
    bytesReceived: number;
    codecName?: string;
    framesDecoded: number;
    framesDropped: number;
    packetsLost: number;
    packetsReceived: number;
    resolution?: {
        height: number;
        width: number;
    };
}

export interface IConnectionStats {
    connectionState: string;
    dtlsState: string;
    iceConnectionState: string;
    selectedCandidatePair?: any;
}
