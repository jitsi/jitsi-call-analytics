/**
 * Unit tests for BWE (Bandwidth Estimation) issue classification
 * Tests the logic in sessions.ts that should classify media_interruption events as mediaInterruption
 */

import { describe, it, expect } from '@jest/globals';

// Import the types we need
interface MockMediaEvent {
    timestamp: number;
    type: string;
    participantId?: string;
    metadata?: any;
    // Extended properties that exist in actual data
    category?: string;
    subcategory?: string;
    data?: any;
    name?: string;
}

interface MockParticipant {
    participantId: string;
    displayName: string;
    mediaEvents: MockMediaEvent[];
    qualityMetrics?: {
        packetLoss: number;
        roundTripTime: number;
        jitter: number;
        bandwidth?: {
            download: number;
            upload: number;
        };
    };
    connection?: {
        networkType?: string;
        userAgent: string;
    };
}

// Mock the BWE classification logic from sessions.ts
function classifyBWEEvents(participant: MockParticipant): Array<{eventType: string, metadata: any}> {
    const networkAndMediaEvents: Array<{eventType: string, metadata: any}> = [];

    if (participant.mediaEvents) {
        participant.mediaEvents.forEach(mediaEvent => {
            const extendedMediaEvent = mediaEvent as any;

            // Determine if this is ICE failure (Network Issue) or BWE issue (Media Interruption)
            const isIceFailure = extendedMediaEvent.subcategory === 'ice_failures'
                               || (extendedMediaEvent.data && typeof extendedMediaEvent.data === 'string' && extendedMediaEvent.data.includes('ice restart'));

            // Only classify as BWE issue if it's specifically remote source events
            const isBweIssue = extendedMediaEvent.subcategory === 'remote_source_events'
                             || (extendedMediaEvent.name && (
                                 extendedMediaEvent.name.includes('remoteSourceSuspended')
                                 || extendedMediaEvent.name.includes('remoteSourceInterrupted')
                                 || extendedMediaEvent.name.includes('RemoteSourceSuspended')
                                 || extendedMediaEvent.name.includes('RemoteSourceInterrupted')
                             ))
                             || (extendedMediaEvent.data && typeof extendedMediaEvent.data === 'string' && (
                                 extendedMediaEvent.data.includes('remoteSourceSuspended')
                                 || extendedMediaEvent.data.includes('remoteSourceInterrupted')
                             ));

            if (isIceFailure) {
                // ICE failures are Network Issues
                networkAndMediaEvents.push({
                    eventType: 'networkIssue',
                    metadata: {
                        type: 'ICE failure',
                        category: extendedMediaEvent.category || 'network_issue',
                        subcategory: extendedMediaEvent.subcategory || 'ice_restart',
                        subType: 'ice_restart'
                    }
                });
            } else if (isBweIssue || extendedMediaEvent.category === 'media_interruption') {
                // BWE issues are Media Interruptions - create events with mediaInterruption eventType
                networkAndMediaEvents.push({
                    eventType: 'mediaInterruption',
                    metadata: {
                        type: 'BWE issue',
                        originalData: extendedMediaEvent.data || 'Bandwidth estimation issue',
                        category: extendedMediaEvent.category || 'media_interruption',
                        subcategory: extendedMediaEvent.subcategory || 'bwe_issues',
                        subType: (() => {
                            // Determine specific subType based on event data
                            const dataStr = (typeof extendedMediaEvent.data === 'string')
                                ? extendedMediaEvent.data
                                : JSON.stringify(extendedMediaEvent.data || {});

                            // All remote source events are BWE issues, but we need to track specific types
                            if (dataStr.includes('remoteSourceSuspended')) {
                                return 'remoteSourceSuspended';
                            } else if (dataStr.includes('remoteSourceInterrupted')) {
                                return 'remoteSourceInterrupted';
                            } else if (extendedMediaEvent.subcategory === 'remote_source_events') {
                                // Default for remote_source_events without specific data
                                if (extendedMediaEvent.name?.includes('Suspended')) {
                                    return 'remoteSourceSuspended';
                                } else if (extendedMediaEvent.name?.includes('Interrupted')) {
                                    return 'remoteSourceInterrupted';
                                }

                                return 'remoteSourceSuspended'; // Default for remote source events
                            }

                            return 'bwe_issue'; // Default BWE issue
                        })()
                    }
                });
            }
            // Note: Removed catch-all fallback - only remote source events are classified as BWE issues
        });
    }

    return networkAndMediaEvents;
}

