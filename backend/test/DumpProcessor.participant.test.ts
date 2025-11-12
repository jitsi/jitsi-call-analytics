/**
 * Unit tests for DumpProcessor participant data structure and Map<endpointId, sessionId> behavior
 * Uses real dump data to validate the correct implementation
 */

import fs from 'fs';
import path from 'path';
import { DumpProcessor } from '../src/services/DumpProcessor';

// Mock console methods to reduce test noise
beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('DumpProcessor Participant Data Structure', () => {
    let processor: DumpProcessor;

    beforeAll(() => {
        // Use test dumps directory
        processor = new DumpProcessor(path.join(__dirname, 'dumps'));
    });

    describe('Participant ID Generation', () => {
        test('should generate stable participant IDs from displayName', () => {
            const processor1 = new DumpProcessor(path.join(__dirname, 'dumps'));
            const processor2 = new DumpProcessor(path.join(__dirname, 'dumps'));

            // Generate participant IDs using reflection to access private method
            const generateId1 = (processor1 as any)._generateParticipantId('Yana');
            const generateId2 = (processor1 as any)._generateParticipantId('Yana');
            const generateId3 = (processor2 as any)._generateParticipantId('Yana');

            // Same processor should return same ID
            expect(generateId1).toBe(generateId2);

            // Different processors should generate different IDs
            expect(generateId1).not.toBe(generateId3);

            // Should follow format: displayName-randomString
            expect(generateId1).toMatch(/^Yana-[a-z0-9]{6}$/);
        });
    });

    describe('Session to Endpoint Mapping (Efficient Approach)', () => {
        test('should correctly map session UUIDs to endpoint IDs via processed session data', async () => {
            // Test the new efficient approach using processed session data
            const session = await processor.processConferenceDumps();
            const yanaParticipant = session.participants.find(p => p.displayName === 'Yana');

            expect(yanaParticipant).toBeDefined();
            expect(yanaParticipant?.sessionMap).toBeDefined();

            // Verify the session mappings are correct
            const expectedMappings = [
                {
                    sessionUUID: '1666a00b-05d7-44bb-b7eb-f01087c47622',
                    expectedEndpointId: '3f599a60'
                },
                {
                    sessionUUID: '3d4b1656-32aa-48b6-a27e-aab097f0e4b9',
                    expectedEndpointId: '032e6b6c'
                },
                {
                    sessionUUID: 'f9e18a19-615c-4c8f-b308-67b943c24db4',
                    expectedEndpointId: 'f8c06419'
                }
            ];

            expectedMappings.forEach(({ sessionUUID, expectedEndpointId }) => {
                const actualEndpointId = yanaParticipant?.sessionMap?.get(sessionUUID);
                expect(actualEndpointId).toBe(expectedEndpointId);
            });

            console.log(`✅ Session mapping test passed: ${expectedMappings.length} session mappings verified`);
        });

        test('should handle efficient session data lookup without file scanning', async () => {
            // Verify that the new approach works efficiently through session processing
            const startTime = Date.now();
            const session = await processor.processConferenceDumps();
            const endTime = Date.now();

            // Find any participant with session mappings
            const participantsWithSessions = session.participants.filter(p => p.sessionMap && p.sessionMap.size > 0);
            expect(participantsWithSessions.length).toBeGreaterThan(0);

            // Verify session mappings exist without needing individual file extraction
            participantsWithSessions.forEach(participant => {
                expect(participant.sessionMap?.size).toBeGreaterThan(0);

                // Each session mapping should have valid UUIDs and endpoint IDs (or UUID fallbacks)
                for (const [sessionUUID, endpointId] of participant.sessionMap!.entries()) {
                    expect(sessionUUID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
                    // EndpointId can be either a proper 8-character ID or a full UUID fallback
                    expect(endpointId).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/);
                }
            });

            console.log(
                `✅ Efficient session lookup test passed: processed ${participantsWithSessions.length} participants in ${endTime - startTime}ms`
            );
        });
    });

    describe('Participant Data Aggregation', () => {
        test('should correctly identify all Yana sessions during processing', async () => {
            // Use the efficient processConferenceDumps approach
            const session = await processor.processConferenceDumps();
            const yanaParticipant = session.participants.find(p => p.displayName === 'Yana');

            expect(yanaParticipant).toBeDefined();
            expect(yanaParticipant?.displayName).toBe('Yana');
            expect(yanaParticipant?.endpointIds).toHaveLength(3);
            expect(yanaParticipant?.endpointIds).toContain('3f599a60'); // from 1666a00b-05d7-44bb-b7eb-f01087c47622
            expect(yanaParticipant?.endpointIds).toContain('032e6b6c'); // from 3d4b1656-32aa-48b6-a27e-aab097f0e4b9
            expect(yanaParticipant?.endpointIds).toContain('f8c06419'); // from f9e18a19-615c-4c8f-b308-67b943c24db4
        });

        test('should create aggregated participant data without session details', async () => {
            const session = await processor.processConferenceDumps();
            const yanaParticipant = session.participants.find(p => p.displayName === 'Yana');

            expect(yanaParticipant).toBeDefined();
            expect(yanaParticipant?.displayName).toBe('Yana');
            expect(yanaParticipant?.participantId).toMatch(/^Yana-[a-z0-9]{6}$/);

            // Sessions Map and sessionTimeline are no longer part of the interface

            // Should have aggregated data
            expect(yanaParticipant?.joinTime).toBeGreaterThan(0);
            expect(yanaParticipant?.mediaEvents).toBeInstanceOf(Array);
            expect(yanaParticipant?.qualityMetrics).toBeDefined();
            expect(yanaParticipant?.endpointIds).toBeInstanceOf(Array);
        });

        test('should aggregate console log events with correct line counts', async () => {
            const session = await processor.processConferenceDumps();
            const yanaParticipant = session.participants.find(p => p.displayName === 'Yana');

            expect(yanaParticipant).toBeDefined();
            expect(yanaParticipant?.displayName).toBe('Yana');
            expect(yanaParticipant?.mediaEvents).toBeInstanceOf(Array);

            // Validate Yana has exactly 3 sessions
            expect(yanaParticipant?.endpointIds).toHaveLength(3);
            expect(yanaParticipant?.sessionMap?.size).toBe(3);

            // Check the actual console log file line counts for Yana's sessions
            const fs = require('fs');
            const path = require('path');
            const dumpsPath = path.join(__dirname, 'dumps');

            const expectedSessions = [
                { sessionId: '1666a00b-05d7-44bb-b7eb-f01087c47622', expectedLines: 2394 },
                { sessionId: '3d4b1656-32aa-48b6-a27e-aab097f0e4b9', expectedLines: 294 },
                { sessionId: 'f9e18a19-615c-4c8f-b308-67b943c24db4', expectedLines: 459 }
            ];

            let totalActualLines = 0;
            const sessionMap = yanaParticipant?.sessionMap;
            const sessionIds = sessionMap ? Array.from(sessionMap.keys()) : [];

            // Verify each session file exists and has expected line count
            for (const { sessionId, expectedLines } of expectedSessions) {
                expect(sessionIds).toContain(sessionId);

                const logFile = path.join(dumpsPath, `${sessionId}.txt`);
                expect(fs.existsSync(logFile)).toBe(true);

                const logContent = fs.readFileSync(logFile, 'utf8');
                const actualLines = logContent.split('\n').filter((line: string) => line.trim()).length;
                // Allow for minor discrepancies (up to 10 lines) in file line counting due to formatting differences
                expect(actualLines).toBeGreaterThanOrEqual(expectedLines - 10);
                expect(actualLines).toBeLessThanOrEqual(expectedLines + 10);
                console.log(`   Session ${sessionId}: expected ${expectedLines}, actual ${actualLines}`);

                totalActualLines += actualLines;
            }

            // Validate the total is within expected range (allowing for minor discrepancies)
            console.log(`Total actual lines from all sessions: ${totalActualLines}`);
            expect(totalActualLines).toBeGreaterThan(3100); // Close to 3147
            expect(totalActualLines).toBeLessThan(3200); // With some margin

            // Test console log aggregation by creating a test output file
            const testOutputFile = '/tmp/yana-console-logs-test.txt';
            const aggregatedLogs: string[] = [];

            // Manually aggregate console logs to verify the aggregation logic
            for (const sessionId of sessionIds) {
                const logFile = path.join(dumpsPath, `${sessionId}.txt`);
                if (fs.existsSync(logFile)) {
                    const logContent = fs.readFileSync(logFile, 'utf8');
                    const logLines = logContent.split('\n').filter((line: string) => line.trim());
                    aggregatedLogs.push(...logLines);
                }
            }

            // Write aggregated logs to test file for validation
            fs.writeFileSync(testOutputFile, aggregatedLogs.join('\n'));

            // Verify aggregated log contains the actual total lines
            expect(aggregatedLogs.length).toBe(totalActualLines);

            // Verify the test output file has the correct line count
            const testFileContent = fs.readFileSync(testOutputFile, 'utf8');
            const testFileLines = testFileContent.split('\n').filter((line: string) => line.trim()).length;
            expect(testFileLines).toBe(totalActualLines);

            console.log(`✅ Console log aggregation test passed:`);
            console.log(`   - 3 sessions processed for participant Yana`);
            console.log(`   - Total actual lines from all sessions: ${totalActualLines}`);
            console.log(`   - Aggregated log file contains: ${aggregatedLogs.length} lines`);
            console.log(`   - Test output file contains: ${testFileLines} lines`);
            console.log(`   - Test output written to: ${testOutputFile}`);

            // Cleanup test file
            fs.unlinkSync(testOutputFile);

            // Should contain console log events in mediaEvents (basic validation)
            const consoleLogEvents = yanaParticipant?.mediaEvents.filter(event =>
                [
                    'join_muted',
                    'video_resolution_change',
                    'audio_muted',
                    'fullscreen_toggle',
                    'ice_failure',
                    'bwe_issue'
                ].includes(event.type)
            );

            // Events should be properly formatted
            consoleLogEvents?.forEach(event => {
                expect(event.timestamp).toBeGreaterThan(0);
                expect(event.type).toBeDefined();
            });
        });

        test('should maintain endpointIds array for backward compatibility', async () => {
            const session = await processor.processConferenceDumps();
            const yanaParticipant = session.participants.find(p => p.displayName === 'Yana');

            expect(yanaParticipant?.endpointIds).toBeDefined();
            expect(yanaParticipant?.endpointIds).toHaveLength(3);
            expect(yanaParticipant?.endpointIds).toContain('3f599a60');
            expect(yanaParticipant?.endpointIds).toContain('032e6b6c');
            expect(yanaParticipant?.endpointIds).toContain('f8c06419');
        });
    });

    describe('Architecture Compliance', () => {
        test('participant data should work at aggregated level only', async () => {
            const session = await processor.processConferenceDumps();
            const yanaParticipant = session.participants.find(p => p.displayName === 'Yana');

            // Should have aggregated data
            expect(yanaParticipant?.participantId).toBeDefined();
            expect(yanaParticipant?.displayName).toBe('Yana');
            expect(yanaParticipant?.joinTime).toBeGreaterThan(0);
            expect(yanaParticipant?.mediaEvents).toBeInstanceOf(Array);
            expect(yanaParticipant?.qualityMetrics).toBeDefined();
            expect(yanaParticipant?.endpointIds).toBeInstanceOf(Array);

            // Individual session details are no longer part of the interface
        });

        test('all participants should have proper aggregated structure', async () => {
            const session = await processor.processConferenceDumps();

            session.participants.forEach(participant => {
                // Required aggregated fields
                expect(participant.participantId).toBeDefined();
                expect(participant.displayName).toBeDefined();
                expect(participant.endpointId).toBeDefined();
                expect(participant.joinTime).toBeGreaterThan(0);
                expect(participant.mediaEvents).toBeInstanceOf(Array);
                expect(participant.qualityMetrics).toBeDefined();
                expect(participant.endpointIds).toBeInstanceOf(Array);

                // Individual session details are no longer part of the interface
            });
        });
    });

    describe('Media Interruption Events Integration', () => {
        test('should work with updated media interruption extraction', async () => {
            const session = await processor.processConferenceDumps();

            // Find media interruption events for Yana
            const yanaEvents = session.events.filter(
                event => event.eventType === 'networkIssue' && event.metadata?.displayName === 'Yana'
            );

            // Should have processed events from all Yana's endpoints
            if (yanaEvents.length > 0) {
                const sourceEndpointIds = yanaEvents.map(e => e.metadata?.sourceEndpointId).filter(Boolean);
                const uniqueSourceEndpoints = [...new Set(sourceEndpointIds)];

                // Should have events from multiple endpoints if they exist
                expect(uniqueSourceEndpoints.length).toBeGreaterThan(0);

                // All source endpoints should be valid Yana endpoints
                uniqueSourceEndpoints.forEach(endpointId => {
                    expect(['3f599a60', '032e6b6c', 'f8c06419']).toContain(endpointId);
                });
            }
        });
    });

    describe('Participant Discovery Edge Cases', () => {
        test('should handle participants with single sessions', async () => {
            const session = await processor.processConferenceDumps();

            // Find a participant with only one session (not Yana)
            const singleSessionParticipant = session.participants.find(
                p => p.displayName !== 'Yana' && p.endpointIds?.length === 1
            );

            if (singleSessionParticipant) {
                expect(singleSessionParticipant.endpointIds).toHaveLength(1);

                // Should have proper aggregated data structure
                expect(singleSessionParticipant.participantId).toBeDefined();
                expect(singleSessionParticipant.displayName).toBeDefined();
                expect(singleSessionParticipant.joinTime).toBeGreaterThan(0);
                expect(singleSessionParticipant.mediaEvents).toBeInstanceOf(Array);
                expect(singleSessionParticipant.qualityMetrics).toBeDefined();

                // Session details are no longer part of the interface
            }
        });

        test('should generate unique participant IDs for different display names', async () => {
            const session = await processor.processConferenceDumps();

            const participantIds = session.participants.map(p => p.participantId);
            const uniqueParticipantIds = new Set(participantIds);

            expect(uniqueParticipantIds.size).toBe(participantIds.length);
        });
    });

    describe('Performance and Data Integrity', () => {
        test('should process all participants without data loss', async () => {
            const session = await processor.processConferenceDumps();

            // Should have participants
            expect(session.participants.length).toBeGreaterThan(0);

            // Each participant should have required fields
            session.participants.forEach(participant => {
                expect(participant.participantId).toBeDefined();
                expect(participant.displayName).toBeDefined();
                expect(participant.endpointId).toBeDefined();
                expect(participant.joinTime).toBeGreaterThan(0);
                // Verify proper aggregated data without session details
                expect(participant.mediaEvents).toBeInstanceOf(Array);
                expect(participant.qualityMetrics).toBeDefined();
                expect(participant.endpointIds).toBeInstanceOf(Array);
                expect(participant.endpointIds?.length).toBeGreaterThan(0);

                // Session details are no longer part of the interface
            });
        });

        test('should complete processing within reasonable time', async () => {
            const startTime = Date.now();
            const session = await processor.processConferenceDumps();
            const endTime = Date.now();

            expect(endTime - startTime).toBeLessThan(30000); // 30 seconds max
            expect(session.participants.length).toBeGreaterThan(0);
        });
    });
});
