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
  JOIN = 'join',
  LEAVE = 'leave',
  SCREENSHARE = 'screenshare',
  NETWORK_ISSUE = 'networkIssue',
  CONNECTION_ISSUE = 'connectionIssue',
  MEDIA_INTERRUPTION = 'mediaInterruption',
  CONFERENCE_STARTED = 'conference_started',
  BATCH_PROCESSED = 'batch_processed'
}

// Core Event Types
export interface CallEvent {
  timestamp: number;
  sessionId: string;
  participantId: string;
  eventType: CallEventType;
  source: 'client' | 'bridge' | 'analytics' | 'jicofo';
  metadata?: Record<string, any>;
  correlationId: string;
}

// Enhanced Event with Technical Context
export interface EnhancedCallEvent extends CallEvent {
  participant: {
    endpointId: string;
    displayName: string;
    clientVersion: string;
    osType: string;
    browserType?: string;
  };
  technicalContext?: {
    userAgent: string;
    webrtcStats?: any;
    networkConditions?: NetworkMetrics;
    errorLogs?: string[];
  };
}

// Participant Information
export interface ParticipantDetails {
  participantId: string;
  displayName: string;
  // Statistics display name from identity event
  statisticsDisplayName?: string;
  role: 'moderator' | 'presenter' | 'viewer';

  // Client Information
  endpointId: string;
  // All endpoint IDs from merged participants (for console log lookup)
  endpointIds?: string[];
  // Session mapping: sessionUUID -> endpointId for accessing underlying session data
  sessionMap?: Map<string, string>;
  clientInfo: {
    type: 'web' | 'mobile' | 'desktop';
    browser?: 'Chrome' | 'Firefox' | 'Safari' | 'Edge';
    browserVersion?: string;
    os: 'Windows' | 'macOS' | 'Linux' | 'iOS' | 'Android';
    osVersion: string;
    deviceType?: 'desktop' | 'mobile' | 'tablet';
  };
  
  // Jitsi Client Info
  jitsiClient: {
    version: string;        // e.g., "2.0.8719-1"
    buildNumber?: string;   // e.g., "8719"
    releaseChannel: 'stable' | 'beta' | 'unstable';
    platform: 'web' | 'electron' | 'react-native';
  };
  
  // Connection Details
  connection: {
    ISP?: string;
    userAgent: string;
    region?: string;
    networkType?: '4G' | '5G' | 'WiFi' | 'Ethernet';
  };
  
  // Session Events - Aggregated participant data only
  joinTime: number;
  leaveTime?: number;
  mediaEvents: MediaEvent[];
  qualityMetrics: QualityMetrics;
  metadata?: Record<string, any>;
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
export interface MediaEvent {
  timestamp: number;
  type: MediaEventType;
  participantId: string;
  metadata?: Record<string, any>;
}

// Quality Metrics
export interface QualityMetrics {
  audioQuality: number;      // 0-5 scale
  videoQuality: number;      // 0-5 scale
  packetLoss: number;        // percentage
  jitter: number;            // milliseconds
  roundTripTime: number;     // milliseconds
  bandwidth: {
    upload: number;          // Mbps
    download: number;        // Mbps
  };
}

// Network Metrics
export interface NetworkMetrics {
  rtt: number;
  packetLoss: number;
  jitter: number;
  bandwidth: {
    available: number;
    used: number;
  };
  connectionType: string;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
}

// Call Session
export interface CallSession {
  sessionId: string;
  startTime: number;
  endTime?: number;
  participants: ParticipantDetails[];
  events: EnhancedCallEvent[];
  metrics: AggregatedMetrics;
  conferenceId?: string;
  roomName?: string;
  metadata?: Record<string, any>;
}

// Aggregated Metrics
export interface AggregatedMetrics {
  duration: number;
  totalParticipants: number;
  avgAudioQuality: number;
  avgVideoQuality: number;
  networkIssues: NetworkIssue[];
  screenshareDuration: number;
  dominantSpeakerChanges: number;
}

// Network Issues
export interface NetworkIssue {
  timestamp: number;
  participantId: string;
  type: 'packet_loss' | 'high_rtt' | 'bandwidth_limit' | 'connection_drop';
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: Record<string, any>;
}

// Data Source Types
export type DataSourceType = 'rtcstats' | 'bridge_logs' | 'jaas_analytics' | 's3_dumps' | 'jicofo_logs';

export interface DataSourceConfig {
  type: DataSourceType;
  enabled: boolean;
  endpoint?: string;
  credentials?: Record<string, string>;
  pollInterval?: number;
}

// Timeline Visualization Types
export interface TimelineEvent {
  id: string;
  timestamp: number;
  type: 'join' | 'leave' | 'media' | 'quality' | 'error';
  participantId?: string;
  description: string;
  severity?: 'info' | 'warning' | 'error';
  metadata?: Record<string, any>;
}

export interface TimelineTrack {
  participantId: string;
  displayName: string;
  role: string;
  startTime: number;
  endTime?: number;
  events: TimelineEvent[];
  clientInfo: ParticipantDetails['clientInfo'];
  status: 'active' | 'left' | 'disconnected';
}

// Dashboard State Types
export interface DashboardState {
  selectedSession?: CallSession;
  selectedParticipant?: ParticipantDetails;
  timeRange: {
    start: number;
    end: number;
  };
  filters: {
    participantRole?: string[];
    eventTypes?: string[];
    qualityThreshold?: number;
  };
  viewMode: 'overview' | 'participant' | 'media' | 'network' | 'debugging';
}

// API Response Types
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
  };
}

// WebSocket Message Types
export interface WSMessage {
  type: 'session_update' | 'participant_update' | 'event_stream' | 'metrics_update';
  sessionId?: string;
  participantId?: string;
  data: any;
  timestamp: number;
}

// Grafana Integration Types
export interface GrafanaMetrics {
  'jitsi_call_duration_seconds': number;
  'jitsi_participants_total': number;
  'jitsi_audio_quality_score': number;
  'jitsi_video_quality_score': number;
  'jitsi_network_issues_total': number;
  'jitsi_screenshare_duration_seconds': number;
}

export interface AlertRule {
  name: string;
  condition: string;
  threshold: number;
  severity: 'info' | 'warning' | 'critical';
  enabled: boolean;
}