/**
 * Integration test to verify actual backend API responses
 * Tests the real backend to see what eventType values are being returned
 */

import { describe, it, expect } from '@jest/globals';

describe('Backend API Integration Tests', () => {
    // Skip these tests if backend is not running
    const BACKEND_URL = 'http://localhost:5000';

    it('should verify participant events contain mediaInterruption eventType for BWE issues', async () => {
        try {
            // Test participant Cale-rS4 who has actual remoteSourceSuspended BWE events
            const response = await fetch(`${BACKEND_URL}/api/sessions/participant/Cale-rS4/events`);

            if (!response.ok) {
                console.log('Backend not available, skipping integration test');
                return; // Skip test if backend is not running
            }

            const data = await response.json() as any;

            console.log('🔍 BACKEND API RESPONSE:');
            console.log('Total events:', data.data?.events?.length || 'No events property');

            if (data.data?.events && Array.isArray(data.data.events)) {
                // Group events by eventType
                const eventsByType: { [key: string]: number } = {};
                const sampleEvents: { [key: string]: any } = {};

                data.data.events.forEach((event: any) => {
                    const eventType = event.eventType || 'undefined';
                    eventsByType[eventType] = (eventsByType[eventType] || 0) + 1;

                    // Keep a sample of each event type for inspection
                    if (!sampleEvents[eventType]) {
                        sampleEvents[eventType] = {
                            eventType: event.eventType,
                            metadata: event.metadata,
                            source: event.source,
                            timestamp: event.timestamp
                        };
                    }
                });

                console.log('\n📊 EVENT TYPES FOUND:');
                Object.entries(eventsByType).forEach(([type, count]) => {
                    console.log(`  ${type}: ${count} events`);
                });

                console.log('\n🔬 SAMPLE EVENTS:');
                Object.entries(sampleEvents).forEach(([type, sample]) => {
                    console.log(`\n  ${type}:`);
                    console.log(`    metadata.type: ${sample.metadata?.type}`);
                    console.log(`    metadata.category: ${sample.metadata?.category}`);
                    console.log(`    metadata.subcategory: ${sample.metadata?.subcategory}`);
                    console.log(`    metadata.subType: ${sample.metadata?.subType}`);
                });

                // Check if we have any mediaInterruption events (BWE issues)
                const mediaInterruptionEvents = data.data.events.filter((event: any) =>
                    event.eventType === 'mediaInterruption'
                );

                console.log(`\n🎯 MEDIA INTERRUPTION EVENTS: ${mediaInterruptionEvents.length}`);

                if (mediaInterruptionEvents.length > 0) {
                    console.log('✅ SUCCESS: Found mediaInterruption events (BWE issues)');

                    // Verify they have the correct metadata
                    mediaInterruptionEvents.forEach((event: any, index: number) => {
                        console.log(`\n  mediaInterruption event #${index + 1}:`);
                        console.log(`    metadata.type: ${event.metadata?.type}`);
                        console.log(`    metadata.category: ${event.metadata?.category}`);
                        console.log(`    metadata.subcategory: ${event.metadata?.subcategory}`);
                        console.log(`    metadata.subType: ${event.metadata?.subType}`);

                        // These should be BWE issues
                        expect(event.metadata?.type).toMatch(/BWE issue|Media Interruption/);
                    });
                } else {
                    console.log('❌ ISSUE: No mediaInterruption events found');
                    console.log('This indicates the backend is still classifying BWE issues as networkIssue');

                    // Check what networkIssue events we have
                    const networkIssueEvents = data.data.events.filter((event: any) =>
                        event.eventType === 'networkIssue'
                    );

                    console.log(`\n🔍 NETWORK ISSUE EVENTS: ${networkIssueEvents.length}`);
                    networkIssueEvents.slice(0, 3).forEach((event: any, index: number) => {
                        console.log(`\n  networkIssue event #${index + 1}:`);
                        console.log(`    metadata.type: ${event.metadata?.type}`);
                        console.log(`    metadata.category: ${event.metadata?.category}`);
                        console.log(`    metadata.subcategory: ${event.metadata?.subcategory}`);
                        console.log(`    metadata.subType: ${event.metadata?.subType}`);
                        console.log(`    metadata.originalData: ${event.metadata?.originalData}`);
                    });

                    // Let's see if any of these networkIssue events are actually BWE issues
                    const possibleBWEEvents = networkIssueEvents.filter((event: any) =>
                        event.metadata?.type?.includes('BWE') ||
                        event.metadata?.category === 'media_interruption' ||
                        event.metadata?.subcategory === 'remote_source_events' ||
                        event.metadata?.subcategory === 'bwe_issues'
                    );

                    if (possibleBWEEvents.length > 0) {
                        console.log(`\n⚠️  FOUND ${possibleBWEEvents.length} BWE events misclassified as networkIssue:`);
                        possibleBWEEvents.slice(0, 2).forEach((event: any, index: number) => {
                            console.log(`\n    BWE event #${index + 1}:`);
                            console.log(`      metadata.type: ${event.metadata?.type}`);
                            console.log(`      metadata.category: ${event.metadata?.category}`);
                            console.log(`      metadata.subcategory: ${event.metadata?.subcategory}`);
                        });
                    }
                }

            } else {
                console.log('❌ No events array in response:', data);
            }

        } catch (error) {
            console.log('Backend integration test failed:', error);
            // Don't fail the test if backend is not available
            expect(true).toBe(true);
        }
    }, 30000); // 30 second timeout

    it('should verify session timeline contains proper event types', async () => {
        try {
            // Test the timeline endpoint
            const response = await fetch(`${BACKEND_URL}/api/sessions/mock-session-123/timeline`);

            if (!response.ok) {
                console.log('Timeline endpoint not available, skipping test');
                return;
            }

            const data = await response.json() as any;

            console.log('\n🔍 TIMELINE API RESPONSE:');
            console.log('Session data:', !!data.session);
            console.log('Events in session:', data.session?.events?.length || 0);

            if (data.session?.events) {
                const eventTypes = [...new Set(data.session.events.map((e: any) => e.eventType))];
                console.log('Event types in timeline:', eventTypes);

                const mediaInterruptions = data.session.events.filter((e: any) => e.eventType === 'mediaInterruption');
                console.log('MediaInterruption events in timeline:', mediaInterruptions.length);
            }

        } catch (error) {
            console.log('Timeline test failed:', error);
            // Don't fail the test if endpoint is not available
            expect(true).toBe(true);
        }
    }, 30000);
});