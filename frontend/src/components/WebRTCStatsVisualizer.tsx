/**
 * WebRTC Stats Visualizer Component
 * Integrated visualization component compatible with rtc-visualizer format
 * Displays multiple sessions per participant in separate tabs
 */

import { getLogger } from '@jitsi/logger';
import {
    BarChart as ChartIcon,
    ExpandMore as ExpandMoreIcon,
    Timeline as TimelineIcon,
    ShowChart as WebRTCIcon,
} from '@mui/icons-material';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Alert,
    Box,
    Card,
    CardContent,
    Chip,
    Grid,
    Paper,
    Tab,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tabs,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import React, { useEffect, useState } from 'react';
import Plot from 'react-plotly.js';
import { useLocation } from 'react-router-dom';

import { API_BASE_URL } from '../config/api';

const logger = getLogger('frontend/src/components/WebRTCStatsVisualizer');

interface IWebRTCStatsVisualizerProps {
    displayName?: string;
    participantId: string;
}

interface ISessionData {
    connectionEvents: Array<{
        connectionId: string | null;
        data: any;
        timestamp: number;
        type: string;
    }>;
    displayName: string;
    endpointId: string;
    mediaEvents: Array<{
        data: any;
        timestamp: number;
        trackId: string | null;
        type: string;
    }>;
    metadata: {
        connectionEventsCount: number;
        duration: number;
        endTime: number;
        mediaEventsCount: number;
        startTime: number;
        statsCount: number;
    };
    participantId: string;
    sessionId: string;
    stats: Array<{
        connectionId: string | null;
        data: any;
        timestamp: number;
    }>;
}

interface IVisualizationData {
    displayName: string;
    participantId: string;
    sessions: ISessionData[];
    summary: {
        sessionIds: string[];
        totalConnectionEvents: number;
        totalMediaEvents: number;
        totalSessions: number;
        totalStats: number;
    };
}

