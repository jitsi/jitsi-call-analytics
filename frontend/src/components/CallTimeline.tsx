/**
 * Call Timeline Component
 * Interactive timeline visualization with participant tracks and events
 * Updated to remove overlapping participant details panel
 */

import {
    Analytics as AnalyticsIcon,
    ArrowBack as ArrowBackIcon,
    Computer as ComputerIcon,
    ExpandMore as ExpandMoreIcon,
    Mic as MicIcon,
    MicOff as MicOffIcon,
    Person as PersonIcon,
    ScreenShare as ScreenShareIcon,
    Smartphone as SmartphoneIcon,
    Videocam as VideocamIcon,
    VideocamOff as VideocamOffIcon,
} from '@mui/icons-material';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Box,
    Button,
    Chip,
    Divider,
    Grid,
    IconButton,
    List,
    ListItem,
    ListItemIcon,
    ListItemSecondaryAction,
    ListItemText,
    Paper,
    Typography,
} from '@mui/material';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { API_BASE_URL } from '../config/api';
import { AnalysisService, IAnalysisResult } from '../services/AnalysisService';
import {
    IParticipantDetails,
} from '../types/shared';

import TimelineVisualization from './TimelineVisualization';

// Get the PUBLIC_URL for proper subpath navigation
const PUBLIC_URL = process.env.PUBLIC_URL || '';

