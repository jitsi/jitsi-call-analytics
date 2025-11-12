/**
 * Shared TypeScript definitions for Jitsi Call Analytics
 * Based on the Next-Gen Jitsi Meet Call Analytics Platform Design Document
 */

// Dump Event Types Enum
// These event types appear in NDJSON dump files from Jitsi components
export enum DumpEventType {
    AUDIO_MUTED_CHANGED = 'audioMutedChanged',
    CLOSE = 'close',
    CONFERENCE_START_TIMESTAMP = 'conferenceStartTimestamp',
    CONNECTION_INFO = 'connectionInfo',
    DOMINANT_SPEAKER_CHANGED = 'dominantSpeakerChanged',
    GETSTATS = 'getstats',
    IDENTITY = 'identity',
    JVB_ICE_RESTARTED = 'jvbIceRestarted',
    LOGS = 'logs',
    REMOTE_SOURCE_INTERRUPTED = 'remoteSourceInterrupted',
    REMOTE_SOURCE_SUSPENDED = 'remoteSourceSuspended',
    SCREENSHARE_TOGGLED = 'screenshareToggled',
    STATS = 'stats',
    STROPHE_DISCONNECTED = 'stropheDisconnected',
    STROPHE_RECONNECTED = 'stropheReconnected',
    VIDEO_MUTED_CHANGED = 'videoMutedChanged'
}

// Call Event Types Enum
export enum CallEventType {
    BATCH_PROCESSED = 'batch_processed',
    CONFERENCE_STARTED = 'conference_started',
    CONNECTION_ISSUE = 'connectionIssue',
    JOIN = 'join',
    LEAVE = 'leave',
    MEDIA_INTERRUPTION = 'mediaInterruption',
    NETWORK_ISSUE = 'networkIssue',
    SCREENSHARE = 'screenshare'
}

// Core Event Types
export interface ICallEvent {
    correlationId: string;
    eventType: CallEventType;
    metadata?: Record<string, any>;
    participantId: string;
    sessionId: string;
    source: 'client' | 'bridge' | 'analytics' | 'jicofo';
    timestamp: number;
}

// Enhanced Event with Technical Context
export interface IEnhancedCallEvent extends ICallEvent {
    participant: {
        browserType?: string;
        clientVersion: string;
        displayName: string;
        endpointId: string;
        osType: string;
    };
    technicalContext?: {
        errorLogs?: string[];
        networkConditions?: INetworkMetrics;
        userAgent: string;
        webrtcStats?: any;
    };
}

// Participant Information
export interface IParticipantDetails {
    clientInfo: {
        browser?: 'Chrome' | 'Firefox' | 'Safari' | 'Edge';
        browserVersion?: string;
        deviceType?: 'desktop' | 'mobile' | 'tablet';
        os: 'Windows' | 'macOS' | 'Linux' | 'iOS' | 'Android';
        osVersion: string;
        type: 'web' | 'mobile' | 'desktop';
    };
    // Connection Details
    connection: {
        ISP?: string;
        networkType?: '4G' | '5G' | 'WiFi' | 'Ethernet';
        region?: string;
        userAgent: string;
    };
    displayName: string;
    // Client Information
    endpointId: string;

    // All endpoint IDs from merged participants (for console log lookup)
    endpointIds?: string[];
    // Jitsi Client Info
    jitsiClient: {
        // e.g., "2.0.8719-1"
        buildNumber?: string;
        platform: 'web' | 'electron' | 'react-native'; // e.g., "8719"
        releaseChannel: 'stable' | 'beta' | 'unstable';
        version: string;
    };
    // Session Events - Aggregated participant data only
    joinTime: number;
    leaveTime?: number;

    mediaEvents: IMediaEvent[];

    metadata?: Record<string, any>;

    participantId: string;
    qualityMetrics: IQualityMetrics;
    role: 'moderator' | 'presenter' | 'viewer';
    // Session mapping: sessionUUID -> endpointId for accessing underlying session data
    sessionMap?: Map<string, string>;
    // Statistics display name from identity event
    statisticsDisplayName?: string;
}