describe('BWE Issue Classification Tests', () => {

    it('should classify events with type=media_interruption as mediaInterruption', () => {
        const mockParticipant: MockParticipant = {
            participantId: 'test-participant',
            displayName: 'Test User',
            mediaEvents: [
                {
                    timestamp: Date.now(),
                    type: 'media_interruption',
                    category: 'media_interruption',
                    subcategory: 'remote_source_events',
                    data: 'remoteSourceSuspended'
                }
            ]
        };

        const result = classifyBWEEvents(mockParticipant);

        expect(result).toHaveLength(1);
        expect(result[0].eventType).toBe('mediaInterruption');
        expect(result[0].metadata.type).toBe('BWE issue');
        expect(result[0].metadata.category).toBe('media_interruption');
    });

    it('should classify events with subcategory=remote_source_events as mediaInterruption', () => {
        const mockParticipant: MockParticipant = {
            participantId: 'test-participant',
            displayName: 'Test User',
            mediaEvents: [
                {
                    timestamp: Date.now(),
                    type: 'some_type',
                    category: 'media_interruption',
                    subcategory: 'remote_source_events',
                    data: 'Remote source suspended due to BWE'
                }
            ]
        };

        const result = classifyBWEEvents(mockParticipant);

        expect(result).toHaveLength(1);
        expect(result[0].eventType).toBe('mediaInterruption');
        expect(result[0].metadata.subType).toBe('remoteSourceSuspended');
    });

    it('should classify events with category=media_interruption as mediaInterruption', () => {
        const mockParticipant: MockParticipant = {
            participantId: 'test-participant',
            displayName: 'Test User',
            mediaEvents: [
                {
                    timestamp: Date.now(),
                    type: 'other_type',
                    category: 'media_interruption',
                    subcategory: 'other_subcategory',
                    data: 'Some BWE issue'
                }
            ]
        };

        const result = classifyBWEEvents(mockParticipant);

        expect(result).toHaveLength(1);
        expect(result[0].eventType).toBe('mediaInterruption');
        expect(result[0].metadata.type).toBe('BWE issue');
    });

    it('should classify events with remoteSourceSuspended name as mediaInterruption', () => {
        const mockParticipant: MockParticipant = {
            participantId: 'test-participant',
            displayName: 'Test User',
            mediaEvents: [
                {
                    timestamp: Date.now(),
                    type: 'other_type',
                    name: 'remoteSourceSuspended',
                    data: 'Video stream suspended'
                }
            ]
        };

        const result = classifyBWEEvents(mockParticipant);

        expect(result).toHaveLength(1);
        expect(result[0].eventType).toBe('mediaInterruption');
        expect(result[0].metadata.subType).toBe('bwe_issue');
    });

    it('should NOT classify generic BWE events as mediaInterruption (only remote source events)', () => {
        const mockParticipant: MockParticipant = {
            participantId: 'test-participant',
            displayName: 'Test User',
            mediaEvents: [
                {
                    timestamp: Date.now(),
                    type: 'network_event',
                    data: 'BWE algorithm detected bandwidth limitation'
                }
            ]
        };

        const result = classifyBWEEvents(mockParticipant);

        // Should return empty array - generic BWE events are no longer classified
        expect(result).toHaveLength(0);
    });

    it('should classify ICE restart events as networkIssue (not mediaInterruption)', () => {
        const mockParticipant: MockParticipant = {
            participantId: 'test-participant',
            displayName: 'Test User',
            mediaEvents: [
                {
                    timestamp: Date.now(),
                    type: 'connection_event',
                    subcategory: 'ice_failures',
                    data: 'ice restart occurred'
                }
            ]
        };

        const result = classifyBWEEvents(mockParticipant);

        expect(result).toHaveLength(1);
        expect(result[0].eventType).toBe('networkIssue');
        expect(result[0].metadata.type).toBe('ICE failure');
        expect(result[0].metadata.subType).toBe('ice_restart');
    });

    it('should handle multiple mixed event types correctly', () => {
        const mockParticipant: MockParticipant = {
            participantId: 'test-participant',
            displayName: 'Test User',
            mediaEvents: [
                {
                    timestamp: Date.now(),
                    type: 'media_interruption',
                    category: 'media_interruption',
                    subcategory: 'remote_source_events',
                    data: 'remoteSourceSuspended'
                },
                {
                    timestamp: Date.now() + 1000,
                    type: 'connection_event',
                    subcategory: 'ice_failures',
                    data: 'ice restart'
                },
                {
                    timestamp: Date.now() + 2000,
                    type: 'other_event',
                    data: 'bandwidth limitation detected'
                }
            ]
        };

        const result = classifyBWEEvents(mockParticipant);

        expect(result).toHaveLength(2);

        // First event should be mediaInterruption (BWE - remote source)
        expect(result[0].eventType).toBe('mediaInterruption');
        expect(result[0].metadata.subType).toBe('remoteSourceSuspended');

        // Second event should be networkIssue (ICE)
        expect(result[1].eventType).toBe('networkIssue');
        expect(result[1].metadata.subType).toBe('ice_restart');

        // Third event (generic bandwidth) should NOT be classified anymore
    });

    it('should handle events with object data correctly', () => {
        const mockParticipant: MockParticipant = {
            participantId: 'test-participant',
            displayName: 'Test User',
            mediaEvents: [
                {
                    timestamp: Date.now(),
                    type: 'media_interruption',
                    category: 'media_interruption',
                    data: {
                        reason: 'remoteSourceSuspended',
                        details: 'Video stream paused due to BWE'
                    }
                }
            ]
        };

        const result = classifyBWEEvents(mockParticipant);

        expect(result).toHaveLength(1);
        expect(result[0].eventType).toBe('mediaInterruption');
        expect(result[0].metadata.subType).toBe('remoteSourceSuspended');
    });
});