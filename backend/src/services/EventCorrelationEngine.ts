/**
 * Event Correlation Engine
 * Correlates events across multiple data sources and reconstructs call sessions
 */
import { getLogger } from '@jitsi/logger';
import { EventEmitter } from 'events';

const logger = getLogger('backend/src/services/EventCorrelationEngine');

import { CallEvent, CallEventType, CallSession, EnhancedCallEvent, ParticipantDetails } from '../../../shared/types';

interface ISessionState {
    endTime?: number;
    events: EnhancedCallEvent[];
    lastActivity: number;
    participants: Map<string, ParticipantDetails>;
    sessionId: string;
    startTime: number;
}

export class EventCorrelationEngine extends EventEmitter {
    private activeSessions: Map<string, ISessionState>;
    private correlationWindow: number; // Time window for event correlation (ms)
    private sessionTimeout: number; // Session inactivity timeout (ms)
    private cleanupInterval: NodeJS.Timeout;

    /**
     * Creates a new EventCorrelationEngine instance.
     * Correlates events across multiple data sources and reconstructs call sessions.
     */
    constructor() {
        super();
        this.activeSessions = new Map();
        this.correlationWindow = 5000; // 5 seconds
        this.sessionTimeout = 300000; // 5 minutes

        // Start periodic cleanup of inactive sessions
        this.cleanupInterval = setInterval(() => {
            this._cleanupInactiveSessions();
        }, 60000); // Every minute
    }

    // ============================
    // PRIVATE UTILITY METHODS
    // ============================

    /**
     * Extracts display name from a call event.
     * Attempts to find participant display name from event metadata.
     *
     * @private
     * @param event - The call event to extract display name from
     * @returns Extracted display name or fallback identifier
     */
    private _extractDisplayName(event: CallEvent): string {
        return event.metadata?.displayName || event.metadata?.name || `Participant ${event.participantId}`;
    }

    /**
     * Extracts client version from a call event.
     * Attempts to find client version information from event metadata.
     *
     * @private
     * @param event - The call event to extract client version from
     * @returns Extracted client version or 'unknown'
     */
    private _extractClientVersion(event: CallEvent): string {
        return event.metadata?.clientVersion || event.metadata?.version || 'unknown';
    }

    /**
     * Extracts operating system type from a call event.
     * Analyzes user agent string to determine the operating system.
     *
     * @private
     * @param event - The call event to extract OS type from
     * @returns Detected operating system type
     */
    private _extractOSType(event: CallEvent): string {
        const userAgent = event.metadata?.userAgent || '';

        if (userAgent.includes('Windows')) return 'Windows';
        if (userAgent.includes('Mac')) return 'macOS';
        if (userAgent.includes('Linux')) return 'Linux';
        if (userAgent.includes('Android')) return 'Android';
        if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';

        return 'Unknown';
    }

    /**
     * Extracts browser type from a call event.
     * Analyzes user agent string to determine the browser type.
     *
     * @private
     * @param event - The call event to extract browser type from
     * @returns Detected browser type
     */
    private _extractBrowserType(event: CallEvent): string {
        const userAgent = event.metadata?.userAgent || '';

        if (userAgent.includes('Chrome')) return 'Chrome';
        if (userAgent.includes('Firefox')) return 'Firefox';
        if (userAgent.includes('Safari')) return 'Safari';
        if (userAgent.includes('Edge')) return 'Edge';

        return 'Unknown';
    }

    /**
     * Extracts network conditions from a call event.
     * Gathers network quality metrics from event metadata.
     *
     * @private
     * @param event - The call event to extract network conditions from
     * @returns Network conditions object with RTT, packet loss, jitter, and quality
     */
    private _extractNetworkConditions(event: CallEvent): any {
        return {
            rtt: event.metadata?.rtt || event.metadata?.roundTripTime,
            packetLoss: event.metadata?.packetLoss || event.metadata?.loss,
            jitter: event.metadata?.jitter,
            quality: event.metadata?.networkQuality || 'unknown'
        };
    }