// Media Event Types Enum
export enum MediaEventType {
    AUDIO_MUTE = 'audio_mute',
    AUDIO_UNMUTE = 'audio_unmute',
    BWE_ISSUE = 'bwe_issue',
    CONNECTION_ISSUE = 'connection_issue',
    CONNECTION_RECOVERY = 'connection_recovery',
    DOMINANT_SPEAKER_START = 'dominant_speaker_start',
    DOMINANT_SPEAKER_STOP = 'dominant_speaker_stop',
    ICE_FAILURE = 'ice_failure',
    MEDIA_INTERRUPTION = 'media_interruption',
    NETWORK_ISSUE = 'network_issue',
    SCREENSHARE_START = 'screenshare_start',
    SCREENSHARE_STOP = 'screenshare_stop',
    VIDEO_DISABLE = 'video_disable',
    VIDEO_ENABLE = 'video_enable'
}

// Media Event Interface
export interface IMediaEvent {
    metadata?: Record<string, any>;
    participantId: string;
    timestamp: number;
    type: MediaEventType;
}

// Quality Metrics
export interface IQualityMetrics {
    audioQuality: number;
    // milliseconds
    bandwidth: {
        // Mbps
        download: number;
        upload: number; // Mbps
    };
    // percentage
    jitter: number;
    // 0-5 scale
    packetLoss: number; // milliseconds
    roundTripTime: number;
    // 0-5 scale
    videoQuality: number;
}

// Network Metrics
export interface INetworkMetrics {
    bandwidth: {
        available: number;
        used: number;
    };
    connectionType: string;
    jitter: number;
    packetLoss: number;
    quality: 'excellent' | 'good' | 'fair' | 'poor';
    rtt: number;
}

// Call Session
export interface ICallSession {
    conferenceId?: string;
    endTime?: number;
    events: IEnhancedCallEvent[];
    metadata?: Record<string, any>;
    metrics: IAggregatedMetrics;
    participants: IParticipantDetails[];
    roomName?: string;
    sessionId: string;
    startTime: number;
}

// Aggregated Metrics
export interface IAggregatedMetrics {
    avgAudioQuality: number;
    avgVideoQuality: number;
    dominantSpeakerChanges: number;
    duration: number;
    networkIssues: INetworkIssue[];
    screenshareDuration: number;
    totalParticipants: number;
}

// Network Issues
export interface INetworkIssue {
    details: Record<string, any>;
    participantId: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    timestamp: number;
    type: 'packet_loss' | 'high_rtt' | 'bandwidth_limit' | 'connection_drop';
}

// Data Source Types
export type DataSourceType = 'rtcstats' | 'bridge_logs' | 'jaas_analytics' | 's3_dumps' | 'jicofo_logs';

export interface IDataSourceConfig {
    credentials?: Record<string, string>;
    enabled: boolean;
    endpoint?: string;
    pollInterval?: number;
    type: DataSourceType;
}

// Timeline Visualization Types
export interface ITimelineEvent {
    description: string;
    id: string;
    metadata?: Record<string, any>;
    participantId?: string;
    severity?: 'info' | 'warning' | 'error';
    timestamp: number;
    type: 'join' | 'leave' | 'media' | 'quality' | 'error';
}

export interface ITimelineTrack {
    clientInfo: IParticipantDetails['clientInfo'];
    displayName: string;
    endTime?: number;
    events: ITimelineEvent[];
    participantId: string;
    role: string;
    startTime: number;
    status: 'active' | 'left' | 'disconnected';
}

// Dashboard State Types
export interface IDashboardState {
    filters: {
        eventTypes?: string[];
        participantRole?: string[];
        qualityThreshold?: number;
    };
    selectedParticipant?: IParticipantDetails;
    selectedSession?: ICallSession;
    timeRange: {
        end: number;
        start: number;
    };
    viewMode: 'overview' | 'participant' | 'media' | 'network' | 'debugging';
}

// API Response Types
export interface IAPIResponse<T> {
    data?: T;
    error?: string;
    pagination?: {
        limit: number;
        page: number;
        total: number;
    };
    success: boolean;
}

// WebSocket Message Types
export interface IWSMessage {
    data: any;
    participantId?: string;
    sessionId?: string;
    timestamp: number;
    type: 'session_update' | 'participant_update' | 'event_stream' | 'metrics_update';
}

// Grafana Integration Types
export interface IGrafanaMetrics {
    'jitsi_audio_quality_score': number;
    'jitsi_call_duration_seconds': number;
    'jitsi_network_issues_total': number;
    'jitsi_participants_total': number;
    'jitsi_screenshare_duration_seconds': number;
    'jitsi_video_quality_score': number;
}

export interface IAlertRule {
    condition: string;
    enabled: boolean;
    name: string;
    severity: 'info' | 'warning' | 'critical';
    threshold: number;
}
