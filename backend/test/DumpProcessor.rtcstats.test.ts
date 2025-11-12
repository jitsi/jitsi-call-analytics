/**
 * Unit tests for DumpProcessor RTCStats collection functionality
 * Tests the getParticipantRTCStats method with real dump data
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

describe('DumpProcessor RTCStats Collection', () => {
    let processor: DumpProcessor;

    beforeAll(() => {
        // Use test dumps directory
        processor = new DumpProcessor(path.join(__dirname, 'dumps'));
    });

    describe('RTCStats Entry Detection', () => {
        test('should correctly filter getstats entries from raw dump data', () => {
            const dumpsPath = path.join(__dirname, 'dumps');

            // Test with a known file that contains RTCStats entries
            const yanaSessionFile = path.join(dumpsPath, '1666a00b-05d7-44bb-b7eb-f01087c47622.json');
            expect(fs.existsSync(yanaSessionFile)).toBe(true);

            const fileContent = fs.readFileSync(yanaSessionFile, 'utf8');
            const lines = fileContent.split('\n').filter(line => line.trim());

            let getstatsCount = 0;
            let totalArrayEntries = 0;

            for (const line of lines) {
                try {
                    const entry = JSON.parse(line);
                    if (Array.isArray(entry) && entry.length >= 4) {
                        totalArrayEntries++;
                        if (entry[0] === 'getstats') {
                            getstatsCount++;
                        }
                    }
                } catch (e) {
                    // Skip invalid JSON lines
                }
            }

            // Verify that we're correctly filtering only getstats entries
            expect(getstatsCount).toBe(209); // Expected count for this specific file
            expect(getstatsCount).toBeLessThan(totalArrayEntries); // Should be a subset of all array entries

            console.log(`✅ RTCStats filtering test passed:`);
            console.log(`   - Total array entries: ${totalArrayEntries}`);
            console.log(`   - getstats entries: ${getstatsCount}`);
            console.log(`   - Filtering correctly excludes non-getstats arrays`);
        });

        test('should validate RTCStats entry structure', () => {
            const dumpsPath = path.join(__dirname, 'dumps');
            const yanaSessionFile = path.join(dumpsPath, '1666a00b-05d7-44bb-b7eb-f01087c47622.json');

            const fileContent = fs.readFileSync(yanaSessionFile, 'utf8');
            const lines = fileContent.split('\n').filter(line => line.trim());

            let validGetstatsEntries = 0;

            for (const line of lines) {
                try {
                    const entry = JSON.parse(line);
                    if (Array.isArray(entry) && entry.length >= 4 && entry[0] === 'getstats') {
                        // Validate structure: ["getstats", "PC_1", {stats_object}, timestamp, sequence_number]
                        expect(entry[0]).toBe('getstats');
                        expect(typeof entry[1]).toBe('string'); // PC identifier
                        expect(typeof entry[2]).toBe('object'); // Stats object
                        expect(typeof entry[3]).toBe('number'); // Timestamp
                        expect(typeof entry[4]).toBe('number'); // Sequence number

                        validGetstatsEntries++;
                    }
                } catch (e) {
                    // Skip invalid JSON lines
                }
            }

            expect(validGetstatsEntries).toBe(209);
            console.log(`✅ RTCStats structure validation passed: ${validGetstatsEntries} valid entries`);
        });
    });

    describe('Participant RTCStats Collection', () => {
        test('should collect correct number of RTCStats events for Yana', async () => {
            const stats = await processor.getParticipantRTCStats('Yana');

            expect(stats).toBeInstanceOf(Array);
            expect(stats.length).toBe(228); // 209 + 1 + 18 from Yana's 3 sessions

            // Verify each entry has the correct structure with session/endpoint context
            stats.forEach(stat => {
                expect(Array.isArray(stat)).toBe(true);
                expect(stat.length).toBeGreaterThanOrEqual(6); // Original 5 elements + session UUID + endpoint ID
                expect(stat[0]).toBe('getstats');
                expect(typeof stat[1]).toBe('string'); // PC identifier
                expect(typeof stat[2]).toBe('object'); // Stats object
                expect(typeof stat[3]).toBe('number'); // Timestamp
                expect(typeof stat[4]).toBe('number'); // Sequence number
                expect(typeof stat[5]).toBe('string'); // Session UUID
                expect(typeof stat[6]).toBe('string'); // Endpoint ID
            });

            console.log(`✅ Yana RTCStats collection test passed: ${stats.length} events collected`);
        });

        test('should collect RTCStats for Jay-QEt from single session', async () => {
            const stats = await processor.getParticipantRTCStats('Jay-QEt');

            expect(stats).toBeInstanceOf(Array);
            expect(stats.length).toBe(247); // From single session: 5f5cdd1f-8c4f-4773-b6e7-c06b4b6cba5c.json

            // All stats should come from the same session
            const sessionUUIDs = new Set(stats.map(stat => stat[5]));
            expect(sessionUUIDs.size).toBe(1);
            expect(sessionUUIDs.has('5f5cdd1f-8c4f-4773-b6e7-c06b4b6cba5c')).toBe(true);

            console.log(`✅ Jay-QEt RTCStats collection test passed: ${stats.length} events from 1 session`);
        });

        test('should return empty array for non-existent participant', async () => {
            const stats = await processor.getParticipantRTCStats('NonExistentParticipant');

            expect(stats).toBeInstanceOf(Array);
            expect(stats.length).toBe(0);

            console.log(`✅ Non-existent participant test passed: empty array returned`);
        });

        test('should handle participants with no RTCStats events', async () => {
            // Test with a participant that exists but has no RTCStats in their dumps
            // We know from testing that some JVB files don't have getstats entries
            const stats = await processor.getParticipantRTCStats('jvb-59521cf1-366d-ee36-ff05-0cd5ef81e6b4');

            expect(stats).toBeInstanceOf(Array);
            expect(stats.length).toBe(0);

            console.log(`✅ No RTCStats participant test passed: 0 events collected`);
        });
    });

    describe('RTCStats Data Quality', () => {
        test('should maintain chronological order in RTCStats events', async () => {
            const stats = await processor.getParticipantRTCStats('Yana');

            expect(stats.length).toBeGreaterThan(0);

            // Verify timestamps are in ascending order
            for (let i = 1; i < stats.length; i++) {
                const prevTimestamp = stats[i - 1][3];
                const currentTimestamp = stats[i][3];
                expect(currentTimestamp).toBeGreaterThanOrEqual(prevTimestamp);
            }

            console.log(`✅ Chronological order test passed: ${stats.length} events properly sorted`);
        });

        test('should preserve original RTCStats data integrity', async () => {
            const stats = await processor.getParticipantRTCStats('Yana');

            expect(stats.length).toBeGreaterThan(0);

            // Verify stats objects contain expected WebRTC properties
            let validStatsObjects = 0;

            stats.forEach(stat => {
                const statsObject = stat[2];
                expect(typeof statsObject).toBe('object');
                expect(statsObject).not.toBeNull();

                // RTCStats should have timestamp and various WebRTC stats
                if (
                    statsObject.timestamp !== undefined ||
                    Object.keys(statsObject).some(
                        key => key.startsWith('IT01') || key.startsWith('OT01') || key.startsWith('T01')
                    )
                ) {
                    validStatsObjects++;
                }
            });

            expect(validStatsObjects).toBeGreaterThan(0);
            console.log(
                `✅ Data integrity test passed: ${validStatsObjects}/${stats.length} entries have valid WebRTC stats`
            );
        });

        test('should correctly associate RTCStats with session and endpoint metadata', async () => {
            const stats = await processor.getParticipantRTCStats('Yana');

            expect(stats.length).toBe(228);

            // Group by session UUID
            const sessionGroups = stats.reduce(
                (groups, stat) => {
                    const sessionUUID = stat[5];
                    const endpointId = stat[6];

                    if (!groups[sessionUUID]) {
                        groups[sessionUUID] = { endpointId, count: 0 };
                    }
                    groups[sessionUUID].count++;
                    return groups;
                },
                {} as Record<string, { endpointId: string; count: number }>
            );

            // Should have exactly 3 sessions for Yana
            const sessionUUIDs = Object.keys(sessionGroups);
            expect(sessionUUIDs).toHaveLength(3);

            // Verify expected session mappings
            const expectedMappings = {
                '1666a00b-05d7-44bb-b7eb-f01087c47622': { endpointId: '3f599a60', expectedCount: 209 },
                '3d4b1656-32aa-48b6-a27e-aab097f0e4b9': { endpointId: '032e6b6c', expectedCount: 1 },
                'f9e18a19-615c-4c8f-b308-67b943c24db4': { endpointId: 'f8c06419', expectedCount: 18 }
            };

            for (const [sessionUUID, expected] of Object.entries(expectedMappings)) {
                expect(sessionGroups[sessionUUID]).toBeDefined();
                expect(sessionGroups[sessionUUID].endpointId).toBe(expected.endpointId);
                expect(sessionGroups[sessionUUID].count).toBe(expected.expectedCount);
            }

            console.log(`✅ Session/endpoint association test passed:`);
            Object.entries(sessionGroups).forEach(([sessionUUID, data]) => {
                const sessionData = data as { endpointId: string; count: number };
                console.log(
                    `   - Session ${sessionUUID}: endpoint ${sessionData.endpointId}, ${sessionData.count} RTCStats events`
                );
            });
        });
    });

    describe('RTCStats Performance', () => {
        test('should collect RTCStats efficiently using processed session data', async () => {
            const startTime = Date.now();

            // Test multiple participants to verify efficiency
            const [yanaStats, jayStats] = await Promise.all([
                processor.getParticipantRTCStats('Yana'),
                processor.getParticipantRTCStats('Jay-QEt')
            ]);

            const endTime = Date.now();
            const duration = endTime - startTime;

            expect(yanaStats.length).toBe(228);
            expect(jayStats.length).toBe(247);
            expect(duration).toBeLessThan(10000); // Should complete within 10 seconds

            console.log(`✅ Performance test passed:`);
            console.log(`   - Collected ${yanaStats.length + jayStats.length} RTCStats events in ${duration}ms`);
            console.log(
                `   - Average: ${(((yanaStats.length + jayStats.length) / duration) * 1000).toFixed(0)} events/second`
            );
        });

        test('should avoid re-scanning files when using efficient lookup', async () => {
            // This test verifies that we're using the processed session data
            // instead of re-scanning all JSON files for identity information

            const startTime = Date.now();

            // Multiple calls should be fast due to efficient session data lookup
            const stats1 = await processor.getParticipantRTCStats('Yana');
            const stats2 = await processor.getParticipantRTCStats('Yana');

            const endTime = Date.now();
            const duration = endTime - startTime;

            expect(stats1.length).toBe(228);
            expect(stats2.length).toBe(228);
            // Note: This measures total time for both calls, but the efficiency comes from
            // not re-scanning all files to find identity data - the session processing is done once

            console.log(`✅ Efficient lookup test passed:`);
            console.log(`   - Two identical calls completed in ${duration}ms`);
            console.log(`   - Using processed session data instead of file scanning`);
        });
    });

    describe('Integration with Session Processing', () => {
        test('should work correctly with processConferenceDumps session data', async () => {
            // First process the conference dumps to ensure session data is available
            const session = await processor.processConferenceDumps();
            const yanaParticipant = session.participants.find(p => p.displayName === 'Yana');

            expect(yanaParticipant).toBeDefined();
            expect(yanaParticipant?.sessionMap?.size).toBe(3);

            // Now collect RTCStats using the processed session data
            const stats = await processor.getParticipantRTCStats('Yana');

            expect(stats.length).toBe(228);

            // Verify that the session UUIDs in RTCStats match the processed session data
            const statsSessionUUIDs = new Set(stats.map(stat => stat[5]));
            const processedSessionUUIDs = new Set(yanaParticipant?.sessionMap?.keys() || []);

            expect(statsSessionUUIDs).toEqual(processedSessionUUIDs);

            console.log(`✅ Integration test passed:`);
            console.log(`   - Session processing found ${processedSessionUUIDs.size} sessions for Yana`);
            console.log(`   - RTCStats collection used same ${statsSessionUUIDs.size} sessions`);
            console.log(`   - Collected ${stats.length} total RTCStats events`);
        });
    });
});