const CallTimeline: React.FC = () => {
    const { sessionId } = useParams<{ sessionId: string; }>();
    const location = useLocation();
    const navigate = useNavigate();

    // Get data from navigation state or URL parameters
    const searchParams = new URLSearchParams(location.search);
    const roomName
        = location.state?.analysisResult?.session.roomName
        || searchParams.get('roomName');

    // Get analysis result from navigation state or sessionStorage (for new tabs)
    const getStoredAnalysisResult = () => {
        if (location.state?.analysisResult) {
            return location.state.analysisResult;
        }
        // Check sessionStorage for new tab navigation
        if (sessionId) {
            const stored = sessionStorage.getItem(`analysis_${sessionId}`);

            if (stored) {
                try {
                    const parsed = JSON.parse(stored);

                    return parsed.analysisResult;
                } catch (e) {
                    console.warn('Failed to parse stored analysis result:', e);
                }
            }
        }

        return null;
    };

    const [ analysisResult, setAnalysisResult ] = useState<IAnalysisResult | null>(getStoredAnalysisResult());
    const [ loading, setLoading ] = useState(!analysisResult);
    const loadSession = async () => {
        if (!sessionId) return;

        try {
            setLoading(true);

            // Check if this is RTCStats mode or has dumpsPath (uploaded files work the same way now)
            const isRTCStats = searchParams.get('rtcstats') === 'true';
            const conferenceId = searchParams.get('conferenceId');
            const environment = searchParams.get('environment');
            const dumpsPath = searchParams.get('dumpsPath');

            if (isRTCStats && conferenceId && environment) {
                // For RTCStats conferences, use the RTCStats analysis service
                console.log('Loading RTCStats conference data:', { conferenceId, environment });
                try {
                    const result = await AnalysisService.analyzeRTCStatsConference(conferenceId, environment);

                    console.log('✅ Loaded RTCStats conference data with', result.session.events.length, 'events');
                    setAnalysisResult(result);

                    return;
                } catch (rtcStatsError) {
                    console.error('Failed to load RTCStats conference:', rtcStatsError);
                }
            }

            try {
                console.log('Attempting to load real session data...');
                const response = await fetch(`${API_BASE_URL}/api/v1/sessions/analyze/real`);

                if (response.ok) {
                    const realData = await response.json();

                    if (realData.success) {
                        console.log('✅ Loaded real session data with', realData.data.session.events.length, 'events');
                        setAnalysisResult({
                            session: {
                                ...realData.data.session,
                                sessionId: sessionId, // Keep the requested sessionId for URL consistency
                                roomName: roomName || realData.data.session.roomName
                            },
                            stats: realData.data.stats,
                            timeline: realData.data.timeline || {}
                        });

                        return;
                    }
                }
            } catch (realDataError) {
                console.log('Could not load real session data:', realDataError);
            }

            // If dumpsPath is provided, use it (works for both RTCStats and uploaded dumps)
            if (dumpsPath) {
                try {
                    const result = await AnalysisService.analyzeMeeting(dumpsPath);

                    console.log('✅ Loaded session data from dumpsPath');
                    setAnalysisResult(result);

                    return;
                } catch (dumpsError) {
                    console.log('Could not load from dumpsPath:', dumpsError);
                }
            }

            try {
                const session = await AnalysisService.getSession(sessionId);

                console.log('✅ Loaded session by ID:', sessionId);

                // Create analysis result from existing session
                setAnalysisResult({
                    session,
                    stats: {
                        backendComponents: { jibris: [], jvbs: [], shards: [] },
                        meetingDuration: (session.endTime || Date.now()) - session.startTime,
                        peakConcurrent: session.participants.length,
                        qualityMetrics: {
                            audioQuality: 4.3,
                            avgJitter: 8,
                            avgPacketLoss: 1.2,
                            avgRTT: 45,
                            connectionSuccessRate: 98.5,
                            mediaInterruptions: 2,
                            networkStability: 4.2,
                            overallScore: 4.2,
                            participantDropouts: 0,
                            videoQuality: 4.1,
                        },
                        totalUsers: session.participants.length,
                    },
                    timeline: {},
                });

                return;
            } catch (sessionError) {
                console.log('Session not found by ID, will use mock data as last resort');
            }

            // LAST RESORT: Generate mock data only if no real data available
            console.warn('⚠️  No real data available, generating mock data for:', sessionId);
            const mockUrl = roomName
                ? `https://meet.jit.si/${roomName}`
                : `mock-session-${sessionId}`;
            const mockResult = await AnalysisService.analyzeMeeting(mockUrl);

            // Update with URL parameter data
            if (roomName && mockResult.session) {
                mockResult.session.roomName = roomName;
                mockResult.session.sessionId = sessionId;
            }

            setAnalysisResult(mockResult);

        } catch (error) {
            console.error('Failed to load any session data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!analysisResult && sessionId) {
            loadSession();
        }
    }, [ sessionId, analysisResult ]);
    const formatDuration = (ms: number) => {
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);

        return hours > 0
            ? `${hours}h ${minutes}m ${seconds}s`
            : `${minutes}m ${seconds}s`;
    };

    const getClientIcon = (clientType: string) => {
        switch (clientType) {
        case 'mobile':
            return <SmartphoneIcon fontSize = 'small' />;
        case 'desktop':
            return <ComputerIcon fontSize = 'small' />;
        default:
            return <ComputerIcon fontSize = 'small' />;
        }
    };

    const getRoleColor = (
            role: string,
    ): 'primary' | 'secondary' | 'success' => {
        switch (role) {
        case 'moderator':
            return 'primary';
        case 'presenter':
            return 'secondary';
        default:
            return 'success';
        }
    };

    const getEventIcon = (eventType: string) => {
        switch (eventType) {
        case 'screenshare':
            return <ScreenShareIcon fontSize = 'small' />;
        case 'mute':
            return <MicOffIcon fontSize = 'small' />;
        case 'unmute':
            return <MicIcon fontSize = 'small' />;
        case 'videoEnable':
            return <VideocamIcon fontSize = 'small' />;
        case 'videoDisable':
            return <VideocamOffIcon fontSize = 'small' />;
        default:
            return <PersonIcon fontSize = 'small' />;
        }
    };

    const handleParticipantDetails = (participant: IParticipantDetails) => {
        // Check if this is an RTCStats conference
        const isRTCStats = searchParams.get('rtcstats') === 'true';
        const conferenceId = searchParams.get('conferenceId');
        const environment = searchParams.get('environment');
        const dumpsPath = searchParams.get('dumpsPath');

        let url;

        if (isRTCStats && conferenceId) {
            // For RTCStats conferences, pass RTCStats parameters
            url = `${PUBLIC_URL}/endpoint/${encodeURIComponent(participant.displayName)}?rtcstats=true&conferenceId=${encodeURIComponent(conferenceId)}&environment=${encodeURIComponent(environment || 'prod')}&displayName=${encodeURIComponent(participant.displayName)}`;
        } else {
            // For dump analysis (RTCStats or uploaded), use dumpsPath
            const params = new URLSearchParams({
                sessionId: sessionId || '',
                roomName: roomName || '',
                displayName: participant.displayName
            });

            // Pass dumpsPath for both RTCStats downloads and uploaded dumps
            if (dumpsPath) {
                params.set('dumpsPath', dumpsPath);
            }

            url = `${PUBLIC_URL}/endpoint/${encodeURIComponent(participant.displayName)}?${params.toString()}`;
        }

        console.log('Opening endpoint details:', url);
        window.open(url, '_blank');
    };

    if (loading) {
        return (
            <Box
                display = 'flex'
                justifyContent = 'center'
                alignItems = 'center'
                minHeight = '400px'>
                <Typography>Loading timeline...</Typography>
            </Box>
        );
    }

    if (!analysisResult) {
        return (
            <Box textAlign = 'center' py = { 4 }>
                <Typography variant = 'h6' color = 'error'>
                    Session not found
                </Typography>
            </Box>
        );
    }

    const { session, stats } = analysisResult;

    return (
        <Box>
            {/* Header */}
            <Box mb = { 3 }>
                <Box display = 'flex' alignItems = 'center' gap = { 2 } mb = { 2 }>
                    <IconButton
                        onClick = { () =>
                            navigate('/', { state: { analysisResult } })
                        }
                        size = 'small'
                        aria-label = 'Back to analysis results'>
                        <ArrowBackIcon />
                    </IconButton>
                    <Typography variant = 'h4'>Call Timeline Analysis</Typography>
                </Box>
                <Typography variant = 'h6' color = 'textSecondary'>
                    Session: {session?.roomName || roomName || sessionId} •
                    Duration: {formatDuration(stats?.meetingDuration || 0)}
                </Typography>
            </Box>

            <Grid container spacing = { 3 }>
                {/* Timeline Overview */}
                <Grid item xs = { 12 }>
                    <Paper sx = {{ p: 3 }}>
                        <Typography variant = 'h6' gutterBottom>
                            Session Overview
                        </Typography>
                        <Grid container spacing = { 2 }>
                            <Grid item>
                                <Chip
                                    label = { `${stats.totalUsers} participants` }
                                    color = 'primary'/>
                            </Grid>
                            <Grid item>
                                <Chip
                                    label = { `${stats.peakConcurrent} peak concurrent` }
                                    color = 'secondary'/>
                            </Grid>
                            <Grid item>
                                <Chip
                                    label = { formatDuration(
                                        stats.meetingDuration,
                                    ) }
                                    color = 'success'/>
                            </Grid>
                        </Grid>
                    </Paper>
                </Grid>

                {/* Timeline Visualization */}
                <Grid item xs = { 12 }>
                    <Paper sx = {{ p: 3 }}>
                        <Typography variant = 'h6' gutterBottom>
                            Participant Timeline
                        </Typography>
                        <TimelineVisualization
                            session = { session }
                            onParticipantSelect = { handleParticipantDetails }
                            selectedParticipant = { null }/>
                    </Paper>
                </Grid>

                {/* Participants List */}
                <Grid item xs = { 12 } md = { 6 }>
                    <Paper sx = {{ p: 3 }}>
                        <Typography variant = 'h6' gutterBottom>
                            Participants ({session.participants.length})
                        </Typography>
                        <List>
                            {session.participants.map((participant, index) => (
                                <React.Fragment key = { participant.participantId }>
                                    <ListItem>
                                        <ListItemIcon>
                                            {getClientIcon(
                                                participant.clientInfo.type,
                                            )}
                                        </ListItemIcon>
                                        <ListItemText
                                            primary = {
                                                <Box
                                                    display = 'flex'
                                                    alignItems = 'center'
                                                    gap = { 1 }>
                                                    <Typography variant = 'subtitle1'>
                                                        {
                                                            participant.displayName
                                                        }
                                                    </Typography>
                                                    <Chip
                                                        label = { participant.role }
                                                        size = 'small'
                                                        color = { getRoleColor(
                                                            participant.role,
                                                        ) }/>
                                                </Box>
                                            }
                                            primaryTypographyProps = {{ component: 'div' }}
                                            secondary = {
                                                <Box>
                                                    {participant.statisticsDisplayName && (
                                                        <Typography
                                                            variant = 'body2'
                                                            color = 'textSecondary'>
                                                            {participant.statisticsDisplayName}
                                                        </Typography>
                                                    )}
                                                    <Typography
                                                        variant = 'body2'
                                                        color = 'textSecondary'>
                                                        {
                                                            participant.clientInfo
                                                                .browser
                                                        }{' '}
                                                        •{' '}
                                                        {participant.clientInfo.os}{' '}
                                                        • Duration:{' '}
                                                        {formatDuration(
                                                            (participant.leaveTime
                                                                || session.endTime
                                                                || Date.now())
                                                                - participant.joinTime,
                                                        )}
                                                    </Typography>
                                                </Box>
                                            }
                                            secondaryTypographyProps = {{ component: 'div' }}/>
                                        <ListItemSecondaryAction>
                                            <Button
                                                size = 'small'
                                                variant = 'outlined'
                                                startIcon = { <AnalyticsIcon /> }
                                                onClick = { () =>
                                                    handleParticipantDetails(
                                                        participant,
                                                    )
                                                }
                                                sx = {{ fontSize: '0.75rem' }}>
                                                Details
                                            </Button>
                                        </ListItemSecondaryAction>
                                    </ListItem>
                                    {index
                                        < session.participants.length - 1 && (
                                        <Divider />
                                    )}
                                </React.Fragment>
                            ))}
                        </List>
                    </Paper>
                </Grid>

                {/* Session Events */}
                <Grid item xs = { 12 } md = { 6 }>
                    <Paper sx = {{ p: 3 }}>
                        <Typography variant = 'h6' gutterBottom>
                            Session Events
                        </Typography>
                        <Accordion>
                            <AccordionSummary expandIcon = { <ExpandMoreIcon /> }>
                                <Typography>
                                    All Events ({session.events.length})
                                </Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                                <List dense>
                                    {session.events
                                        .slice(0, 20)
                                        .map((event, index) => (
                                            <ListItem key = { index }>
                                                <ListItemIcon>
                                                    {getEventIcon(
                                                        event.eventType,
                                                    )}
                                                </ListItemIcon>
                                                <ListItemText
                                                    primary = { `${event.eventType.charAt(0).toUpperCase() + event.eventType.slice(1)}` }
                                                    secondary = {
                                                        <Typography
                                                            variant = 'body2'
                                                            color = 'textSecondary'>
                                                            {new Date(
                                                                event.timestamp,
                                                            ).toLocaleTimeString()}{' '}
                                                            •
                                                            {session.participants.find(
                                                                p =>
                                                                    p.participantId
                                                                    === event.participantId,
                                                            )?.displayName
                                                                || 'Unknown'}
                                                        </Typography>
                                                    }
                                                    secondaryTypographyProps = {{ component: 'div' }}/>
                                            </ListItem>
                                        ))}
                                    {session.events.length > 20 && (
                                        <ListItem>
                                            <ListItemText
                                                secondary = {
                                                    <Typography
                                                        variant = 'body2'
                                                        color = 'textSecondary'
                                                        align = 'center'>
                                                        ... and{' '}
                                                        {session.events.length
                                                            - 20}{' '}
                                                        more events
                                                    </Typography>
                                                }
                                                secondaryTypographyProps = {{ component: 'div' }}/>
                                        </ListItem>
                                    )}
                                </List>
                            </AccordionDetails>
                        </Accordion>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
};

export default CallTimeline;
