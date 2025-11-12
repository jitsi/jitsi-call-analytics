/**
 * Unit tests for DumpProcessor event processing functionality
 * Tests dominantSpeakerChanged and screenshareToggled event processing
 */

import fs from 'fs';
import path from 'path';
import { DumpProcessor } from '../src/services/DumpProcessor';
import { ParticipantDetails, MediaEvent, CallEvent } from '../../shared/types';

// Mock console methods to reduce test noise
beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('DumpProcessor Event Processing', () => {
    let processor: DumpProcessor;
    let testDumpDir: string;

    beforeAll(() => {
        // Use test dumps directory
        testDumpDir = path.join(__dirname, 'dumps');
        processor = new DumpProcessor(testDumpDir);
    });

    describe('screenshareToggled Event Simulation', () => {
        test('should create test dump file with screenshareToggled events and process them', async () => {
            // Create a temporary test dump file with screenshareToggled events
            const testSessionUuid = 'test-screenshare-session';
            const testDumpFile = path.join(testDumpDir, `${testSessionUuid}.json`);

            // Create mock RTCStats entries with screenshareToggled events
            const mockRTCStatsData = [
                // Connection info (required for participants)
                ['connectionInfo', 'conn123', {
                    clientType: 'web',
                    path: '/xmpp-websocket',
                    statsSessionId: 'test-session-123',
                    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0'
                }, 1758551499000, 0],

                // Identity events
                ['identity', 'conn123', { displayName: 'TestUser', endpointId: 'endpoint123' }, 1758551500000, 1],
                ['identity', 'conn123', { applicationName: 'Jitsi Meet' }, 1758551501000, 2],

                // Screenshare events
                ['screenshareToggled', 'conn123', false, 1758551600000, 10], // screenshare started
                ['screenshareToggled', 'conn123', true, 1758551700000, 20],  // screenshare stopped
                ['screenshareToggled', 'conn123', false, 1758551800000, 30], // screenshare started again
                ['screenshareToggled', 'conn123', true, 1758551900000, 40]   // screenshare stopped again
            ];

            // Write test data as NDJSON
            const ndjsonData = mockRTCStatsData.map(entry => JSON.stringify(entry)).join('\n');
            fs.writeFileSync(testDumpFile, ndjsonData);

            try {
                // Process the dump file
                const session = await processor.processConferenceDumps();

                expect(session).toBeDefined();
                expect(session.events).toBeDefined();
                expect(session.participants).toBeDefined();

                // Check that screenshare events were processed
                const events = session.events;
                const screenshareEvents = events.filter((e: CallEvent) => e.eventType === 'screenshare');

                expect(screenshareEvents.length).toBeGreaterThan(0);

                // Check for screenshare start and stop events
                const screenshareStartEvents = screenshareEvents.filter((e: CallEvent) =>
                    e.metadata && e.metadata.type === 'screenshare_start'
                );
                const screenshareStopEvents = screenshareEvents.filter((e: CallEvent) =>
                    e.metadata && e.metadata.type === 'screenshare_stop'
                );

                expect(screenshareStartEvents.length).toBe(2);
                expect(screenshareStopEvents.length).toBe(2);

                // Check timestamps match our test data
                expect(screenshareStartEvents[0].timestamp).toBe(1758551600000);
                expect(screenshareStopEvents[0].timestamp).toBe(1758551700000);
                expect(screenshareStartEvents[1].timestamp).toBe(1758551800000);
                expect(screenshareStopEvents[1].timestamp).toBe(1758551900000);

            } finally {
                // Clean up test file
                if (fs.existsSync(testDumpFile)) {
                    fs.unlinkSync(testDumpFile);
                }
            }
        });

        test('should create MediaEvent entries for screenshare in participant details', async () => {
            // Create test dump with screenshare events
            const testSessionUuid = 'test-screenshare-media';
            const testDumpFile = path.join(testDumpDir, `${testSessionUuid}.json`);

            const mockRTCStatsData = [
                // Connection info (required for participants)
                ['connectionInfo', 'conn456', {
                    clientType: 'web',
                    path: '/xmpp-websocket',
                    statsSessionId: 'test-session-456',
                    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0'
                }, 1758551499000, 0],

                ['identity', 'conn456', { displayName: 'MediaTestUser', endpointId: 'mediaEndpoint456' }, 1758551500000, 1],
                ['identity', 'conn456', { applicationName: 'Jitsi Meet' }, 1758551501000, 2],
                ['screenshareToggled', 'conn456', false, 1758551650000, 15], // screenshare started
                ['screenshareToggled', 'conn456', true, 1758551750000, 25]   // screenshare stopped
            ];

            const ndjsonData = mockRTCStatsData.map(entry => JSON.stringify(entry)).join('\n');
            fs.writeFileSync(testDumpFile, ndjsonData);

            try {
                const session = await processor.processConferenceDumps();

                expect(session).toBeDefined();

                // Find the participant
                const participants = session.participants;
                const testParticipant = participants.find((p: ParticipantDetails) =>
                    p.displayName === 'MediaTestUser'
                );

                expect(testParticipant).toBeDefined();
                expect(testParticipant!.mediaEvents).toBeDefined();

                // Check for screenshare media events
                const screenshareMediaEvents = testParticipant!.mediaEvents.filter((e: MediaEvent) =>
                    e.type === 'screenshare_start' || e.type === 'screenshare_stop'
                );

                expect(screenshareMediaEvents.length).toBe(2);

                const startEvent = screenshareMediaEvents.find((e: MediaEvent) => e.type === 'screenshare_start');
                const stopEvent = screenshareMediaEvents.find((e: MediaEvent) => e.type === 'screenshare_stop');

                expect(startEvent).toBeDefined();
                expect(startEvent!.timestamp).toBe(1758551650000);
                expect(startEvent!.participantId).toBe(testParticipant!.participantId);

                expect(stopEvent).toBeDefined();
                expect(stopEvent!.timestamp).toBe(1758551750000);
                expect(stopEvent!.participantId).toBe(testParticipant!.participantId);

            } finally {
                if (fs.existsSync(testDumpFile)) {
                    fs.unlinkSync(testDumpFile);
                }
            }
        });
    });

    // Note: dominantSpeakerChanged events are not present in current dump files
    // These tests will be added when dominantSpeakerChanged events are available in the data

    describe('Event Integration', () => {
        test('should process both screenshare and dominant speaker events together', async () => {
            const testSessionUuid = 'integration-test-session';
            const testDumpFile = path.join(testDumpDir, `${testSessionUuid}.json`);

            const mockData = [
                // Connection info (required for participants)
                ['connectionInfo', 'intConn', {
                    clientType: 'web',
                    path: '/xmpp-websocket',
                    statsSessionId: 'integration-session',
                    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0'
                }, 1758551499000, 0],

                // Identity
                ['identity', 'intConn', { displayName: 'IntegrationUser', endpointId: 'intEndpoint' }, 1758551500000, 1],
                ['identity', 'intConn', { applicationName: 'Jitsi Meet' }, 1758551501000, 2],

                // Dominant speaker first
                ['dominantSpeakerChanged', 'intConn', {}, 1758551600000, 10],

                // Then screenshare
                ['screenshareToggled', 'intConn', false, 1758551650000, 15], // start
                ['screenshareToggled', 'intConn', true, 1758551750000, 20],  // stop

                // Another dominant speaker change
                ['dominantSpeakerChanged', 'intConn', {}, 1758551800000, 25]
            ];

            fs.writeFileSync(testDumpFile, mockData.map(entry => JSON.stringify(entry)).join('\n'));

            try {
                const session = await processor.processConferenceDumps();

                expect(session).toBeDefined();

                const participants = session.participants;
                const user = participants.find((p: ParticipantDetails) =>
                    p.displayName === 'IntegrationUser'
                );

                expect(user).toBeDefined();
                expect(user!.mediaEvents).toBeDefined();

                // Check for both types of events
                const dominantEvents = user!.mediaEvents.filter((e: MediaEvent) =>
                    e.type === 'dominant_speaker_start' || e.type === 'dominant_speaker_stop'
                );
                const screenshareEvents = user!.mediaEvents.filter((e: MediaEvent) =>
                    e.type === 'screenshare_start' || e.type === 'screenshare_stop'
                );

                expect(dominantEvents.length).toBeGreaterThanOrEqual(1);
                expect(screenshareEvents.length).toBe(2); // start and stop

                // Check timestamps are preserved
                const screenshareStart = screenshareEvents.find((e: MediaEvent) => e.type === 'screenshare_start');
                const screenshareStop = screenshareEvents.find((e: MediaEvent) => e.type === 'screenshare_stop');

                expect(screenshareStart!.timestamp).toBe(1758551650000);
                expect(screenshareStop!.timestamp).toBe(1758551750000);

            } finally {
                if (fs.existsSync(testDumpFile)) {
                    fs.unlinkSync(testDumpFile);
                }
            }
        });
    });
});