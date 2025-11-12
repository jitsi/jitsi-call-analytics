/**
 * Call Analyzer Component
 * Input form for meeting URL and display of initial analysis
 */

import {
    Schedule as DurationIcon,
    Refresh as IceRestartIcon,
    SignalWifi0Bar as JitterIcon,
    Timer as LatencyIcon,
    Error as MediaInterruptionIcon,
    People as PeopleIcon,
    Domain as RoomIcon,
    SignalWifi4Bar as SignalIcon,
    CloudOff as StropheErrorIcon,
    TrendingUp as TrendingIcon,
} from '@mui/icons-material';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Grid,
    LinearProgress,
    Paper,
    Typography,
} from '@mui/material';
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { AnalysisService } from '../services/AnalysisService';
import { RTCStatsService } from '../services/RTCStatsService';
import { ICallSession } from '../types/shared';

import { MetricCard } from './EnhancedCard';
import RTCStatsSearch from './RTCStatsSearch';

// Get the PUBLIC_URL for proper subpath navigation
const PUBLIC_URL = process.env.PUBLIC_URL || '';

interface ISessionStats {
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
        // count
        eventCounts?: {
            iceRestarts: number;
            mediaInterruptions: number;
            stropheErrors: number;
        };
        // percentage
        mediaInterruptions: number;
        // 0-5 scale
        networkStability: number;
        overallScore: number;
        // count
        participantDropouts: number;
        // 0-5 scale
        videoQuality: number;
    };
    totalUsers: number;
}

interface IAnalysisResult {
    session: ICallSession;
    stats: ISessionStats;
    timeline: any;
}

