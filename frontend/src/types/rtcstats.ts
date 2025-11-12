/**
 * RTCStats Types
 * Type definitions for RTCStats CLI integration
 */

export enum RTCStatsEnvironment {
    PILOT = 'pilot',
    PROD = 'prod'
}

export interface IConferenceSearchResult {
    conferenceId: string;
    displayName?: string;
    duration?: number;
    durationFormatted?: string; // e.g., "1h 23m" or "45m"
    environment: RTCStatsEnvironment;
    participantCount?: number;
    searchPattern: string;
    timestamp?: Date;
}

export interface IDownloadStatus {
    conferenceId: string;
    downloadPath?: string;
    endTime?: Date;
    environment: RTCStatsEnvironment;
    error?: string;
    fileCount?: number;
    progress: number;
    // 0-100
    startTime: Date;
    status: 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';
    totalSize?: number;
}

export interface IDownloadResult {
    conferenceId: string;
    downloadPath: string;
    duration: number;
    environment: RTCStatsEnvironment;
    error?: string;
    files: string[];
    success: boolean; // milliseconds
}

export interface IRTCStatsConference {
    analyzedAt?: Date;
    conferenceId: string;
    downloadStatus: IDownloadStatus;
    downloadedAt?: Date;
    duration?: number;
    environment: RTCStatsEnvironment;
    isAnalyzed: boolean;
    participantCount?: number;
    roomName?: string;
}

export interface IRTCStatsSearchResponse {
    conferences: IConferenceSearchResult[];
    count: number;
    environment: RTCStatsEnvironment;
    searchPattern: string;
    searchTime: number; // milliseconds
}

export interface IRTCStatsDownloadRequest {
    conferenceId: string;
    environment: RTCStatsEnvironment;
    priority?: 'low' | 'normal' | 'high';
}

export interface IRTCStatsDownloadResponse {
    alreadyDownloaded?: boolean;
    conferenceId: string;
    downloadId?: string;
    environment: RTCStatsEnvironment;
    message: string;
    success: boolean;
}