const WebRTCStatsVisualizer: React.FC<IWebRTCStatsVisualizerProps> = ({
    participantId,
    displayName,
}) => {
    const location = useLocation();
    const [ data, setData ] = useState<IVisualizationData | null>(null);
    const [ loading, setLoading ] = useState(false);
    const [ error, setError ] = useState<string | null>(null);
    const [ activeSession, setActiveSession ] = useState(0);
    const [ viewMode, setViewMode ] = useState<'charts' | 'tables'>('charts');

    // Get parameters from URL
    const searchParams = new URLSearchParams(location.search);
    const isRTCStats = searchParams.get('rtcstats') === 'true';
    const conferenceId = searchParams.get('conferenceId');
    const environment = searchParams.get('environment');
    const dumpsPath = searchParams.get('dumpsPath');
    const fetchVisualizationData = async () => {
        setLoading(true);
        setError(null);

        try {
            const identifier = displayName || participantId;

            // Build URL with RTCStats parameters or dumpsPath
            let url = `${API_BASE_URL}/api/visualization/participant/${encodeURIComponent(identifier)}`;
            const params = new URLSearchParams();

            if (isRTCStats && conferenceId && environment) {
                params.set('rtcstats', 'true');
                params.set('conferenceId', conferenceId);
                params.set('environment', environment);
            } else if (dumpsPath) {
                params.set('dumpsPath', dumpsPath);
            }

            if (params.toString()) {
                url += `?${params.toString()}`;
            }

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}: ${response.statusText}`,
                );
            }

            const result = await response.json();

            // Handle standardized API response format
            if (result.success && result.data) {
                setData(result.data);
            } else if (result.success === false) {
                throw new Error(result.error?.message || 'API request failed');
            } else {
                // Fallback for legacy response format
                setData(result);
            }
        } catch (err) {
            logger.error('Error fetching visualization data', { participantId, displayName, conferenceId, error: err });
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVisualizationData();
    }, [ participantId, displayName ]);
    const formatTime = (timestamp: number): string => {
        return new Date(timestamp).toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    };

    const formatDuration = (milliseconds: number): string => {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    };

    const handleSessionChange = (
            event: React.SyntheticEvent,
            newValue: number,
    ) => {
        setActiveSession(newValue);
    };

    const handleViewModeChange = (
            event: React.MouseEvent<HTMLElement>,
            newViewMode: 'charts' | 'tables' | null,
    ) => {
        if (newViewMode !== null) {
            setViewMode(newViewMode);
        }
    };

    // rtc-visualizer's convertTotalToRateSeries function for bitrate calculation
    const convertTotalToRateSeries = (
            timeSeries: any[],
    ) => {
        return timeSeries.reduce(
            (accumulator: any, currentValue: any) => {
                const { prevValue } = accumulator;

                accumulator.prevValue = currentValue;

                if (!prevValue.length) {
                    return accumulator;
                }

                const [ timestamp = 0, totalBytesSent = 0 ] = currentValue;
                const [ prevTimestamp = 0, prevTotalBytesSent = 0 ] = prevValue;

                const sampleRateSeconds = (timestamp - prevTimestamp) / 1000;

                // Skip calculation if time difference is too small or zero (prevents division by zero)
                if (sampleRateSeconds <= 0 || sampleRateSeconds < 0.001) {
                    return accumulator;
                }

                const bitRate = (totalBytesSent - prevTotalBytesSent) * 8;
                const bitRatePerSecond = Math.round(
                    bitRate / sampleRateSeconds,
                );

                // Debug logging for bitrate calculation issues
                if (
                    isNaN(bitRatePerSecond)
                    || bitRatePerSecond < 0
                    || bitRatePerSecond > 1000000000
                ) {
                    logger.debug('Bitrate calculation', {
                        timestamp,
                        prevTimestamp,
                        totalBytesSent,
                        prevTotalBytesSent,
                        sampleRateSeconds,
                        bitRate,
                        bitRatePerSecond,
                    });

                    return accumulator; // Skip invalid calculations
                }

                // Use original timestamp for bitrate calculation (preserves time intervals)
                accumulator.bitRate.push([ timestamp, bitRatePerSecond ]);

                return accumulator;
            },
            { bitRate: [], prevValue: [] },
        ).bitRate;
    };

    // Process WebRTC stats using exact rtc-visualizer logic
    const processWebRTCStats = (stats: any[]) => {
        const connections: { [key: string]: any; } = {};

        // Use session metadata for proper timeline alignment with call analysis page
        const sessionStartTime
            = data?.sessions[activeSession]?.metadata.startTime
            || (stats.length > 0 ? stats[0].timestamp : 0);

        // Build series data structure like rtc-visualizer does
        stats.forEach(stat => {
            if (stat.data && typeof stat.data === 'object') {
                const connectionId = stat.connectionId || 'PC_0';

                if (!connections[connectionId]) {
                    connections[connectionId] = {
                        series: {},
                        rawStats: [],
                        traces: [],
                        sessionStartTime: sessionStartTime,
                    };
                }

                connections[connectionId].rawStats.push(stat);

                // Process each report in the stats data (like rtc-visualizer does)
                Object.keys(stat.data).forEach(reportId => {
                    const reportData = stat.data[reportId];

                    if (reportData && typeof reportData === 'object') {
                        // Skip certain types like rtc-visualizer does
                        if (
                            reportData.type === 'localcandidate'
                            || reportData.type === 'remotecandidate'
                        )
                            return;

                        Object.keys(reportData).forEach(name => {
                            if (name === 'timestamp') return;

                            // Convert numeric stats to float like rtc-visualizer (for ssrc types)
                            if (
                                reportData.type === 'ssrc'
                                && !isNaN(parseFloat(reportData[name]))
                            ) {
                                reportData[name] = parseFloat(reportData[name]);
                            }

                            if (reportData.type === 'ssrc' && name === 'ssrc')
                                return; // ignore ssrc on ssrc reports.

                            // Also convert string numbers to actual numbers for other report types
                            if (
                                typeof reportData[name] === 'string'
                                && !isNaN(parseFloat(reportData[name]))
                            ) {
                                reportData[name] = parseFloat(reportData[name]);
                            }

                            // Debug logging for problematic report types
                            if (
                                (reportData.type === 'outbound-rtp'
                                    && reportId.includes('OTO1V'))
                                || (reportData.type === 'remote-outbound-rtp'
                                    && reportId.includes('ROV'))
                            ) {
                                if (
                                    name === 'bytesSent'
                                    || name === 'bytesReceived'
                                ) {
                                    logger.debug(
                                        `DEBUG: ${reportId} ${reportData.type} ${name}:`,
                                        reportData[name],
                                        typeof reportData[name],
                                    );
                                }
                            }

                            // Debug frameWidth specifically for vertical lines issue (reduced logging)
                            if (
                                reportData.type === 'outbound-rtp'
                                && name === 'frameWidth'
                                && Math.random() < 0.1
                            ) {
                                const timestamp
                                    = reportData.timestamp || stat.timestamp;

                                console.log(
                                    `DEBUG FRAMEWIDTH: ${reportId} timestamp=${timestamp} frameWidth=${reportData[name]} type=${typeof reportData[name]}`,
                                );
                            }

                            if (typeof reportData[name] === 'number') {
                                if (
                                    !connections[connectionId].series[reportId]
                                ) {
                                    connections[connectionId].series[reportId]
                                        = {};
                                    connections[connectionId].series[
                                        reportId
                                    ].type = reportData.type;
                                }
                                if (
                                    !connections[connectionId].series[reportId][
                                        name
                                    ]
                                ) {
                                    connections[connectionId].series[reportId][
                                        name
                                    ] = [];
                                } else {
                                    const lastTime
                                        = connections[connectionId].series[
                                            reportId
                                        ][name][
                                            connections[connectionId].series[
                                                reportId
                                            ][name].length - 1
                                        ][0];
                                    const currentTimestamp
                                        = reportData.timestamp || stat.timestamp;

                                    if (
                                        lastTime
                                        && currentTimestamp
                                        && currentTimestamp - lastTime > 20000
                                    ) {
                                        connections[connectionId].series[
                                            reportId
                                        ][name].push([ currentTimestamp, null ]);
                                    }
                                }
                                // Use report timestamp if available, fallback to stat timestamp like rtc-visualizer does
                                const timestamp
                                    = reportData.timestamp || stat.timestamp;

                                connections[connectionId].series[reportId][
                                    name
                                ].push([ timestamp, reportData[name] ]);
                            } else if (
                                connections[connectionId].series[reportId]
                            ) {
                                // include plain strings in the object, like the 'transportId' (we use this in the new transports grid)
                                connections[connectionId].series[reportId][
                                    name
                                ] = reportData[name];
                            }
                        });
                    }
                });
            }
        });

        // Now create Plotly traces for each connection like rtc-visualizer does
        Object.keys(connections).forEach(connectionId => {
            const connection = connections[connectionId];
            const traces: any[] = [];

            Object.keys(connection.series).forEach(reportId => {
                const reportSeries = connection.series[reportId];
                const ignoredSeries = [ 'type', 'ssrc' ];
                const visibleSeries = [
                    'bytesReceivedInBits/S',
                    'bytesSentInBits/S',
                    'targetBitrate',
                    'packetsLost',
                    'jitter',
                    'availableOutgoingBitrate',
                    'roundTripTime',
                ];
                const rateSeriesWhitelist = [ 'bytesSent', 'bytesReceived' ];

                // Calculate bitrate per second for time series that contain cumulated values
                Object.keys(reportSeries)
                    .filter(name => rateSeriesWhitelist.includes(name))
                    .forEach(name => {
                        const rateSeries = convertTotalToRateSeries(
                            reportSeries[name]
                        );

                        reportSeries[`${name}InBits/S`] = rateSeries;
                    });

                // Create traces for each numerical series
                Object.keys(reportSeries)
                    .filter(name => !ignoredSeries.includes(name))
                    .filter(name => Array.isArray(reportSeries[name]))
                    .forEach(name => {
                        const seriesData = reportSeries[name];

                        traces.push({
                            mode: 'lines+markers',
                            name: `${reportId}-${name}`,
                            visible: visibleSeries.includes(name)
                                ? true
                                : 'legendonly',
                            x: seriesData.map((d: any) => new Date(d[0])),
                            y: seriesData.map((d: any) => d[1]),
                            reportId,
                            seriesName: name,
                            reportType: reportSeries.type,
                        });
                    });
            });

            connection.traces = traces;
        });

        return connections;
    };

    if (loading) {
        return (
            <Alert severity = 'info' sx = {{ mb: 2 }}>
                Loading WebRTC statistics visualization...
            </Alert>
        );
    }

    if (error) {
        return (
            <Alert severity = 'error' sx = {{ mb: 2 }}>
                Failed to load WebRTC stats: {error}
            </Alert>
        );
    }

    if (!data?.sessions || data.sessions.length === 0) {
        return (
            <Alert severity = 'warning' sx = {{ mb: 2 }}>
                No WebRTC statistics available for this participant.
            </Alert>
        );
    }

    const currentSession = data.sessions[activeSession];

    return (
        <Box>
            {/* Participant Summary */}
            <Card sx = {{ mb: 3, bgcolor: '#f8f9ff' }}>
                <CardContent>
                    <Typography variant = 'h6' color = 'primary' gutterBottom>
                        🔍 WebRTC Statistics Overview
                    </Typography>
                    <Grid container spacing = { 2 }>
                        <Grid item xs = { 3 }>
                            <Typography variant = 'body2' color = 'textSecondary'>
                                Total Sessions
                            </Typography>
                            <Typography variant = 'h5' color = 'primary'>
                                {data.summary.totalSessions}
                            </Typography>
                        </Grid>
                        <Grid item xs = { 3 }>
                            <Typography variant = 'body2' color = 'textSecondary'>
                                Stats Events
                            </Typography>
                            <Typography variant = 'h5' color = 'info.main'>
                                {data.summary.totalStats}
                            </Typography>
                        </Grid>
                        <Grid item xs = { 3 }>
                            <Typography variant = 'body2' color = 'textSecondary'>
                                Connection Events
                            </Typography>
                            <Typography variant = 'h5' color = 'warning.main'>
                                {data.summary.totalConnectionEvents}
                            </Typography>
                        </Grid>
                        <Grid item xs = { 3 }>
                            <Typography variant = 'body2' color = 'textSecondary'>
                                Media Events
                            </Typography>
                            <Typography variant = 'h5' color = 'success.main'>
                                {data.summary.totalMediaEvents}
                            </Typography>
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            {/* Session Tabs */}
            {data.sessions.length > 1 && (
                <Paper sx = {{ mb: 2 }}>
                    <Tabs
                        value = { activeSession }
                        onChange = { handleSessionChange }
                        variant = 'scrollable'
                        scrollButtons = 'auto'
                        sx = {{ borderBottom: 1, borderColor: 'divider' }}>
                        {data.sessions.map((session, index) => (
                            <Tab
                                key = { session.sessionId }
                                label = {
                                    <Box textAlign = 'center'>
                                        <Typography
                                            variant = 'body2'
                                            fontWeight = 'bold'>
                                            📊 Session {index + 1}
                                        </Typography>
                                        <Typography
                                            variant = 'caption'
                                            display = 'block'>
                                            {session.sessionId.substring(0, 8)}
                                            ...
                                        </Typography>
                                        <Typography
                                            variant = 'caption'
                                            display = 'block'
                                            color = 'textSecondary'>
                                            {session.metadata.statsCount} stats
                                        </Typography>
                                    </Box>
                                }
                                icon = { <WebRTCIcon /> }
                                iconPosition = 'top'
                                sx = {{ minHeight: 80 }}/>
                        ))}
                    </Tabs>
                </Paper>
            )}

            {/* Current Session Details */}
            {currentSession && (
                <>
                    {/* View Mode Toggle */}
                    <Card sx = {{ mb: 2, bgcolor: '#f8f9ff' }}>
                        <CardContent>
                            <Box
                                display = 'flex'
                                justifyContent = 'space-between'
                                alignItems = 'center'>
                                <Typography variant = 'h6' color = 'primary'>
                                    📊 Visualization Mode
                                </Typography>
                                <ToggleButtonGroup
                                    value = { viewMode }
                                    exclusive
                                    onChange = { handleViewModeChange }
                                    aria-label = 'view mode'
                                    size = 'small'>
                                    <ToggleButton
                                        value = 'charts'
                                        aria-label = 'charts'>
                                        <ChartIcon sx = {{ mr: 1 }} />
                                        Charts
                                    </ToggleButton>
                                    <ToggleButton
                                        value = 'tables'
                                        aria-label = 'tables'>
                                        <TimelineIcon sx = {{ mr: 1 }} />
                                        Raw Data
                                    </ToggleButton>
                                </ToggleButtonGroup>
                            </Box>
                        </CardContent>
                    </Card>

                    {/* Session Info */}
                    <Card sx = {{ mb: 3, bgcolor: '#f0f8ff' }}>
                        <CardContent>
                            <Typography variant = 'h6' gutterBottom>
                                📈 Session {activeSession + 1} Details
                            </Typography>
                            <Grid container spacing = { 2 }>
                                <Grid item xs = { 12 } md = { 6 }>
                                    <Typography variant = 'body2'>
                                        <strong>Session ID:</strong>{' '}
                                        {currentSession.sessionId}
                                    </Typography>
                                    <Typography variant = 'body2'>
                                        <strong>Endpoint ID:</strong>{' '}
                                        {currentSession.endpointId}
                                    </Typography>
                                    <Typography variant = 'body2'>
                                        <strong>Duration:</strong>{' '}
                                        {formatDuration(
                                            currentSession.metadata.duration,
                                        )}
                                    </Typography>
                                </Grid>
                                <Grid item xs = { 12 } md = { 6 }>
                                    <Typography variant = 'body2'>
                                        <strong>Stats Events:</strong>{' '}
                                        {currentSession.metadata.statsCount}
                                    </Typography>
                                    <Typography variant = 'body2'>
                                        <strong>Connection Events:</strong>{' '}
                                        {
                                            currentSession.metadata
                                                .connectionEventsCount
                                        }
                                    </Typography>
                                    <Typography variant = 'body2'>
                                        <strong>Media Events:</strong>{' '}
                                        {
                                            currentSession.metadata
                                                .mediaEventsCount
                                        }
                                    </Typography>
                                </Grid>
                            </Grid>
                        </CardContent>
                    </Card>

                    {/* WebRTC Connection Analysis - rtc-visualizer Style */}
                    {viewMode === 'charts'
                        && currentSession.stats.length > 0 && (
                        <>
                            {(() => {
                                const connections = processWebRTCStats(
                                        currentSession.stats,
                                );
                                const connectionIds
                                        = Object.keys(connections);

                                if (connectionIds.length === 0) {
                                    return (
                                        <Alert
                                            severity = 'info'
                                            sx = {{ mb: 2 }}>
                                            No peer connections found in
                                            WebRTC stats data.
                                        </Alert>
                                    );
                                }

                                return connectionIds.map(connectionId => {
                                    const connection
                                            = connections[connectionId];

                                    return (
                                        <Card
                                            key = { connectionId }
                                            sx = {{ mb: 3 }}>
                                            <CardContent>
                                                <Typography
                                                    variant = 'h6'
                                                    gutterBottom
                                                    color = 'primary'>
                                                    🔗 {connectionId} (
                                                    {
                                                        connection.rawStats
                                                                .length
                                                    }{' '}
                                                    stats,{' '}
                                                    {
                                                        connection.traces
                                                                .length
                                                    }{' '}
                                                    time series)
                                                </Typography>

                                                {/* Connection Summary */}
                                                <Box
                                                    sx = {{
                                                        mb: 3,
                                                        p: 2,
                                                        bgcolor: '#f8f9ff',
                                                        borderRadius: 1,
                                                    }}>
                                                    <Typography
                                                        variant = 'subtitle2'
                                                        gutterBottom>
                                                        Connection Summary -
                                                        rtc-visualizer Style
                                                    </Typography>
                                                    <Grid
                                                        container
                                                        spacing = { 1 }>
                                                        <Grid item xs = { 2 }>
                                                            <Typography
                                                                variant = 'body2'
                                                                color = 'textSecondary'
                                                                sx = {{
                                                                    fontSize:
                                                                            '0.75rem',
                                                                }}>
                                                                Total Stats
                                                            </Typography>
                                                            <Typography variant = 'h6'>
                                                                {
                                                                    connection
                                                                            .rawStats
                                                                            .length
                                                                }
                                                            </Typography>
                                                        </Grid>
                                                        <Grid item xs = { 2 }>
                                                            <Typography
                                                                variant = 'body2'
                                                                color = 'textSecondary'
                                                                sx = {{
                                                                    fontSize:
                                                                            '0.75rem',
                                                                }}>
                                                                Time Series
                                                            </Typography>
                                                            <Typography variant = 'h6'>
                                                                {
                                                                    connection
                                                                            .traces
                                                                            .length
                                                                }
                                                            </Typography>
                                                        </Grid>
                                                        <Grid item xs = { 2 }>
                                                            <Typography
                                                                variant = 'body2'
                                                                color = 'textSecondary'
                                                                sx = {{
                                                                    fontSize:
                                                                            '0.75rem',
                                                                }}>
                                                                Reports
                                                            </Typography>
                                                            <Typography variant = 'h6'>
                                                                {
                                                                    Object.keys(
                                                                            connection.series,
                                                                    ).length
                                                                }
                                                            </Typography>
                                                        </Grid>
                                                        <Grid item xs = { 2 }>
                                                            <Typography
                                                                variant = 'body2'
                                                                color = 'textSecondary'
                                                                sx = {{
                                                                    fontSize:
                                                                            '0.75rem',
                                                                }}>
                                                                Report Types
                                                            </Typography>
                                                            <Typography variant = 'h6'>
                                                                {
                                                                    new Set(
                                                                            Object.keys(
                                                                                connection.series,
                                                                            ).map(
                                                                                reportId =>
                                                                                    connection
                                                                                        .series[
                                                                                        reportId
                                                                                        ]
                                                                                        .type,
                                                                            ),
                                                                    ).size
                                                                }
                                                            </Typography>
                                                        </Grid>
                                                        <Grid item xs = { 2 }>
                                                            <Typography
                                                                variant = 'body2'
                                                                color = 'textSecondary'
                                                                sx = {{
                                                                    fontSize:
                                                                            '0.75rem',
                                                                }}>
                                                                Visible
                                                                Series
                                                            </Typography>
                                                            <Typography variant = 'h6'>
                                                                {
                                                                    connection.traces.filter(
                                                                            (
                                                                                    t: any,
                                                                            ) =>
                                                                                t.visible
                                                                                === true,
                                                                    ).length
                                                                }
                                                            </Typography>
                                                        </Grid>
                                                        <Grid item xs = { 2 }>
                                                            <Typography
                                                                variant = 'body2'
                                                                color = 'textSecondary'
                                                                sx = {{
                                                                    fontSize:
                                                                            '0.75rem',
                                                                }}>
                                                                Duration
                                                            </Typography>
                                                            <Typography
                                                                variant = 'body2'
                                                                sx = {{
                                                                    fontSize:
                                                                            '0.8rem',
                                                                }}>
                                                                {connection
                                                                        .rawStats
                                                                        .length
                                                                    > 1
                                                                    ? formatDuration(
                                                                              connection
                                                                                  .rawStats[
                                                                                  connection
                                                                                      .rawStats
                                                                                      .length
                                                                                      - 1
                                                                                  ]
                                                                                  .timestamp
                                                                                  - connection
                                                                                      .rawStats[0]
                                                                                      .timestamp,
                                                                    )
                                                                    : 'N/A'}
                                                            </Typography>
                                                        </Grid>
                                                    </Grid>
                                                </Box>

                                                {/* rtc-visualizer Style Charts - Collapsible Individual Charts per Report ID */}
                                                {Object.keys(
                                                        connection.series,
                                                ).map(reportId => {
                                                    const reportSeries
                                                            = connection.series[
                                                                reportId
                                                            ];
                                                    const reportType
                                                            = reportSeries.type;
                                                    const ignoredSeries = [
                                                        'type',
                                                        'ssrc',
                                                    ];
                                                    const visibleSeries = [
                                                        'bytesReceivedInBits/S',
                                                        'bytesSentInBits/S',
                                                        'targetBitrate',
                                                        'packetsLost',
                                                        'jitter',
                                                        'availableOutgoingBitrate',
                                                        'roundTripTime',
                                                    ];

                                                    // Create traces for this specific report ID (like rtc-visualizer does)
                                                    const traces
                                                            = Object.keys(
                                                                reportSeries,
                                                            )
                                                                .filter(
                                                                    name =>
                                                                        !ignoredSeries.includes(
                                                                            name,
                                                                        ),
                                                                )
                                                                .filter(
                                                                    name =>
                                                                        Array.isArray(
                                                                            reportSeries[
                                                                                name
                                                                            ],
                                                                        ),
                                                                )
                                                                .map(name => {
                                                                    const seriesData
                                                                        = reportSeries[
                                                                            name
                                                                        ];

                                                                    // Clean and filter data to remove invalid entries
                                                                    const cleanedData
                                                                        = seriesData
                                                                            .filter(
                                                                                (
                                                                                        d: any,
                                                                                ) =>
                                                                                    d
                                                                                    && d.length
                                                                                        >= 2
                                                                                    && d[0]
                                                                                    && d[1]
                                                                                        !== null
                                                                                    && d[1]
                                                                                        !== undefined
                                                                                    && !isNaN(
                                                                                        d[1],
                                                                                    ),
                                                                            )
                                                                            .sort(
                                                                                (
                                                                                        a: any,
                                                                                        b: any,
                                                                                ) =>
                                                                                    a[0]
                                                                                    - b[0],
                                                                            );

                                                                    // Remove duplicate timestamps more aggressively (keep last value for each timestamp)
                                                                    const timestampMap
                                                                        = new Map();

                                                                    cleanedData.forEach(
                                                                        (
                                                                                d: any,
                                                                        ) => {
                                                                            const timestamp
                                                                                = d[0];

                                                                            timestampMap.set(
                                                                                timestamp,
                                                                                d[1],
                                                                            ); // This automatically overwrites duplicates
                                                                        },
                                                                    );

                                                                    // Convert back to array format and sort
                                                                    let uniqueData
                                                                        = Array.from(
                                                                            timestampMap.entries(),
                                                                        )
                                                                            .map(
                                                                                ([
                                                                                    timestamp,
                                                                                    value,
                                                                                ]) => [
                                                                                    timestamp,
                                                                                    value,
                                                                                ],
                                                                            )
                                                                            .sort(
                                                                                (
                                                                                        a: any,
                                                                                        b: any,
                                                                                ) =>
                                                                                    a[0]
                                                                                    - b[0],
                                                                            );

                                                                    // Special handling for frame dimensions - use step-like behavior
                                                                    const isFrameDimension
                                                                        = name
                                                                            === 'frameWidth'
                                                                        || name
                                                                            === 'frameHeight';

                                                                    // For frame dimensions, extend each value until the next change
                                                                    if (
                                                                        isFrameDimension
                                                                        && uniqueData.length
                                                                            > 1
                                                                    ) {
                                                                        const extendedData: any[]
                                                                            = [];

                                                                        for (
                                                                            let i = 0;
                                                                            i
                                                                            < uniqueData.length;
                                                                            i++
                                                                        ) {
                                                                            const [
                                                                                currentTimestamp,
                                                                                currentValue,
                                                                            ]
                                                                                = uniqueData[
                                                                                    i
                                                                                ];

                                                                            extendedData.push(
                                                                                [
                                                                                    currentTimestamp,
                                                                                    currentValue,
                                                                                ],
                                                                            );

                                                                            // If there's a next point and the value is different, add a point just before the change
                                                                            if (
                                                                                i
                                                                                < uniqueData.length
                                                                                    - 1
                                                                            ) {
                                                                                const [
                                                                                    nextTimestamp,
                                                                                    nextValue,
                                                                                ]
                                                                                    = uniqueData[
                                                                                        i
                                                                                            + 1
                                                                                    ];

                                                                                if (
                                                                                    currentValue
                                                                                    !== nextValue
                                                                                ) {
                                                                                    // Add a point just 1ms before the next timestamp with the current value
                                                                                    extendedData.push(
                                                                                        [
                                                                                            nextTimestamp
                                                                                                - 1,
                                                                                            currentValue,
                                                                                        ],
                                                                                    );
                                                                                }
                                                                            }
                                                                        }
                                                                        uniqueData
                                                                            = extendedData;
                                                                    }

                                                                    return {
                                                                        mode: 'lines',
                                                                        name: name,
                                                                        visible:
                                                                            visibleSeries.includes(
                                                                                name,
                                                                            )
                                                                                ? true
                                                                                : 'legendonly',
                                                                        line: {
                                                                            width: 2,
                                                                            shape: isFrameDimension
                                                                                ? 'hv'
                                                                                : 'linear', // 'hv' creates step-like horizontal then vertical lines
                                                                            smoothing: 0,
                                                                        },
                                                                        connectgaps:
                                                                            !isFrameDimension, // Don't connect gaps for frame dimensions
                                                                        x: uniqueData.map(
                                                                            (
                                                                                    d: any,
                                                                            ) =>
                                                                                new Date(
                                                                                    d[0],
                                                                                ),
                                                                        ),
                                                                        y: uniqueData.map(
                                                                            (
                                                                                    d: any,
                                                                            ) =>
                                                                                d[1],
                                                                        ),
                                                                    };
                                                                });

                                                    if (traces.length === 0)
                                                        return null;

                                                    return (
                                                        <Accordion
                                                            key = { reportId }
                                                            sx = {{ mb: 2 }}>
                                                            <AccordionSummary
                                                                expandIcon = {
                                                                    <ExpandMoreIcon />
                                                                }
                                                                sx = {{
                                                                    bgcolor:
                                                                            'rgba(25, 118, 210, 0.08)',
                                                                    '&:hover':
                                                                            {
                                                                                bgcolor:
                                                                                    'rgba(25, 118, 210, 0.12)',
                                                                            },
                                                                }}>
                                                                <Box
                                                                    display = 'flex'
                                                                    alignItems = 'center'
                                                                    gap = { 1 }>
                                                                    <ChartIcon color = 'primary' />
                                                                    <Typography
                                                                        variant = 'subtitle1'
                                                                        fontWeight = 'medium'>
                                                                        {
                                                                            connectionId
                                                                        }{' '}
                                                                        type=
                                                                        {
                                                                            reportType
                                                                        }{' '}
                                                                        {
                                                                            reportId
                                                                        }
                                                                    </Typography>
                                                                    <Chip
                                                                        label = { `${traces.length} series` }
                                                                        size = 'small'
                                                                        color = 'primary'
                                                                        variant = 'outlined'/>
                                                                </Box>
                                                            </AccordionSummary>
                                                            <AccordionDetails>
                                                                <Plot
                                                                    data = {
                                                                        traces
                                                                    }
                                                                    layout = {{
                                                                        title: {
                                                                            text: `${connectionId} type=${reportType} ${reportId}`,
                                                                        },
                                                                        xaxis: {
                                                                            title: {
                                                                                text: 'Time',
                                                                            },
                                                                            type: 'date',
                                                                            tickformat:
                                                                                    '%H:%M:%S',
                                                                            showgrid: true,
                                                                            gridwidth: 1,
                                                                            gridcolor:
                                                                                    'rgba(128,128,128,0.2)',
                                                                        },
                                                                        yaxis: {
                                                                            title: {
                                                                                text: 'Value',
                                                                            },
                                                                            type: 'linear',
                                                                            showgrid: true,
                                                                            gridwidth: 1,
                                                                            gridcolor:
                                                                                    'rgba(128,128,128,0.2)',
                                                                        },
                                                                        height: 400,
                                                                        showlegend: true,
                                                                        legend: {
                                                                            orientation:
                                                                                    'h',
                                                                            y: -0.2,
                                                                        },
                                                                        margin: {
                                                                            t: 60,
                                                                            l: 60,
                                                                            r: 20,
                                                                            b: 120,
                                                                        },
                                                                        hovermode:
                                                                                'x unified',
                                                                    }}
                                                                    style = {{
                                                                        width: '100%',
                                                                    }}
                                                                    useResizeHandler = {
                                                                        true
                                                                    }
                                                                    config = {{
                                                                        displayModeBar: true,
                                                                        modeBarButtonsToRemove:
                                                                                [
                                                                                    'pan2d',
                                                                                    'lasso2d',
                                                                                    'select2d',
                                                                                    'autoScale2d',
                                                                                ],
                                                                        displaylogo: false,
                                                                    }}/>
                                                            </AccordionDetails>
                                                        </Accordion>
                                                    );
                                                })}

                                                {/* Raw Connection Stats - rtc-visualizer Style */}
                                                <Accordion>
                                                    <AccordionSummary
                                                        expandIcon = {
                                                            <ExpandMoreIcon />
                                                        }>
                                                        <Typography variant = 'subtitle2'>
                                                            🔍 Raw Stats (
                                                            {
                                                                connection
                                                                        .rawStats
                                                                        .length
                                                            }{' '}
                                                            entries)
                                                        </Typography>
                                                    </AccordionSummary>
                                                    <AccordionDetails>
                                                        <TableContainer
                                                            sx = {{
                                                                maxHeight: 400,
                                                            }}>
                                                            <Table
                                                                size = 'small'
                                                                stickyHeader>
                                                                <TableHead>
                                                                    <TableRow>
                                                                        <TableCell>
                                                                            <strong>
                                                                                Timestamp
                                                                            </strong>
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            <strong>
                                                                                Connection
                                                                                ID
                                                                            </strong>
                                                                        </TableCell>
                                                                        <TableCell>
                                                                            <strong>
                                                                                Data
                                                                                Preview
                                                                            </strong>
                                                                        </TableCell>
                                                                    </TableRow>
                                                                </TableHead>
                                                                <TableBody>
                                                                    {connection.rawStats
                                                                            .slice(
                                                                                0,
                                                                                20,
                                                                            )
                                                                            .map(
                                                                                (
                                                                                        stat: any,
                                                                                        index: number,
                                                                                ) => (
                                                                                    <TableRow
                                                                                        key = {
                                                                                            index
                                                                                        }>
                                                                                        <TableCell>
                                                                                            <Typography
                                                                                                variant = 'caption'
                                                                                                sx = {{
                                                                                                    fontFamily:
                                                                                                        'monospace',
                                                                                                }}>
                                                                                                {formatTime(
                                                                                                    stat.timestamp,
                                                                                                )}
                                                                                            </Typography>
                                                                                        </TableCell>
                                                                                        <TableCell>
                                                                                            <Typography
                                                                                                variant = 'caption'
                                                                                                sx = {{
                                                                                                    fontFamily:
                                                                                                        'monospace',
                                                                                                }}>
                                                                                                {stat.connectionId
                                                                                                    || 'PC_0'}
                                                                                            </Typography>
                                                                                        </TableCell>
                                                                                        <TableCell>
                                                                                            <Typography
                                                                                                variant = 'caption'
                                                                                                sx = {{
                                                                                                    fontFamily:
                                                                                                        'monospace',
                                                                                                    fontSize:
                                                                                                        '0.7rem',
                                                                                                }}>
                                                                                                {JSON.stringify(
                                                                                                    stat.data,
                                                                                                ).substring(
                                                                                                    0,
                                                                                                    100,
                                                                                                )}
                                                                                                ...
                                                                                            </Typography>
                                                                                        </TableCell>
                                                                                    </TableRow>
                                                                                ),
                                                                            )}
                                                                </TableBody>
                                                            </Table>
                                                        </TableContainer>
                                                    </AccordionDetails>
                                                </Accordion>
                                            </CardContent>
                                        </Card>
                                    );
                                });
                            })()}
                        </>
                    )}

                    {/* WebRTC Stats Section */}
                    {viewMode === 'tables'
                        && currentSession.stats.length > 0 && (
                        <Card sx = {{ mb: 3 }}>
                            <CardContent>
                                <Typography
                                    variant = 'h6'
                                    gutterBottom
                                    color = 'primary'>
                                    📊 WebRTC Statistics
                                </Typography>
                                <Typography
                                    variant = 'body2'
                                    color = 'textSecondary'
                                    gutterBottom>
                                    Real-time WebRTC statistics data from
                                    getStats() calls
                                </Typography>
                                <TableContainer sx = {{ maxHeight: 400 }}>
                                    <Table size = 'small' stickyHeader>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>
                                                    <strong>
                                                        Timestamp
                                                    </strong>
                                                </TableCell>
                                                <TableCell>
                                                    <strong>
                                                        Connection ID
                                                    </strong>
                                                </TableCell>
                                                <TableCell>
                                                    <strong>
                                                        Stats Data Preview
                                                    </strong>
                                                </TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {currentSession.stats
                                                    .slice(0, 20)
                                                    .map((stat, index) => (
                                                        <TableRow key = { index }>
                                                            <TableCell>
                                                                <Typography
                                                                    variant = 'caption'
                                                                    sx = {{
                                                                        fontFamily:
                                                                            'monospace',
                                                                    }}>
                                                                    {formatTime(
                                                                        stat.timestamp,
                                                                    )}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Typography
                                                                    variant = 'caption'
                                                                    sx = {{
                                                                        fontFamily:
                                                                            'monospace',
                                                                    }}>
                                                                    {stat.connectionId
                                                                        || 'N/A'}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Typography
                                                                    variant = 'caption'
                                                                    sx = {{
                                                                        fontFamily:
                                                                            'monospace',
                                                                        fontSize:
                                                                            '0.7rem',
                                                                        maxWidth: 300,
                                                                        overflow:
                                                                            'hidden',
                                                                        textOverflow:
                                                                            'ellipsis',
                                                                    }}>
                                                                    {JSON.stringify(
                                                                        stat.data,
                                                                    ).substring(
                                                                        0,
                                                                        150,
                                                                    )}
                                                                    {JSON.stringify(
                                                                        stat.data,
                                                                    ).length
                                                                        > 150
                                                                        && '...'}
                                                                </Typography>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                                {currentSession.stats.length > 20 && (
                                    <Typography
                                        variant = 'body2'
                                        color = 'textSecondary'
                                        textAlign = 'center'
                                        sx = {{ mt: 2 }}>
                                        ... and{' '}
                                        {currentSession.stats.length - 20}{' '}
                                        more stats entries
                                    </Typography>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Connection Events Section */}
                    {viewMode === 'tables'
                        && currentSession.connectionEvents.length > 0 && (
                        <Card sx = {{ mb: 3 }}>
                            <CardContent>
                                <Typography
                                    variant = 'h6'
                                    gutterBottom
                                    color = 'primary'>
                                    🔗 Connection Events
                                </Typography>
                                <Typography
                                    variant = 'body2'
                                    color = 'textSecondary'
                                    gutterBottom>
                                    WebRTC connection state changes and
                                    signaling events
                                </Typography>
                                <TableContainer sx = {{ maxHeight: 300 }}>
                                    <Table size = 'small' stickyHeader>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>
                                                    <strong>
                                                        Timestamp
                                                    </strong>
                                                </TableCell>
                                                <TableCell>
                                                    <strong>
                                                        Event Type
                                                    </strong>
                                                </TableCell>
                                                <TableCell>
                                                    <strong>
                                                        Connection ID
                                                    </strong>
                                                </TableCell>
                                                <TableCell>
                                                    <strong>Data</strong>
                                                </TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {currentSession.connectionEvents.map(
                                                    (event, index) => (
                                                        <TableRow key = { index }>
                                                            <TableCell>
                                                                <Typography
                                                                    variant = 'caption'
                                                                    sx = {{
                                                                        fontFamily:
                                                                            'monospace',
                                                                    }}>
                                                                    {formatTime(
                                                                        event.timestamp,
                                                                    )}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Chip
                                                                    label = {
                                                                        event.type
                                                                    }
                                                                    size = 'small'
                                                                    color = {
                                                                        event.type.includes(
                                                                            'ice',
                                                                        )
                                                                            ? 'info'
                                                                            : event.type.includes(
                                                                                    'connection',
                                                                            )
                                                                                ? 'primary'
                                                                                : event.type.includes(
                                                                                      'signaling',
                                                                                )
                                                                                    ? 'secondary'
                                                                                    : 'default'
                                                                    }/>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Typography
                                                                    variant = 'caption'
                                                                    sx = {{
                                                                        fontFamily:
                                                                            'monospace',
                                                                    }}>
                                                                    {event.connectionId
                                                                        || 'N/A'}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Typography
                                                                    variant = 'caption'
                                                                    sx = {{
                                                                        fontFamily:
                                                                            'monospace',
                                                                        fontSize:
                                                                            '0.7rem',
                                                                        maxWidth: 200,
                                                                    }}>
                                                                    {JSON.stringify(
                                                                        event.data,
                                                                    ).substring(
                                                                        0,
                                                                        100,
                                                                    )}
                                                                </Typography>
                                                            </TableCell>
                                                        </TableRow>
                                                    ),
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </CardContent>
                        </Card>
                    )}

                    {/* Media Events Section */}
                    {viewMode === 'tables'
                        && currentSession.mediaEvents.length > 0 && (
                        <Card sx = {{ mb: 3 }}>
                            <CardContent>
                                <Typography
                                    variant = 'h6'
                                    gutterBottom
                                    color = 'primary'>
                                    🎥 Media Events
                                </Typography>
                                <Typography
                                    variant = 'body2'
                                    color = 'textSecondary'
                                    gutterBottom>
                                    Audio and video track events (add,
                                    remove, mute, etc.)
                                </Typography>
                                <TableContainer sx = {{ maxHeight: 300 }}>
                                    <Table size = 'small' stickyHeader>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>
                                                    <strong>
                                                        Timestamp
                                                    </strong>
                                                </TableCell>
                                                <TableCell>
                                                    <strong>
                                                        Event Type
                                                    </strong>
                                                </TableCell>
                                                <TableCell>
                                                    <strong>
                                                        Track ID
                                                    </strong>
                                                </TableCell>
                                                <TableCell>
                                                    <strong>Data</strong>
                                                </TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {currentSession.mediaEvents.map(
                                                    (event, index) => (
                                                        <TableRow key = { index }>
                                                            <TableCell>
                                                                <Typography
                                                                    variant = 'caption'
                                                                    sx = {{
                                                                        fontFamily:
                                                                            'monospace',
                                                                    }}>
                                                                    {formatTime(
                                                                        event.timestamp,
                                                                    )}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Chip
                                                                    label = {
                                                                        event.type
                                                                    }
                                                                    size = 'small'
                                                                    color = {
                                                                        event.type
                                                                        === 'addTrack'
                                                                            ? 'success'
                                                                            : event.type
                                                                                === 'removeTrack'
                                                                                ? 'error'
                                                                                : event.type.includes(
                                                                                      'mute',
                                                                                )
                                                                                    ? 'warning'
                                                                                    : 'info'
                                                                    }/>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Typography
                                                                    variant = 'caption'
                                                                    sx = {{
                                                                        fontFamily:
                                                                            'monospace',
                                                                    }}>
                                                                    {event.trackId
                                                                        || 'N/A'}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Typography
                                                                    variant = 'caption'
                                                                    sx = {{
                                                                        fontFamily:
                                                                            'monospace',
                                                                        fontSize:
                                                                            '0.7rem',
                                                                        maxWidth: 200,
                                                                    }}>
                                                                    {JSON.stringify(
                                                                        event.data,
                                                                    ).substring(
                                                                        0,
                                                                        100,
                                                                    )}
                                                                </Typography>
                                                            </TableCell>
                                                        </TableRow>
                                                    ),
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </CardContent>
                        </Card>
                    )}

                    {/* Raw Data Accordion */}
                    <Accordion>
                        <AccordionSummary expandIcon = { <ExpandMoreIcon /> }>
                            <Typography variant = 'h6'>
                                🔍 Raw Event Data (
                                {currentSession.stats.length
                                    + currentSession.connectionEvents.length
                                    + currentSession.mediaEvents.length}{' '}
                                total events)
                            </Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                            <Box
                                sx = {{
                                    maxHeight: '50vh',
                                    overflow: 'auto',
                                    bgcolor: '#f9f9f9',
                                    border: '1px solid #e0e0e0',
                                    borderRadius: 1,
                                    p: 2,
                                }}>
                                {/* Combine and sort all events by timestamp */}
                                {[
                                    ...currentSession.stats.map(s => ({
                                        ...s,
                                        category: 'stats',
                                    })),
                                    ...currentSession.connectionEvents.map(
                                        c => ({
                                            ...c,
                                            category: 'connection',
                                        }),
                                    ),
                                    ...currentSession.mediaEvents.map(m => ({
                                        ...m,
                                        category: 'media',
                                    })),
                                ]
                                    .sort((a, b) => a.timestamp - b.timestamp)
                                    .slice(0, 50)
                                    .map((event: any, index) => (
                                        <Box
                                            key = { index }
                                            sx = {{
                                                mb: 1,
                                                pb: 1,
                                                borderBottom: '1px solid #eee',
                                            }}>
                                            <Typography
                                                variant = 'body2'
                                                sx = {{
                                                    fontFamily: 'monospace',
                                                    fontSize: '0.75rem',
                                                }}>
                                                <strong>
                                                    {formatTime(
                                                        event.timestamp,
                                                    )}
                                                </strong>{' '}
                                                -
                                                <Chip
                                                    label = { event.category }
                                                    size = 'small'
                                                    color = {
                                                        event.category
                                                        === 'stats'
                                                            ? 'info'
                                                            : event.category
                                                                === 'connection'
                                                                ? 'primary'
                                                                : 'success'
                                                    }
                                                    sx = {{ mx: 1 }}/>{' '}
                                                -
                                                {event.category === 'stats'
                                                    ? 'getstats'
                                                    : event.type
                                                      || 'unknown'}{' '}
                                                -
                                                {JSON.stringify(
                                                    event.data || event,
                                                    null,
                                                    2,
                                                ).slice(0, 300)}
                                                {JSON.stringify(
                                                    event.data || event,
                                                    null,
                                                    2,
                                                ).length > 300 && '...'}
                                            </Typography>
                                        </Box>
                                    ))}
                            </Box>
                        </AccordionDetails>
                    </Accordion>
                </>
            )}
        </Box>
    );
};

export default WebRTCStatsVisualizer;