const CallAnalyzer: React.FC = () => {
    const location = useLocation();
    const [ selectedFiles, setSelectedFiles ] = useState<FileList | null>(null);
    const [ loading, setLoading ] = useState(false);
    const [ error, setError ] = useState<string | null>(null);
    // Check for analysis result from navigation state (same tab navigation)
    const getStoredAnalysisResult = (): IAnalysisResult | null => {
        if (location.state?.analysisResult) {
            console.log('Found analysis result in location.state');

            return location.state.analysisResult;
        }

        return null;
    };

    const [ result, setResult ] = useState<IAnalysisResult | null>(getStoredAnalysisResult());
    const [ downloadProgress, setDownloadProgress ] = useState<number>(0);
    const [ downloadStatus, setDownloadStatus ] = useState<string>('');

    // Handle RTCStats and local dumps URL parameters and trigger analysis
    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        const isRTCStats = searchParams.get('rtcstats') === 'true';
        const isLocalDumps = searchParams.get('localDumps') === 'true';
        const urlConferenceId = searchParams.get('conferenceId');
        const urlEnvironment = searchParams.get('environment');
        const urlDumpsPath = searchParams.get('dumpsPath');
        const urlRoomName = searchParams.get('roomName');

        // Handle local dumps analysis (uploaded dumps)
        if (isLocalDumps && urlDumpsPath && !result) {
            console.log('New tab detected local dumps parameters:', { urlDumpsPath, urlRoomName });

            // Try to load from sessionStorage first
            const sessionId = urlRoomName || 'uploaded-session';
            const stored = sessionStorage.getItem(`analysis_${sessionId}`);

            if (stored) {
                try {
                    const parsed = JSON.parse(stored);

                    console.log('Loaded analysis from sessionStorage');
                    setResult(parsed.analysisResult);
                    setDownloadProgress(100);

                    return;
                } catch (e) {
                    console.warn('Failed to parse stored analysis result:', e);
                }
            }

            // If not in sessionStorage, analyze from dumpsPath
            const analyzeLocalDumps = async () => {
                setLoading(true);
                setError(null);
                setDownloadStatus('Analyzing uploaded dump files...');
                setDownloadProgress(50);

                try {
                    const analysisResult = await AnalysisService.analyzeMeeting(urlDumpsPath);

                    console.log('Local dumps analysis completed:', analysisResult);
                    setDownloadStatus('Analysis complete!');
                    setDownloadProgress(100);
                    setResult(analysisResult);
                } catch (err) {
                    console.error('Local dumps analysis failed:', err);
                    setError(err instanceof Error ? err.message : 'Local dumps analysis failed');
                    setDownloadStatus('');
                } finally {
                    setLoading(false);
                }
            };

            analyzeLocalDumps();

            return;
        }

        // Handle RTCStats conference analysis
        if (isRTCStats && urlConferenceId && urlEnvironment && !result) {
            console.log('[CallAnalyzer] New tab detected RTCStats URL parameters:', { urlConferenceId, urlEnvironment });

            const waitForDownloadAndAnalyze = async () => {
                console.log('[CallAnalyzer] Starting waitForDownloadAndAnalyze...');
                setLoading(true);
                setError(null);
                setDownloadStatus('Initializing...');
                setDownloadProgress(0);

                try {
                    console.log('[CallAnalyzer] Checking if conference is ready for analysis:', urlConferenceId);

                    // First, try direct analysis in case conference is already downloaded
                    try {
                        console.log('[CallAnalyzer] Attempting direct analysis first...');
                        setDownloadStatus('Checking if conference is already downloaded...');
                        const analysisResult = await AnalysisService.analyzeRTCStatsConference(
                            urlConferenceId,
                            urlEnvironment as 'prod' | 'pilot'
                        );

                        console.log('[CallAnalyzer] Direct analysis succeeded - conference already downloaded!');
                        setDownloadStatus('Analysis complete!');
                        setDownloadProgress(100);
                        setResult(analysisResult);
                        setLoading(false);

                        return;
                    } catch (directAnalysisError: any) {
                        console.log('[CallAnalyzer] Direct analysis failed:', directAnalysisError.message);
                        console.log('[CallAnalyzer] Checking download status...');
                        setDownloadStatus('Conference not downloaded yet, waiting for download...');
                    }

                    // If direct analysis fails, poll for download completion
                    let downloadComplete = false;
                    let attempts = 0;
                    const maxAttempts = 60; // 2 minutes max wait (60 * 2 seconds)

                    console.log('[CallAnalyzer] Starting download status polling...');

                    while (!downloadComplete && attempts < maxAttempts) {
                        try {
                            console.log(`[CallAnalyzer] Poll attempt ${attempts + 1}/${maxAttempts} - checking status for:`, urlConferenceId);
                            const status = await RTCStatsService.getDownloadStatus(urlConferenceId);

                            console.log(`[CallAnalyzer] Poll attempt ${attempts + 1} - status:`, status);

                            if (status?.status === 'completed') {
                                console.log('[CallAnalyzer] Download completed! Proceeding with analysis');
                                setDownloadStatus('Download complete! Starting analysis...');
                                setDownloadProgress(100);
                                downloadComplete = true;
                                break;
                            } else if (status?.status === 'failed') {
                                console.error('[CallAnalyzer] Download failed:', status.error);
                                throw new Error('Conference download failed: ' + (status.error || 'Unknown error'));
                            } else if (status?.status === 'cancelled') {
                                console.error('[CallAnalyzer] Download was cancelled');
                                throw new Error('Conference download was cancelled');
                            } else {
                                // Still downloading or pending
                                const progress = status?.progress || 0;

                                setDownloadProgress(progress);
                                setDownloadStatus(`Downloading conference dumps... ${progress}%`);
                                console.log(`[CallAnalyzer] Download in progress - status: ${status?.status || 'checking'}, progress: ${progress}%`);
                            }
                        } catch (statusError: any) {
                            // If status not found (404), conference may not be downloading
                            console.error(`[CallAnalyzer] Status check attempt ${attempts + 1} error:`, statusError.message);

                            if (statusError.message.includes('404') || statusError.message.includes('not found')) {
                                console.error('[CallAnalyzer] Download status not found - conference may not be downloading');
                                throw new Error('Conference not found or not being downloaded. Please search and download the conference first.');
                            }
                        }

                        console.log('[CallAnalyzer] Waiting 2 seconds before next poll attempt...');
                        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
                        attempts++;
                    }

                    if (!downloadComplete) {
                        throw new Error('Download timeout: Conference download took too long. Please try again.');
                    }

                    // Download complete, now analyze
                    console.log('Starting analysis after confirmed download completion...');
                    setDownloadStatus('Analyzing conference data...');
                    const analysisResult = await AnalysisService.analyzeRTCStatsConference(
                        urlConferenceId,
                        urlEnvironment as 'prod' | 'pilot'
                    );

                    console.log('RTCStats analysis completed from URL:', analysisResult);
                    setDownloadStatus('Analysis complete!');
                    setResult(analysisResult);
                } catch (err) {
                    console.error('RTCStats analysis failed from URL:', err);
                    setError(err instanceof Error ? err.message : 'RTCStats analysis failed');
                    setDownloadStatus('');
                } finally {
                    setLoading(false);
                }
            };

            waitForDownloadAndAnalyze();
        }
    }, [ location.search ]); // Only depend on URL params, run once when component mounts

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;

        if (files && files.length > 0) {
            setSelectedFiles(files);
            setError(null);
        }
    };

    const handleAnalyze = async () => {
        if (!selectedFiles || selectedFiles.length === 0) {
            setError('Please select dump files to analyze');

            return;
        }

        setLoading(true);
        setError(null);

        try {
            console.log(`Analyzing ${selectedFiles.length} dump files...`);
            const analysisResult = await AnalysisService.analyzeDumpFiles(selectedFiles);

            console.log('File upload analysis completed:', analysisResult);

            // Store in sessionStorage for timeline access
            const sessionId = analysisResult.session.sessionId || analysisResult.session.roomName || 'uploaded-session';
            const roomName = analysisResult.session.roomName || sessionId;

            sessionStorage.setItem(`analysis_${sessionId}`, JSON.stringify({ analysisResult }));
            if (roomName !== sessionId) {
                sessionStorage.setItem(`analysis_${roomName}`, JSON.stringify({ analysisResult }));
            }

            // Open results in new tab automatically (like RTCStats mode)
            const dumpsPath = (analysisResult as any).dumpsPath;
            const params = new URLSearchParams({
                roomName
            });

            if (dumpsPath) {
                params.set('dumpsPath', dumpsPath);
            }

            const url = `${PUBLIC_URL}/?localDumps=true&${params.toString()}`;

            console.log('Opening analysis results in new tab:', url);
            const newWindow = window.open(url, '_blank');

            if (!newWindow) {
                // If popup was blocked, show results in current tab
                setError('Failed to open new tab. Please allow popups for this site.');
                setResult(analysisResult);
            }
        } catch (err) {
            console.error('File upload analysis failed:', err);
            setError(err instanceof Error ? err.message : 'File upload analysis failed');
        } finally {
            setLoading(false);
        }
    };

    const handleViewTimeline = () => {
        if (!result) return;

        // Check if this is an RTCStats analysis (from URL parameters)
        const searchParams = new URLSearchParams(location.search);
        const isRTCStats = searchParams.get('rtcstats') === 'true';
        const conferenceId = searchParams.get('conferenceId');
        const environment = searchParams.get('environment');

        if (isRTCStats && conferenceId) {
            // For RTCStats conferences, use the conference ID and environment
            window.open(
                `${PUBLIC_URL}/call/${conferenceId}?rtcstats=true&conferenceId=${encodeURIComponent(conferenceId)}&environment=${encodeURIComponent(environment || 'prod')}`,
                '_blank'
            );
        } else if (result.session.sessionId) {
            // For uploaded dumps, treat them like RTCStats downloads with dumpsPath
            const sessionId = result.session.sessionId;
            const roomName = result.session.roomName || sessionId;

            // Get dumpsPath from result (returned by upload endpoint)
            const dumpsPath = (result as any).dumpsPath;

            const params = new URLSearchParams({
                roomName
            });

            // If we have dumpsPath, pass it so all existing endpoints work
            if (dumpsPath) {
                params.set('dumpsPath', dumpsPath);
            }

            // Store in sessionStorage for quick access
            sessionStorage.setItem(`analysis_${sessionId}`, JSON.stringify({ analysisResult: result }));
            if (roomName !== sessionId) {
                sessionStorage.setItem(`analysis_${roomName}`, JSON.stringify({ analysisResult: result }));
            }

            const url = `${PUBLIC_URL}/call/${roomName}?${params.toString()}`;

            console.log('Opening timeline with dumpsPath:', dumpsPath, 'URL:', url);
            window.open(url, '_blank');
        }
    };


    const handleViewBridge = (bridgeId: string) => {
        window.open(`${PUBLIC_URL}/bridge/${bridgeId}`, '_blank');
    };

    const handleViewJicofo = (shardId: string) => {
        window.open(`${PUBLIC_URL}/jicofo/${shardId}`, '_blank');
    };

    const formatDuration = (milliseconds: number): string => {
        const minutes = Math.floor(milliseconds / 60000);
        const seconds = Math.floor((milliseconds % 60000) / 1000);

        return `${minutes}m ${seconds}s`;
    };


    return (
        <Box>
            <Typography variant = 'h4' gutterBottom>
                Call Quality Analyzer
            </Typography>
            <Typography variant = 'body1' color = 'textSecondary' paragraph>
                Analyze call quality from local dump files or search production RTCStats servers
            </Typography>

            {/* Download Progress Indicator */}
            {loading && downloadStatus && (
                <Paper sx = {{ p: 3, mb: 3 }}>
                    <Box sx = {{ mb: 2 }}>
                        <Typography variant = 'h6' gutterBottom>
                            {downloadStatus}
                        </Typography>
                        <LinearProgress
                            variant = { downloadProgress > 0 ? 'determinate' : 'indeterminate' }
                            value = { downloadProgress }
                            sx = {{ height: 10, borderRadius: 5 }}/>
                        {downloadProgress > 0 && (
                            <Typography variant = 'body2' color = 'textSecondary' sx = {{ mt: 1, textAlign: 'center' }}>
                                {downloadProgress}% complete
                            </Typography>
                        )}
                    </Box>
                </Paper>
            )}

            {/* Only show search interfaces when no results are displayed */}
            {!result && !loading && (
                <>
                    {/* Local Dump Analysis Section */}
                    <Typography variant = 'h5' gutterBottom sx = {{ mt: 2, mb: 1 }}>
                        Local Dump Analysis
                    </Typography>
                    <Typography variant = 'body2' color = 'textSecondary' gutterBottom>
                        Upload conference dump files (.json, .txt) to analyze
                    </Typography>
                    <Paper sx = {{ p: 3, mb: 3 }}>
                        <Grid container spacing = { 2 } alignItems = 'center'>
                            <Grid item xs = { 12 } md = { 8 }>
                                <input
                                    accept = '.json,.txt'
                                    style = {{ display: 'none' }}
                                    id = 'dump-file-upload'
                                    multiple
                                    type = 'file'
                                    onChange = { handleFileSelect }
                                    disabled = { loading }/>
                                <label htmlFor = 'dump-file-upload'>
                                    <Button
                                        variant = 'outlined'
                                        component = 'span'
                                        fullWidth
                                        disabled = { loading }
                                        sx = {{ height: '56px', justifyContent: 'flex-start', textTransform: 'none' }}>
                                        {selectedFiles && selectedFiles.length > 0
                                            ? `${selectedFiles.length} file(s) selected`
                                            : 'Choose Dump Files...'}
                                    </Button>
                                </label>
                                <Typography variant = 'caption' display = 'block' sx = {{ mt: 1, ml: 1.5 }}>
                                    {selectedFiles && selectedFiles.length > 0 ? (
                                        Array.from(selectedFiles).slice(0, 3).map(f => f.name).join(', ')
                                        + (selectedFiles.length > 3 ? ` and ${selectedFiles.length - 3} more...` : '')
                                    ) : (
                                        'Select conference dump files (.json, .txt)'
                                    )}
                                </Typography>
                            </Grid>
                            <Grid item xs = { 12 } md = { 4 }>
                                <Button
                                    fullWidth
                                    variant = 'contained'
                                    onClick = { handleAnalyze }
                                    disabled = { loading || !selectedFiles || selectedFiles.length === 0 }
                                    startIcon = {
                                        loading ? (
                                            <CircularProgress size = { 20 } />
                                        ) : (
                                            <TrendingIcon />
                                        )
                                    }
                                    sx = {{ height: '56px' }}>
                                    {loading ? 'Analyzing...' : 'Analyze Conference Dumps'}
                                </Button>
                            </Grid>
                        </Grid>

                        {error && (
                            <Alert severity = 'error' sx = {{ mt: 2 }}>
                                {error}
                            </Alert>
                        )}
                    </Paper>

                    {/* RTCStats Search Interface */}
                    <RTCStatsSearch
                        onConferenceReady = { async (conferenceId, environment) => {
                            // When RTCStats conference is ready, just open the new tab with parameters
                            console.log(`RTCStats conference ready: ${conferenceId} (${environment})`);

                            // Open new tab with URL parameters that will trigger analysis in the new tab
                            const url = `${PUBLIC_URL}/?rtcstats=true&conferenceId=${encodeURIComponent(conferenceId)}&environment=${encodeURIComponent(environment)}`;

                            console.log('Opening new tab with URL:', url);
                            const newWindow = window.open(url, '_blank');

                            console.log('New window opened:', !!newWindow);
                        } }/>
                </>
            )}

            {/* Results Section */}
            {result && (
                <>
                    {/* Session Overview */}
                    <Grid container spacing = { 3 } sx = {{ mb: 3 }}>
                        <Grid item xs = { 12 } md = { 3 }>
                            <MetricCard
                                title = 'Duration'
                                value = { formatDuration(result.stats.meetingDuration) }
                                icon = { <DurationIcon /> }
                                color = 'primary'/>
                        </Grid>
                        <Grid item xs = { 12 } md = { 3 }>
                            <MetricCard
                                title = 'Total Users'
                                value = { result.stats.totalUsers.toString() }
                                icon = { <PeopleIcon /> }
                                color = 'primary'/>
                        </Grid>
                        <Grid item xs = { 12 } md = { 3 }>
                            <MetricCard
                                title = 'Peak Concurrent'
                                value = { result.stats.peakConcurrent.toString() }
                                icon = { <TrendingIcon /> }
                                color = 'success'/>
                        </Grid>
                        <Grid item xs = { 12 } md = { 3 }>
                            <MetricCard
                                title = 'Room Name'
                                value = { result.session.roomName || 'Unknown Room' }
                                icon = { <RoomIcon /> }
                                color = 'primary'/>
                        </Grid>
                    </Grid>

                    {/* Conference Statistics */}
                    <Paper sx = {{ p: 3, mb: 3 }}>
                        <Typography variant = 'h6' gutterBottom>
                            Conference Statistics
                        </Typography>

                        {/* Average Network Statistics */}
                        <Typography variant = 'h6' gutterBottom sx = {{ mt: 2, mb: 2 }}>
                            Average Network Metrics
                        </Typography>
                        <Grid container spacing = { 3 } sx = {{ mb: 4 }}>
                            {/* Packet Loss */}
                            <Grid item xs = { 6 } md = { 3 }>
                                <Box textAlign = 'center'>
                                    <SignalIcon
                                        color = 'action'
                                        sx = {{ fontSize: 40, mb: 1 }}/>
                                    <Typography
                                        variant = 'body2'
                                        color = 'textSecondary'>
                                        Avg Packet Loss
                                    </Typography>
                                    <Typography
                                        variant = 'h5'
                                        color = {
                                            result.stats.qualityMetrics.avgPacketLoss > 2
                                                ? 'error'
                                                : result.stats.qualityMetrics.avgPacketLoss > 1
                                                    ? 'warning'
                                                    : 'success'
                                        }>
                                        {result.stats.qualityMetrics.avgPacketLoss.toFixed(1)}%
                                    </Typography>
                                </Box>
                            </Grid>
                            {/* Round Trip Time */}
                            <Grid item xs = { 6 } md = { 3 }>
                                <Box textAlign = 'center'>
                                    <LatencyIcon
                                        color = 'action'
                                        sx = {{ fontSize: 40, mb: 1 }}/>
                                    <Typography
                                        variant = 'body2'
                                        color = 'textSecondary'>
                                        Avg RTT
                                    </Typography>
                                    <Typography
                                        variant = 'h5'
                                        color = {
                                            result.stats.qualityMetrics.avgRTT > 150
                                                ? 'error'
                                                : result.stats.qualityMetrics.avgRTT > 100
                                                    ? 'warning'
                                                    : 'success'
                                        }>
                                        {result.stats.qualityMetrics.avgRTT}ms
                                    </Typography>
                                </Box>
                            </Grid>
                            {/* Jitter */}
                            <Grid item xs = { 6 } md = { 3 }>
                                <Box textAlign = 'center'>
                                    <JitterIcon
                                        color = 'action'
                                        sx = {{ fontSize: 40, mb: 1 }}/>
                                    <Typography
                                        variant = 'body2'
                                        color = 'textSecondary'>
                                        Avg Jitter
                                    </Typography>
                                    <Typography
                                        variant = 'h5'
                                        color = {
                                            result.stats.qualityMetrics.avgJitter > 30
                                                ? 'error'
                                                : result.stats.qualityMetrics.avgJitter > 20
                                                    ? 'warning'
                                                    : 'success'
                                        }>
                                        {result.stats.qualityMetrics.avgJitter}ms
                                    </Typography>
                                </Box>
                            </Grid>
                            {/* Connection Success Rate */}
                            <Grid item xs = { 6 } md = { 3 }>
                                <Box textAlign = 'center'>
                                    <TrendingIcon
                                        color = 'action'
                                        sx = {{ fontSize: 40, mb: 1 }}/>
                                    <Typography
                                        variant = 'body2'
                                        color = 'textSecondary'>
                                        Connection Success
                                    </Typography>
                                    <Typography
                                        variant = 'h5'
                                        color = {
                                            result.stats.qualityMetrics.connectionSuccessRate < 90
                                                ? 'error'
                                                : result.stats.qualityMetrics.connectionSuccessRate < 95
                                                    ? 'warning'
                                                    : 'success'
                                        }>
                                        {Math.round(result.stats.qualityMetrics.connectionSuccessRate)}%
                                    </Typography>
                                </Box>
                            </Grid>
                        </Grid>

                        {/* Event Counts */}
                        <Typography variant = 'h6' gutterBottom sx = {{ mt: 3, mb: 2 }}>
                            Event Summary
                        </Typography>
                        <Grid container spacing = { 3 } sx = {{ mb: 3 }}>
                            {/* Media Interruptions */}
                            <Grid item xs = { 6 } md = { 4 }>
                                <Card variant = 'outlined'>
                                    <CardContent>
                                        <Box
                                            display = 'flex'
                                            alignItems = 'center'
                                            gap = { 2 }
                                            mb = { 1 }>
                                            <MediaInterruptionIcon
                                                color = 'error'
                                                sx = {{ fontSize: 32 }}/>
                                            <Box>
                                                <Typography variant = 'h6'>
                                                    Media Interruptions
                                                </Typography>
                                                <Typography
                                                    variant = 'body2'
                                                    color = 'textSecondary'>
                                                    BWE Issues
                                                </Typography>
                                            </Box>
                                        </Box>
                                        <Typography
                                            variant = 'h4'
                                            color = 'error'
                                            textAlign = 'center'>
                                            {result.stats.qualityMetrics.eventCounts?.mediaInterruptions || 0}
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                            {/* ICE Restarts */}
                            <Grid item xs = { 6 } md = { 4 }>
                                <Card variant = 'outlined'>
                                    <CardContent>
                                        <Box
                                            display = 'flex'
                                            alignItems = 'center'
                                            gap = { 2 }
                                            mb = { 1 }>
                                            <IceRestartIcon
                                                color = 'warning'
                                                sx = {{ fontSize: 32 }}/>
                                            <Box>
                                                <Typography variant = 'h6'>
                                                    ICE Restarts
                                                </Typography>
                                                <Typography
                                                    variant = 'body2'
                                                    color = 'textSecondary'>
                                                    Network Issues
                                                </Typography>
                                            </Box>
                                        </Box>
                                        <Typography
                                            variant = 'h4'
                                            color = 'warning'
                                            textAlign = 'center'>
                                            {result.stats.qualityMetrics.eventCounts?.iceRestarts || 0}
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                            {/* Strophe Errors */}
                            <Grid item xs = { 6 } md = { 4 }>
                                <Card variant = 'outlined'>
                                    <CardContent>
                                        <Box
                                            display = 'flex'
                                            alignItems = 'center'
                                            gap = { 2 }
                                            mb = { 1 }>
                                            <StropheErrorIcon
                                                color = 'info'
                                                sx = {{ fontSize: 32 }}/>
                                            <Box>
                                                <Typography variant = 'h6'>
                                                    Strophe Errors
                                                </Typography>
                                                <Typography
                                                    variant = 'body2'
                                                    color = 'textSecondary'>
                                                    Connection Issues
                                                </Typography>
                                            </Box>
                                        </Box>
                                        <Typography
                                            variant = 'h4'
                                            color = 'info'
                                            textAlign = 'center'>
                                            {result.stats.qualityMetrics.eventCounts?.stropheErrors || 0}
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>
                    </Paper>

                    {/* Backend Infrastructure */}
                    <Paper sx = {{ p: 3, mb: 3 }}>
                        <Typography variant = 'h6' gutterBottom>
                            Backend Infrastructure
                        </Typography>
                        <Grid container spacing = { 3 }>
                            {/* JVB Instances */}
                            <Grid item xs = { 12 } md = { 4 }>
                                <Card variant = 'outlined' sx = {{ height: '200px' }}>
                                    <CardContent sx = {{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                        <Typography variant = 'h6' gutterBottom>
                                            JVB Instances
                                        </Typography>
                                        <Box sx = {{ flexGrow: 1, overflow: 'auto', maxHeight: '130px' }}>
                                            {result.stats.backendComponents.jvbs.map(
                                                (jvb, index) => (
                                                    <Chip
                                                        key = { index }
                                                        label = { jvb }
                                                        onClick = { () =>
                                                            handleViewBridge(jvb)
                                                        }
                                                        sx = {{ m: 0.5 }}
                                                        clickable/>
                                                ),
                                            )}
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>

                            {/* Jicofo Instances */}
                            <Grid item xs = { 12 } md = { 4 }>
                                <Card variant = 'outlined' sx = {{ height: '200px' }}>
                                    <CardContent sx = {{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                        <Typography variant = 'h6' gutterBottom>
                                            Jicofo Instances
                                        </Typography>
                                        <Box sx = {{ flexGrow: 1, overflow: 'auto', maxHeight: '130px' }}>
                                            {result.stats.backendComponents.shards.map(
                                                (shard, index) => (
                                                    <Chip
                                                        key = { index }
                                                        label = { shard }
                                                        onClick = { () =>
                                                            handleViewJicofo(shard)
                                                        }
                                                        sx = {{ m: 0.5 }}
                                                        clickable/>
                                                ),
                                            )}
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>

                            {/* Jibri Instances */}
                            <Grid item xs = { 12 } md = { 4 }>
                                <Card variant = 'outlined' sx = {{ height: '200px' }}>
                                    <CardContent sx = {{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                        <Typography variant = 'h6' gutterBottom>
                                            Jibri Instances
                                        </Typography>
                                        <Box sx = {{ flexGrow: 1, overflow: 'auto', maxHeight: '130px' }}>
                                            {result.stats.backendComponents.jibris
                                                .length > 0 ? (
                                                    result.stats.backendComponents.jibris.map(
                                                        (jibri, index) => (
                                                            <Chip
                                                                key = { index }
                                                                label = { jibri }
                                                                sx = {{ m: 0.5 }}/>
                                                        ),
                                                    )
                                                ) : (
                                                    <Typography
                                                        variant = 'body2'
                                                        color = 'textSecondary'>
                                                        No recording instances used
                                                    </Typography>
                                                )}
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>
                    </Paper>

                    {/* Action Buttons */}
                    <Box display = 'flex' justifyContent = 'center' sx = {{ mt: 3 }}>
                        <Button
                            variant = 'contained'
                            size = 'large'
                            onClick = { handleViewTimeline }
                            startIcon = { <DurationIcon /> }
                            sx = {{
                                px: 8,
                                py: 2,
                                fontSize: '1.2rem',
                                fontWeight: 600,
                                minWidth: '300px'
                            }}>
                            View Timeline
                        </Button>
                    </Box>
                </>
            )}
        </Box>
    );
};

export default CallAnalyzer;
