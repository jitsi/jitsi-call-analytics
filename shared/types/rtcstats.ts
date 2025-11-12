/**
 * RTCStats Types
 * Type definitions for RTCStats CLI integration
 */

export enum RTCStatsEnvironment {
    PROD = 'prod',
    PILOT = 'pilot'
}

export interface ConferenceSearchResult {
    conferenceId: string;
    environment: RTCStatsEnvironment;
    timestamp?: Date;
    searchPattern: string;
    displayName?: string;
    participantCount?: number;
    duration?: number; // milliseconds
    durationFormatted?: string; // e.g., "1h 23m" or "45m" or "2h 5m"
}

export interface DownloadStatus {
    conferenceId: string;
    environment: RTCStatsEnvironment;
    status: 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';
    progress: number; // 0-100
    startTime: Date;
    endTime?: Date;
    error?: string;
    downloadPath?: string;
    fileCount?: number;
    totalSize?: number;
    metadata?: {
        notFoundCount?: number; // Count of 404 errors from S3
    };
}

export interface DownloadResult {
    conferenceId: string;
    environment: RTCStatsEnvironment;
    success: boolean;
    downloadPath: string;
    files: string[];
    error?: string;
    duration: number; // milliseconds
}

export interface RTCStatsConference {
    conferenceId: string;
    environment: RTCStatsEnvironment;
    downloadStatus: DownloadStatus;
    isAnalyzed: boolean;
    downloadedAt?: Date;
    analyzedAt?: Date;
    participantCount?: number;
    duration?: number;
    roomName?: string;
}

export interface RTCStatsSearchResponse {
    conferences: ConferenceSearchResult[];
    searchPattern: string;
    environment: RTCStatsEnvironment;
    count: number;
    searchTime: number; // milliseconds
}

export interface RTCStatsDownloadRequest {
    conferenceId: string;
    environment: RTCStatsEnvironment;
    priority?: 'low' | 'normal' | 'high';
}

export interface RTCStatsDownloadResponse {
    success: boolean;
    message: string;
    conferenceId: string;
    environment: RTCStatsEnvironment;
    downloadId?: string;
}

