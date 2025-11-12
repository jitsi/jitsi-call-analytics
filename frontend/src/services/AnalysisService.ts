/**
 * Analysis Service
 * API client for call analysis and timeline data
 */

import axios from 'axios';

import { API_BASE_URL } from '../config/api';
import { ICallSession } from '../types/shared';

export interface ISessionStats {
    backendComponents: {
        jibris: string[];
        jvbs: string[];
        shards: string[];
    };
    meetingDuration: number;
    peakConcurrent: number;
    qualityMetrics: {
        // 0-5 scale
        audioQuality: number;
        // milliseconds
        avgJitter: number;
        // 0-5 scale
        avgPacketLoss: number;
        // percentage
        avgRTT: number;
        // milliseconds
        connectionSuccessRate: number;
        // percentage
        mediaInterruptions: number;
        // 0-5 scale
        networkStability: number;
        overallScore: number;
        // count
        participantDropouts: number;
        // 0-5 scale
        videoQuality: number; // count
    };
    totalUsers: number;
}

export interface IAnalysisResult {
    session: ICallSession;
    stats: ISessionStats;
    timeline: any;
}

export class AnalysisService {
    static async analyzeMeeting(dumpsPath: string): Promise<IAnalysisResult> {
        try {
            // Use dumpsPath parameter to analyze local directory
            const response = await axios.get(
                `${API_BASE_URL}/api/v1/sessions/analyze`,
                {
                    params: {
                        meetingUrl: dumpsPath, // Use as identifier
                        dumpsPath: dumpsPath, // Actual path to analyze
                    },
                },
            );

            if (!response.data.success) {
                throw new Error(response.data.error || 'Analysis failed');
            }

            return response.data.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(
                    error.response?.data?.error?.message
                    || error.response?.data?.error
                    || 'Failed to analyze dumps directory',
                );
            }
            throw error;
        }
    }

    static async analyzeDumpFiles(files: FileList): Promise<IAnalysisResult> {
        try {
            const formData = new FormData();

            // Add all files to form data
            Array.from(files).forEach(file => {
                formData.append('dumps', file);
            });

            const response = await axios.post(
                `${API_BASE_URL}/api/v1/uploads/analyze`,
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    },
                    // Show upload progress
                    onUploadProgress: progressEvent => {
                        if (progressEvent.total) {
                            const percentCompleted = Math.round(
                                (progressEvent.loaded * 100) / progressEvent.total
                            );

                            console.log(`Upload progress: ${percentCompleted}%`);
                        }
                    },
                },
            );

            if (!response.data.success) {
                throw new Error(response.data.error || 'Analysis failed');
            }

            return response.data.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(
                    error.response?.data?.error?.message
                    || error.response?.data?.error
                    || 'Failed to analyze uploaded dumps',
                );
            }
            throw error;
        }
    }

    static async analyzeRTCStatsConference(conferenceId: string, environment: string): Promise<IAnalysisResult> {
        try {
            // Use the /analyze/real endpoint for RTCStats downloaded dumps
            const response = await axios.get(
                `${API_BASE_URL}/api/v1/sessions/analyze/real`,
                {
                    params: {
                        conferenceId, // Pass conferenceId for RTCStats dumps
                        environment, // Pass environment for pilot/prod distinction
                        rtcstatsMode: 'true', // Enable RTCStats mode for downloaded data
                    },
                },
            );

            if (!response.data.success) {
                throw new Error(response.data.error?.message || response.data.error || 'RTCStats analysis failed');
            }

            return response.data.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const errorMessage = error.response?.data?.error?.message
                    || error.response?.data?.error
                    || error.message
                    || 'Failed to analyze RTCStats conference';

                throw new Error(errorMessage);
            }
            throw error;
        }
    }

    static async getSession(sessionId: string): Promise<ICallSession> {
        try {
            const response = await axios.get(
                `${API_BASE_URL}/api/v1/sessions/${sessionId}`,
            );

            if (!response.data.success) {
                throw new Error(response.data.error || 'Session not found');
            }

            return response.data.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(
                    error.response?.data?.error || 'Failed to get session',
                );
            }
            throw error;
        }
    }
}