    /**
     * Extracts participant role from an enhanced call event.
     * Determines the participant's role in the conference.
     *
     * @private
     * @param event - The enhanced call event to extract role from
     * @returns Participant role (moderator, presenter, or viewer)
     */
    private _extractRole(event: EnhancedCallEvent): 'moderator' | 'presenter' | 'viewer' {
        return (event.metadata?.role as any) || 'viewer';
    }

    /**
     * Extracts client type from an enhanced call event.
     * Determines whether the client is web, mobile, or desktop based on user agent.
     *
     * @private
     * @param event - The enhanced call event to extract client type from
     * @returns Client type (web, mobile, or desktop)
     */
    private _extractClientType(event: EnhancedCallEvent): 'web' | 'mobile' | 'desktop' {
        const userAgent = event.technicalContext?.userAgent || '';

        if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
            return 'mobile';
        }
        if (userAgent.includes('Electron')) {
            return 'desktop';
        }

        return 'web';
    }

    /**
     * Extracts browser version from an enhanced call event.
     * Parses user agent string to find browser version information.
     *
     * @private
     * @param event - The enhanced call event to extract browser version from
     * @returns Browser version string or 'unknown'
     */
    private _extractBrowserVersion(event: EnhancedCallEvent): string {
        const userAgent = event.technicalContext?.userAgent || '';
        const match = userAgent.match(/Chrome\/(\d+\.\d+)|Firefox\/(\d+\.\d+)|Safari\/(\d+\.\d+)|Edge\/(\d+\.\d+)/);

        return match ? match[1] || match[2] || match[3] || match[4] || 'unknown' : 'unknown';
    }

    /**
     * Extracts operating system version from an enhanced call event.
     * Parses user agent string to find OS version information.
     *
     * @private
     * @param event - The enhanced call event to extract OS version from
     * @returns Operating system version string or 'unknown'
     */
    private _extractOSVersion(event: EnhancedCallEvent): string {
        const userAgent = event.technicalContext?.userAgent || '';
        const match = userAgent.match(/Windows NT (\d+\.\d+)|Mac OS X (\d+_\d+)|Android (\d+\.\d+)|OS (\d+_\d+)/);

        return match ? match[1] || match[2] || match[3] || match[4] || 'unknown' : 'unknown';
    }

    /**
     * Extracts device type from an enhanced call event.
     * Analyzes user agent to determine the device category.
     *
     * @private
     * @param event - The enhanced call event to extract device type from
     * @returns Device type (desktop, mobile, or tablet)
     */
    private _extractDeviceType(event: EnhancedCallEvent): 'desktop' | 'mobile' | 'tablet' {
        const userAgent = event.technicalContext?.userAgent || '';

        if (userAgent.includes('iPad') || userAgent.includes('Tablet')) return 'tablet';
        if (userAgent.includes('Mobile') || userAgent.includes('Phone')) return 'mobile';

        return 'desktop';
    }

    /**
     * Extracts build number from an enhanced call event.
     * Attempts to find client build number from event metadata.
     *
     * @private
     * @param event - The enhanced call event to extract build number from
     * @returns Build number string or 'unknown'
     */
    private _extractBuildNumber(event: EnhancedCallEvent): string {
        return event.metadata?.buildNumber || 'unknown';
    }

    /**
     * Extracts platform type from an enhanced call event.
     * Determines the client platform based on user agent analysis.
     *
     * @private
     * @param event - The enhanced call event to extract platform from
     * @returns Platform type (web, electron, or react-native)
     */
    private _extractPlatform(event: EnhancedCallEvent): 'web' | 'electron' | 'react-native' {
        const userAgent = event.technicalContext?.userAgent || '';

        if (userAgent.includes('Electron')) return 'electron';
        if (userAgent.includes('ReactNative')) return 'react-native';

        return 'web';
    }

    /**
     * Extracts region information from an enhanced call event.
     * Attempts to find geographic region from event metadata.
     *
     * @private
     * @param event - The enhanced call event to extract region from
     * @returns Region string or 'unknown'
     */
    private _extractRegion(event: EnhancedCallEvent): string {
        return event.metadata?.region || 'unknown';
    }

    /**
     * Extracts network type from an enhanced call event.
     * Attempts to determine connection type from event metadata.
     *
     * @private
     * @param event - The enhanced call event to extract network type from
     * @returns Network type (4G, 5G, WiFi, or Ethernet)
     */
    private _extractNetworkType(event: EnhancedCallEvent): '4G' | '5G' | 'WiFi' | 'Ethernet' {
        return (event.metadata?.networkType as any) || 'WiFi';
    }

    /**
     * Creates initial quality metrics object for new participants.
     * Initializes all quality metrics to default values.
     *
     * @private
     * @returns Initial quality metrics object with zero values
     */
    private _createInitialQualityMetrics(): any {
        return {
            audioQuality: 0,
            videoQuality: 0,
            packetLoss: 0,
            jitter: 0,
            roundTripTime: 0,
            bandwidth: {
                upload: 0,
                download: 0
            }
        };
    }

    /**
     * Maps call event types to media event types.
     * Converts generic event types to specific media event classifications.
     *
     * @private
     * @param eventType - The call event type to map
     * @returns Mapped media event type
     */
    private _mapEventTypeToMediaEvent(eventType: string): any {
        const mapping: Record<string, string> = {
            screenshare: 'screenshare_start',
            screenshare_start: 'screenshare_start',
            screenshare_stop: 'screenshare_stop',
            mute: 'audio_mute',
            unmute: 'audio_unmute',
            videoEnable: 'video_enable',
            videoDisable: 'video_disable'
        };

        return mapping[eventType] || eventType;
    }

    /**
     * Creates a snapshot of session state for external consumption.
     * Provides a lightweight summary of session state without full data.
     *
     * @private
     * @param sessionState - The session state to create a snapshot of
     * @returns Session snapshot object with summary data
     */
    private _getSessionSnapshot(sessionState: ISessionState): any {
        return {
            sessionId: sessionState.sessionId,
            participantCount: sessionState.participants.size,
            eventCount: sessionState.events.length,
            duration: Date.now() - sessionState.startTime,
            lastActivity: sessionState.lastActivity
        };
    }

    // ============================
    // PRIVATE DATA PROCESSING METHODS
    // ============================

    /**
     * Enhances raw events with additional correlation context.
     * Adds participant information and technical context for better correlation.
     *
     * @private
     * @param rawEvent - The raw call event to enhance
     * @returns Enhanced call event with additional correlation data
     */
    private _enhanceEvent(rawEvent: CallEvent): EnhancedCallEvent {
        return {
            ...rawEvent,
            participant: {
                endpointId: rawEvent.participantId,
                displayName: this._extractDisplayName(rawEvent),
                clientVersion: this._extractClientVersion(rawEvent),
                osType: this._extractOSType(rawEvent),
                browserType: this._extractBrowserType(rawEvent)
            },
            technicalContext: {
                userAgent: rawEvent.metadata?.userAgent || '',
                webrtcStats: rawEvent.metadata?.stats,
                networkConditions: this._extractNetworkConditions(rawEvent)
            }
        };
    }

    /**
     * Gets or creates a session state for the given session ID.
     * Manages active session tracking for correlation.
     *
     * @private
     * @param sessionId - The session ID to get or create state for
     * @returns Session state object for the session
     */
    private _getOrCreateSession(sessionId: string): ISessionState {
        if (!this.activeSessions.has(sessionId)) {
            const newSession: ISessionState = {
                sessionId,
                participants: new Map(),
                events: [],
                startTime: Date.now(),
                lastActivity: Date.now()
            };

            this.activeSessions.set(sessionId, newSession);
            logger.debug(`📝 Created new session: ${sessionId}`);
        }

        const session = this.activeSessions.get(sessionId);

        if (!session) {
            throw new Error(`Session ${sessionId} not found after creation`);
        }

        return session;
    }

    /**
     * Updates participant information in session state.
     * Creates or updates participant records based on event data.
     *
     * @private
     * @param sessionState - The session state to update
     * @param event - The enhanced call event containing participant data
     */
    private _updateParticipant(sessionState: ISessionState, event: EnhancedCallEvent): void {
        const participantId = event.participantId;

        if (!sessionState.participants.has(participantId)) {
            // Create new participant record
            const participant: ParticipantDetails = {
                participantId,
                displayName: event.participant.displayName,
                role: this._extractRole(event),
                endpointId: event.participant.endpointId,
                clientInfo: {
                    type: this._extractClientType(event),
                    browser: event.participant.browserType as any,
                    browserVersion: this._extractBrowserVersion(event),
                    os: event.participant.osType as any,
                    osVersion: this._extractOSVersion(event),
                    deviceType: this._extractDeviceType(event)
                },
                jitsiClient: {
                    version: event.participant.clientVersion,
                    buildNumber: this._extractBuildNumber(event),
                    releaseChannel: 'stable',
                    platform: this._extractPlatform(event)
                },
                connection: {
                    userAgent: event.technicalContext?.userAgent || '',
                    region: this._extractRegion(event),
                    networkType: this._extractNetworkType(event)
                },
                joinTime: event.timestamp,
                mediaEvents: [],
                qualityMetrics: this._createInitialQualityMetrics()
            };

            sessionState.participants.set(participantId, participant);
            logger.debug(`👤 Added participant ${participantId} to session ${sessionState.sessionId}`);
        }

        // Update participant with event data
        const participant = sessionState.participants.get(participantId);

        if (!participant) {
            throw new Error(`Participant ${participantId} not found after creation`);
        }

        this._updateParticipantWithEvent(participant, event);
    }

    /**
     * Updates participant details with data from a specific event.
     * Handles different event types and updates participant state accordingly.
     *
     * @private
     * @param participant - The participant details to update
     * @param event - The enhanced call event containing update data
     */
    private _updateParticipantWithEvent(participant: ParticipantDetails, event: EnhancedCallEvent): void {
        // Update based on event type
        switch (event.eventType) {
        case CallEventType.LEAVE:
            participant.leaveTime = event.timestamp;
            break;

        case CallEventType.SCREENSHARE:
            participant.mediaEvents.push({
                timestamp: event.timestamp,
                type: this._mapEventTypeToMediaEvent(event.eventType),
                participantId: participant.participantId
            });
            break;

        case CallEventType.NETWORK_ISSUE:
        case CallEventType.CONNECTION_ISSUE:
        case CallEventType.MEDIA_INTERRUPTION:
            this._updateQualityMetrics(participant, event);
            break;
        }
    }

    /**
     * Updates participant quality metrics from network events.
     * Extracts network condition data and updates participant quality metrics.
     *
     * @private
     * @param participant - The participant whose metrics to update
     * @param event - The enhanced call event containing network data
     */
    private _updateQualityMetrics(participant: ParticipantDetails, event: EnhancedCallEvent): void {
        const networkConditions = event.technicalContext?.networkConditions;

        if (networkConditions) {
            // Update quality metrics with latest network data
            participant.qualityMetrics = {
                ...participant.qualityMetrics,
                roundTripTime: networkConditions.rtt || participant.qualityMetrics.roundTripTime,
                packetLoss: networkConditions.packetLoss || participant.qualityMetrics.packetLoss,
                jitter: networkConditions.jitter || participant.qualityMetrics.jitter
            };
        }
    }

    // ============================
    // PRIVATE COMPLEX PROCESSING METHODS
    // ============================

    /**
     * Determines if a session should be finalized.
     * Checks if all participants have left or if the session is inactive.
     *
     * @private
     * @param sessionState - The session state to evaluate
     * @returns True if the session should be finalized, false otherwise
     */
    private _shouldFinalizeSession(sessionState: ISessionState): boolean {
        // Check if all participants have left
        const allParticipantsLeft = Array.from(sessionState.participants.values()).every(
            p => p.leaveTime !== undefined
        );

        // Or if session has been inactive for too long
        const isInactive = Date.now() - sessionState.lastActivity > this.sessionTimeout;

        return allParticipantsLeft || isInactive;
    }

    /**
     * Finalizes a session and emits the completed session data.
     * Creates final session metrics and removes from active sessions.
     *
     * @private
     * @param sessionState - The session state to finalize
     */
    private _finalizeSession(sessionState: ISessionState): void {
        logger.info(`🎯 Finalizing session: ${sessionState.sessionId}`);

        sessionState.endTime = Date.now();

        // Create final session object
        const finalSession: CallSession = {
            sessionId: sessionState.sessionId,
            startTime: sessionState.startTime,
            endTime: sessionState.endTime,
            participants: Array.from(sessionState.participants.values()),
            events: sessionState.events,
            metrics: this._calculateAggregatedMetrics(sessionState)
        };

        // Emit finalized session
        this.emit('session_finalized', finalSession);

        // Remove from active sessions
        this.activeSessions.delete(sessionState.sessionId);
    }

    /**
     * Calculates aggregated metrics for a session.
     * Computes session-level statistics from participant and event data.
     *
     * @private
     * @param sessionState - The session state to calculate metrics for
     * @returns Aggregated session metrics object
     */
    private _calculateAggregatedMetrics(sessionState: ISessionState): any {
        const participants = Array.from(sessionState.participants.values());

        return {
            duration: (sessionState.endTime || Date.now()) - sessionState.startTime,
            totalParticipants: participants.length,
            avgAudioQuality: this._calculateAverageAudioQuality(participants),
            avgVideoQuality: this._calculateAverageVideoQuality(participants),
            networkIssues: this._extractNetworkIssues(sessionState.events),
            screenshareDuration: this._calculateScreenshareDuration(sessionState.events),
            dominantSpeakerChanges: this._countDominantSpeakerChanges(sessionState.events)
        };
    }

    /**
     * Calculates average audio quality across all participants.
     * Computes the mean audio quality score for session metrics.
     *
     * @private
     * @param participants - Array of participant details
     * @returns Average audio quality score (0-5)
     */
    private _calculateAverageAudioQuality(participants: ParticipantDetails[]): number {
        const qualities = participants.map(p => p.qualityMetrics.audioQuality).filter(q => q > 0);

        return qualities.length > 0 ? qualities.reduce((a, b) => a + b) / qualities.length : 0;
    }

    /**
     * Calculates average video quality across all participants.
     * Computes the mean video quality score for session metrics.
     *
     * @private
     * @param participants - Array of participant details
     * @returns Average video quality score (0-5)
     */
    private _calculateAverageVideoQuality(participants: ParticipantDetails[]): number {
        const qualities = participants.map(p => p.qualityMetrics.videoQuality).filter(q => q > 0);

        return qualities.length > 0 ? qualities.reduce((a, b) => a + b) / qualities.length : 0;
    }

    /**
     * Extracts network issues from session events.
     * Identifies and formats network-related problems for session metrics.
     *
     * @private
     * @param events - Array of enhanced call events to analyze
     * @returns Array of network issue summaries
     */
    private _extractNetworkIssues(events: EnhancedCallEvent[]): any[] {
        return events
            .filter(e => e.eventType === 'networkIssue')
            .map(e => ({
                timestamp: e.timestamp,
                participantId: e.participantId,
                type: 'connection_issue',
                severity: 'medium',
                details: e.metadata
            }));
    }

    /**
     * Calculates total screenshare duration from session events.
     * Analyzes screenshare start/stop events to compute total duration.
     *
     * @private
     * @param events - Array of enhanced call events to analyze
     * @returns Total screenshare duration in milliseconds
     */
    private _calculateScreenshareDuration(events: EnhancedCallEvent[]): number {
        let totalDuration = 0;
        let screenshareStart: number | null = null;

        for (const event of events.sort((a, b) => a.timestamp - b.timestamp)) {
            if (event.eventType === CallEventType.SCREENSHARE) {
                if (screenshareStart === null) {
                    screenshareStart = event.timestamp;
                } else {
                    // Toggle format: each screenshare event alternates start/stop
                    totalDuration += event.timestamp - screenshareStart;
                    screenshareStart = null;
                }
            }
        }

        // If screenshare is still active at the end, don't count it (incomplete session)
        return totalDuration;
    }

    /**
     * Counts dominant speaker changes in the session.
     * Tallies the number of times the dominant speaker changed.
     *
     * @private
     * @param events - Array of enhanced call events to analyze
     * @returns Number of dominant speaker changes
     */
    private _countDominantSpeakerChanges(_events: EnhancedCallEvent[]): number {
        // Since we removed dominantSpeaker events in favor of dominantSpeakerChanged,
        // return 0 for now. Actual tracking is done through participant mediaEvents.
        return 0;
    }

    /**
     * Cleans up inactive sessions.
     * Removes sessions that have been inactive for too long from active tracking.
     *
     * @private
     */
    private _cleanupInactiveSessions(): void {
        const now = Date.now();
        const sessionsToCleanup: string[] = [];

        for (const [ sessionId, sessionState ] of this.activeSessions.entries()) {
            if (now - sessionState.lastActivity > this.sessionTimeout) {
                sessionsToCleanup.push(sessionId);
            }
        }

        for (const sessionId of sessionsToCleanup) {
            logger.debug(`🧹 Cleaning up inactive session: ${sessionId}`);
            const sessionState = this.activeSessions.get(sessionId);

            if (sessionState) {
                this._finalizeSession(sessionState);
            }
        }
    }

    // ============================
    // PUBLIC METHODS
    // ============================

    /**
     * Processes incoming raw events for correlation.
     * Enhances events with correlation data and manages session state.
     *
     * @param rawEvent - The raw call event to process and correlate
     */
    public processEvent(rawEvent: CallEvent): void {
        try {
            // Enhance the event with correlation data
            const enhancedEvent = this._enhanceEvent(rawEvent);

            // Get or create session state
            const sessionState = this._getOrCreateSession(enhancedEvent.sessionId);

            // Add event to session
            sessionState.events.push(enhancedEvent);
            sessionState.lastActivity = Date.now();

            // Update participant information
            if (enhancedEvent.participantId) {
                this._updateParticipant(sessionState, enhancedEvent);
            }

            // Emit correlation results
            this.emit('event_correlated', {
                sessionId: enhancedEvent.sessionId,
                event: enhancedEvent,
                sessionState: this._getSessionSnapshot(sessionState)
            });

            // Check if session should be finalized
            if (this._shouldFinalizeSession(sessionState)) {
                this._finalizeSession(sessionState);
            }
        } catch (error) {
            logger.error('Error processing event for correlation:', error);
        }
    }

    /**
     * Gets the count of currently active sessions.
     * Returns the number of sessions being actively tracked.
     *
     * @returns Number of active sessions
     */
    public getActiveSessionsCount(): number {
        return this.activeSessions.size;
    }

    /**
     * Gets session state by session ID.
     * Retrieves the current state of a specific session.
     *
     * @param sessionId - The session ID to retrieve state for
     * @returns Session state object or undefined if not found
     */
    public getSessionById(sessionId: string): ISessionState | undefined {
        return this.activeSessions.get(sessionId);
    }

    /**
     * Destroys the correlation engine and cleans up resources.
     * Stops cleanup intervals and clears all active sessions.
     */
    public destroy(): void {
        clearInterval(this.cleanupInterval);
        this.activeSessions.clear();
    }
}
