/**
 * RTCStats Service
 * API client for RTCStats CLI integration
 */

import axios from 'axios';

import { API_BASE_URL } from '../config/api';
import {
    IConferenceSearchResult,
    IDownloadStatus,
    IRTCStatsDownloadResponse,
    IRTCStatsSearchResponse,
    RTCStatsEnvironment
} from '../types/rtcstats';

// Re-export for convenience
export type {
    IConferenceSearchResult as ConferenceSearchResult,
    IDownloadStatus as DownloadStatus,
    IRTCStatsDownloadResponse as RTCStatsDownloadResponse,
    IRTCStatsSearchResponse as RTCStatsSearchResponse
};
export { RTCStatsEnvironment };

export class RTCStatsService {
    private static apiClient = axios.create({
        baseURL: `${API_BASE_URL}/api/v1/rtcstats`,
        timeout: 30000, // 30 seconds for searches
    });

    /**
     * Search for conferences in RTCStats
     */
    static async searchConferences(
            searchPattern: string,
            environment: RTCStatsEnvironment = RTCStatsEnvironment.PROD,
            startDate?: Date,
            endDate?: Date
    ): Promise<IRTCStatsSearchResponse> {
        try {
            const params: any = {
                q: searchPattern,
                env: environment
            };

            if (startDate) {
                params.startDate = startDate.toISOString();
            }
            if (endDate) {
                params.endDate = endDate.toISOString();
            }

            const response = await this.apiClient.get('/search', { params });

            if (!response.data.success) {
                throw new Error(response.data.error?.message || 'Search failed');
            }

            return response.data.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.error?.message || error.message;

                throw new Error(`Failed to search conferences: ${message}`);
            }
            throw error;
        }
    }

    /**
     * Download conference dumps
     */
    static async downloadConference(
            conferenceId: string,
            environment: RTCStatsEnvironment = RTCStatsEnvironment.PROD
    ): Promise<IRTCStatsDownloadResponse> {
        try {
            const response = await this.apiClient.post(`/download/${conferenceId}`, {
                environment
            });

            if (!response.data.success) {
                throw new Error(response.data.error?.message || 'Download failed');
            }

            return response.data.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.error?.message || error.message;

                throw new Error(`Failed to download conference: ${message}`);
            }
            throw error;
        }
    }

    /**
     * Get download status for a conference
     */
    static async getDownloadStatus(conferenceId: string): Promise<IDownloadStatus | null> {
        try {
            const response = await this.apiClient.get(`/download/${conferenceId}/status`);

            if (!response.data.success) {
                return null; // No status found
            }

            return response.data.data;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                return null; // No status found
            }

            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.error?.message || error.message;

                throw new Error(`Failed to get download status: ${message}`);
            }
            throw error;
        }
    }

    /**
     * Get all download statuses
     */
    static async getAllDownloadStatuses(): Promise<{ count: number; downloads: IDownloadStatus[]; }> {
        try {
            const response = await this.apiClient.get('/downloads');

            if (!response.data.success) {
                throw new Error(response.data.error?.message || 'Failed to get download statuses');
            }

            return response.data.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.error?.message || error.message;

                throw new Error(`Failed to get download statuses: ${message}`);
            }
            throw error;
        }
    }

    /**
     * Get list of downloaded conferences available for analysis
     */
    static async getDownloadedConferences(): Promise<{
        conferences: Array<{ conferenceId: string; downloadPath: string; environment: RTCStatsEnvironment; }>;
        count: number;
    }> {
        try {
            const response = await this.apiClient.get('/downloaded');

            if (!response.data.success) {
                throw new Error(response.data.error?.message || 'Failed to get downloaded conferences');
            }

            return response.data.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.error?.message || error.message;

                throw new Error(`Failed to get downloaded conferences: ${message}`);
            }
            throw error;
        }
    }

    /**
     * Cancel ongoing download
     */
    static async cancelDownload(
            conferenceId: string,
            environment: RTCStatsEnvironment
    ): Promise<boolean> {
        try {
            const response = await this.apiClient.delete(`/download/${conferenceId}`, {
                data: { environment }
            });

            return response.data.success;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.error?.message || error.message;

                throw new Error(`Failed to cancel download: ${message}`);
            }
            throw error;
        }
    }

    /**
     * Clean up old downloads
     */
    static async cleanupOldDownloads(): Promise<void> {
        try {
            const response = await this.apiClient.post('/cleanup');

            if (!response.data.success) {
                throw new Error(response.data.error?.message || 'Cleanup failed');
            }
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.error?.message || error.message;

                throw new Error(`Failed to cleanup downloads: ${message}`);
            }
            throw error;
        }
    }
}
