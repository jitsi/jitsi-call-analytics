/**
 * Timeline Visualization Component
 * Interactive timeline with participant tracks and events using SVG
 */

import { Box, Checkbox, FormControlLabel, Grid, Tooltip, Typography, useTheme } from '@mui/material';
import React, { useMemo, useState } from 'react';

import {
    ICallEvent,
    ICallSession,
    IParticipantDetails,
} from '../types/shared';

interface ITimelineVisualizationProps {
    onParticipantSelect: (participant: IParticipantDetails) => void;
    selectedParticipant: IParticipantDetails | null;
    session: ICallSession;
}

interface ITimelineTrack {
    events: ICallEvent[];
    participant: IParticipantDetails;
    yPosition: number;
}

const TimelineVisualization: React.FC<ITimelineVisualizationProps> = ({
    session,
    onParticipantSelect,
    selectedParticipant,
}) => {
    const theme = useTheme();

    // Timeline dimensions and configuration
    const TIMELINE_WIDTH = 1200; // Increased from 800 for full width
    const TRACK_HEIGHT = 40;
    const TRACK_SPACING = 10;
    const MARGIN_LEFT = 250; // Increased from 200 to accommodate longer names
    const MARGIN_TOP = 20;

    // Event filtering state
    const [ eventFilters, setEventFilters ] = useState<{ [key: string]: boolean; }>({
        bwe_issue: true,
        ice_restart: true,
        connectionIssue: true,
        join: true,
        leave: true,
        screenshare: true,
        mute: true,
        dominant_speaker: true,
        video: true
    });

    const timelineBounds = useMemo(() => {
        const startTime = session.startTime;
        const endTime = session.endTime || Date.now();

        return { startTime, endTime, duration: endTime - startTime };
    }, [ session ]);

    const isEventFiltered = (event: ICallEvent): boolean => {
        // Handle network issues with subTypes
        if (event.eventType === 'networkIssue' && event.metadata?.subType) {
            const subType = event.metadata.subType;

            // Map BWE-related subTypes to bwe_issue filter
            if (subType === 'bwe_issue' || subType === 'remoteSourceSuspended' || subType === 'remoteSourceInterrupted') {
                return eventFilters.bwe_issue;
            }

            return eventFilters[subType as keyof typeof eventFilters] || false;
        }

        // Handle other event types
        switch (event.eventType) {
        case 'connectionIssue':
            return eventFilters.connectionIssue;
        case 'networkIssue':
            // Show only ICE restart events - BWE issues are now mediaInterruption
            return event.metadata?.subType === 'ice_restart' ? eventFilters.ice_restart : false;
        case 'join':
        case 'leave':
            return eventFilters.join; // Same filter for both join/leave
        case 'screenshare':
            return eventFilters.screenshare;
        case 'mediaInterruption':
            // BWE issues - map to bwe_issue filter
            return eventFilters.bwe_issue;
        default:
            return false; // Hide unknown events by default
        }
    };

    const tracks = useMemo((): ITimelineTrack[] => {
        return session.participants.map((participant, index) => ({
            participant,
            events: session.events.filter(
                e => e.participantId === participant.participantId && isEventFiltered(e),
            ),
            yPosition: MARGIN_TOP + index * (TRACK_HEIGHT + TRACK_SPACING),
        }));
    }, [ session, eventFilters ]);

    const BOTTOM_MARGIN = 40; // Space for bottom timestamps
    const totalHeight
        = MARGIN_TOP
        + tracks.length * (TRACK_HEIGHT + TRACK_SPACING)
        + BOTTOM_MARGIN;

    const timeToX = (timestamp: number): number => {
        const progress
            = (timestamp - timelineBounds.startTime) / timelineBounds.duration;

        return MARGIN_LEFT + progress * TIMELINE_WIDTH;
    };

    const formatTime = (timestamp: number): string => {
        return new Date(timestamp).toLocaleTimeString();
    };

    const formatDuration = (ms: number): string => {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);

        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const getClientTypeIcon = (clientType: string): string => {
        switch (clientType) {
        case 'mobile':
            return '📱';
        case 'desktop':
            return '🖥️';
        default:
            return '💻';
        }
    };

    const getRoleIcon = (role: string): string => {
        switch (role) {
        case 'moderator':
            return '🔧';
        case 'presenter':
            return '🎤';
        default:
            return '👤';
        }
    };


    const getEventColor = (event: any): string => {
        // Handle network issues with different colors based on subType
        if (event.eventType === 'networkIssue' && event.metadata?.subType) {
            switch (event.metadata.subType) {
            case 'bwe_issue':
            case 'remoteSourceSuspended':
            case 'remoteSourceInterrupted':
                return '#FF6B35'; // Orange-red for all BWE issues
            case 'ice_restart':
                return '#FF9800'; // Orange for ICE restarts
            default:
                return theme.palette.error.main; // Default red for other network issues
            }
        }

        // Handle mediaInterruption events (BWE issues)
        if (event.eventType === 'mediaInterruption') {
            return '#FF6B35'; // Orange-red for BWE issues
        }

        const eventType = typeof event === 'string' ? event : event.eventType;

        switch (eventType) {
        case 'join':
            return theme.palette.success.main;
        case 'leave':
            return theme.palette.error.main;
        case 'screenshare':
            return theme.palette.info.main;
        case 'mute':
            return theme.palette.warning.main;
        case 'unmute':
            return theme.palette.success.main;
        case 'audio_mute':
            return theme.palette.warning.main;
        case 'audio_unmute':
            return theme.palette.success.main;
        case 'dominant_speaker_start':
            return theme.palette.secondary.main;
        case 'dominant_speaker_stop':
            return theme.palette.secondary.dark;
        case 'videoEnable':
            return theme.palette.info.main;
        case 'videoDisable':
            return theme.palette.warning.main;
        case 'connectionIssue':
            return '#FF9800'; // Amber for connection issues
        default:
            return theme.palette.grey[500];
        }
    };

    const getEventLabel = (event: any): string => {
        if (event.eventType === 'networkIssue' && event.metadata?.subType) {
            switch (event.metadata.subType) {
            case 'bwe_issue':
            case 'remoteSourceSuspended':
            case 'remoteSourceInterrupted':
                return 'BWE Issue';
            case 'ice_restart':
                return 'ICE Restart';
            default:
                return 'Network Issue';
            }
        }

        // Handle mediaInterruption events (BWE issues)
        if (event.eventType === 'mediaInterruption') {
            return 'BWE Issue';
        }

        switch (event.eventType) {
        case 'connectionIssue':
            return 'Connection Issue';
        case 'join':
            return 'Joined';
        case 'leave':
            return 'Left';
        case 'screenshare':
            return 'Screen Share';
        case 'mute':
            return 'Muted';
        case 'unmute':
            return 'Unmuted';
        case 'dominant_speaker_start':
            return 'Started Speaking';
        case 'dominant_speaker_stop':
            return 'Stopped Speaking';
        default:
            return event.eventType || 'Unknown Event';
        }
    };

    return (
        <Box>
            {/* Timeline Header */}
            <Box mb = { 2 }>
                <Typography variant = 'subtitle1' gutterBottom>
                    Session Duration: {formatDuration(timelineBounds.duration)}{' '}
                    | From {formatTime(timelineBounds.startTime)} to{' '}
                    {formatTime(timelineBounds.endTime)}
                </Typography>
            </Box>

            {/* SVG Timeline */}
            <Box
                sx = {{
                    overflowX: 'auto',
                    border: '1px solid #e0e0e0',
                    borderRadius: 1,
                }}>
                <svg
                    width = { MARGIN_LEFT + TIMELINE_WIDTH + 10 }
                    height = { totalHeight }
                    style = {{ background: '#fafafa' }}>
                    {/* Timeline axis at bottom */}
                    <line
                        x1 = { MARGIN_LEFT }
                        y1 = { totalHeight - BOTTOM_MARGIN + 10 }
                        x2 = { MARGIN_LEFT + TIMELINE_WIDTH }
                        y2 = { totalHeight - BOTTOM_MARGIN + 10 }
                        stroke = { theme.palette.divider }
                        strokeWidth = { 2 }/>

                    {/* Time markers at bottom with vertical grid lines */}
                    {[ 0, 0.25, 0.5, 0.75, 1 ].map((progress, index) => {
                        const x = MARGIN_LEFT + progress * TIMELINE_WIDTH;
                        const timestamp
                            = timelineBounds.startTime
                            + progress * timelineBounds.duration;
                        const axisY = totalHeight - BOTTOM_MARGIN + 10;

                        return (
                            <g key = { index }>
                                {/* Vertical grid line */}
                                <line
                                    x1 = { x }
                                    y1 = { MARGIN_TOP }
                                    x2 = { x }
                                    y2 = { axisY }
                                    stroke = { theme.palette.divider }
                                    strokeWidth = { 0.5 }
                                    strokeDasharray = '2,2'
                                    opacity = { 0.3 }/>
                                {/* Tick mark */}
                                <line
                                    x1 = { x }
                                    y1 = { axisY - 5 }
                                    x2 = { x }
                                    y2 = { axisY + 5 }
                                    stroke = { theme.palette.text.secondary }
                                    strokeWidth = { 1 }/>
                                {/* Timestamp label */}
                                <text
                                    x = { x }
                                    y = { axisY + 18 }
                                    textAnchor = 'middle'
                                    fontSize = '11'
                                    fill = { theme.palette.text.primary }
                                    fontWeight = '500'>
                                    {formatTime(timestamp).slice(0, 5)}
                                </text>
                            </g>
                        );
                    })}

                    {/* Participant tracks */}
                    {tracks.map(track => {
                        const { participant } = track;
                        const isSelected
                            = selectedParticipant?.participantId
                            === participant.participantId;
                        const trackY = track.yPosition;

                        // Participant session bar
                        // Clamp sessionStartX to be at least at MARGIN_LEFT to ensure visibility
                        const rawSessionStartX = timeToX(participant.joinTime);
                        const sessionStartX = Math.max(MARGIN_LEFT, rawSessionStartX);
                        const sessionEndX = timeToX(
                            participant.leaveTime || timelineBounds.endTime,
                        );
                        // Calculate width from the raw start position to ensure proper bar length
                        const sessionWidth = sessionEndX - rawSessionStartX;

                        return (
                            <g key = { participant.participantId }>
                                {/* Participant label */}
                                <rect
                                    x = { 0 }
                                    y = { trackY - 2 }
                                    width = { MARGIN_LEFT - 10 }
                                    height = { TRACK_HEIGHT + 4 }
                                    fill = {
                                        isSelected
                                            ? theme.palette.primary.light
                                            : 'transparent'
                                    }
                                    rx = { 4 }
                                    style = {{ cursor: 'pointer' }}
                                    onClick = { () =>
                                        onParticipantSelect(participant)
                                    }/>

                                {/* Display name with truncation for long names */}
                                <Tooltip
                                    title = { `${participant.displayName}` }
                                    arrow>
                                    <text
                                        x = { 10 }
                                        y = { trackY + 12 }
                                        fontSize = '12'
                                        fontWeight = { isSelected ? 'bold' : 'normal' }
                                        fill = { theme.palette.text.primary }
                                        style = {{ cursor: 'pointer' }}
                                        onClick = { () =>
                                            onParticipantSelect(participant)
                                        }>
                                        {getRoleIcon(participant.role)}{' '}
                                        {participant.displayName.length > 28
                                            ? `${participant.displayName.substring(0, 28)}...`
                                            : participant.displayName}
                                    </text>
                                </Tooltip>

                                {participant.statisticsDisplayName && (
                                    <text
                                        x = { 10 }
                                        y = { trackY + 26 }
                                        fontSize = '10'
                                        fill = { theme.palette.text.secondary }>
                                        {getClientTypeIcon(
                                            participant.clientInfo.type,
                                        )}{' '}
                                        {participant.statisticsDisplayName.length > 35
                                            ? `${participant.statisticsDisplayName.substring(0, 35)}...`
                                            : participant.statisticsDisplayName}
                                    </text>
                                )}

                                {/* Session duration bar */}
                                <rect
                                    x = { sessionStartX }
                                    y = { trackY + 5 }
                                    width = { sessionWidth }
                                    height = { 8 }
                                    fill = {
                                        isSelected
                                            ? theme.palette.primary.main
                                            : theme.palette.grey[400]
                                    }
                                    rx = { 4 }
                                    style = {{ cursor: 'pointer' }}
                                    onClick = { () =>
                                        onParticipantSelect(participant)
                                    }/>

                                {/* Screen share periods */}
                                {eventFilters.screenshare && participant.mediaEvents
                                    .filter(
                                        event =>
                                            event.type === 'screenshare_start',
                                    )
                                    .map((event, index) => {
                                        const startX = timeToX(event.timestamp);
                                        const endEvent
                                            = participant.mediaEvents.find(
                                                e =>
                                                    e.type
                                                        === 'screenshare_stop'
                                                    && e.timestamp
                                                        > event.timestamp,
                                            );
                                        const endX = endEvent
                                            ? timeToX(endEvent.timestamp)
                                            : sessionEndX;
                                        const width = endX - startX;

                                        return (
                                            <rect
                                                key = { index }
                                                x = { startX }
                                                y = { trackY + 15 }
                                                width = { width }
                                                height = { 4 }
                                                fill = { theme.palette.info.main }
                                                rx = { 2 }/>
                                        );
                                    })}

                                {/* Dominant speaker periods */}
                                {eventFilters.dominant_speaker && participant.mediaEvents
                                    .filter(
                                        event =>
                                            event.type === 'dominant_speaker_start',
                                    )
                                    .map((event, index) => {
                                        const startX = timeToX(event.timestamp);
                                        const endEvent
                                            = participant.mediaEvents.find(
                                                e =>
                                                    e.type
                                                        === 'dominant_speaker_stop'
                                                    && e.timestamp
                                                        > event.timestamp,
                                            );
                                        const endX = endEvent
                                            ? timeToX(endEvent.timestamp)
                                            : sessionEndX;
                                        const width = endX - startX;

                                        return (
                                            <rect
                                                key = { `dominant-${index}` }
                                                x = { startX }
                                                y = { trackY + 20 }
                                                width = { width }
                                                height = { 4 }
                                                fill = { theme.palette.secondary.main }
                                                rx = { 2 }/>
                                        );
                                    })}


                                {/* Events */}
                                {track.events.map((event, eventIndex) => {
                                    const x = timeToX(event.timestamp);

                                    const centerY = trackY + (event.eventType === 'join' || event.eventType === 'leave' ? 9 : 20);
                                    const color = getEventColor(event);

                                    // Different shapes for different event types
                                    let shape;

                                    if (event.eventType === 'networkIssue' && event.metadata?.subType) {
                                        switch (event.metadata.subType) {
                                        case 'bwe_issue':
                                            // Diamond for BWE issues (larger)
                                            shape = <polygon points = { `${x},${centerY - 6} ${x + 6},${centerY} ${x},${centerY + 6} ${x - 6},${centerY}` } fill = { color } stroke = 'white' strokeWidth = { 1 }/>;
                                            break;
                                        case 'remoteSourceSuspended':
                                            // Square for remote source suspended (larger)
                                            shape = <rect x = { x - 5 } y = { centerY - 5 } width = { 10 } height = { 10 } fill = { color } stroke = 'white' strokeWidth = { 1 }/>;
                                            break;
                                        case 'remoteSourceInterrupted':
                                            // Triangle for remote source interrupted (larger)
                                            shape = <polygon points = { `${x},${centerY - 6} ${x + 5},${centerY + 3} ${x - 5},${centerY + 3}` } fill = { color } stroke = 'white' strokeWidth = { 1 }/>;
                                            break;
                                        case 'ice_restart':
                                            // Hexagon for ICE restart events
                                            shape = <polygon points = { `${x},${centerY - 5} ${x + 4},${centerY - 2.5} ${x + 4},${centerY + 2.5} ${x},${centerY + 5} ${x - 4},${centerY + 2.5} ${x - 4},${centerY - 2.5}` } fill = { color } stroke = 'white' strokeWidth = { 1 }/>;
                                            break;
                                        default:
                                            // Circle for generic network issues (larger)
                                            shape = <circle cx = { x } cy = { centerY } r = { 5 } fill = { color } stroke = 'white' strokeWidth = { 1 }/>;
                                        }
                                    } else {
                                        switch (event.eventType) {
                                        case 'join':
                                            // Arrow pointing right for join events (person entering) - larger
                                            shape = (
                                                <polygon
                                                    points = { `${x - 7},${centerY - 5} ${x - 7},${centerY - 2} ${x + 2},${centerY - 2} ${x + 7},${centerY} ${x + 2},${centerY + 2} ${x - 7},${centerY + 2} ${x - 7},${centerY + 5}` }
                                                    fill = { color }
                                                    stroke = 'white'
                                                    strokeWidth = { 1 }/>
                                            );
                                            break;
                                        case 'leave':
                                            // Arrow pointing left for leave events (person exiting) - larger
                                            shape = (
                                                <polygon
                                                    points = { `${x + 7},${centerY - 5} ${x + 7},${centerY - 2} ${x - 2},${centerY - 2} ${x - 7},${centerY} ${x - 2},${centerY + 2} ${x + 7},${centerY + 2} ${x + 7},${centerY + 5}` }
                                                    fill = { color }
                                                    stroke = 'white'
                                                    strokeWidth = { 1 }/>
                                            );
                                            break;
                                        case 'connectionIssue':
                                            // Hexagon for connection issues (larger)
                                            shape = <polygon points = { `${x},${centerY - 5} ${x + 4},${centerY - 2.5} ${x + 4},${centerY + 2.5} ${x},${centerY + 5} ${x - 4},${centerY + 2.5} ${x - 4},${centerY - 2.5}` } fill = { color } stroke = 'white' strokeWidth = { 1 }/>;
                                            break;
                                        case 'mediaInterruption':
                                            // Diamond for BWE issues (larger)
                                            shape = (
                                                <polygon
                                                    points = { `${x},${centerY - 6} ${x + 6},${centerY} ${x},${centerY + 6} ${x - 6},${centerY}` }
                                                    fill = { color }
                                                    stroke = 'white'
                                                    strokeWidth = { 1 }/>
                                            );
                                            break;
                                        default:
                                            // Circle for other events (larger)
                                            shape = <circle cx = { x } cy = { centerY } r = { 5 } fill = { color } stroke = 'white' strokeWidth = { 1 }/>;
                                        }
                                    }

                                    return (
                                        <Tooltip
                                            key = { eventIndex }
                                            title = { `${getEventLabel(event)} at ${formatTime(event.timestamp)}` }
                                            arrow>
                                            <g style = {{ cursor: 'pointer' }}>
                                                {shape}
                                            </g>
                                        </Tooltip>
                                    );
                                })}

                                {/* Video Events on timeline */}
                                {eventFilters.video && participant.mediaEvents
                                    .filter(event =>
                                        event.type === 'video_enable' || event.type === 'video_disable'
                                    )
                                    .map((event, mediaEventIndex) => {
                                        const x = timeToX(event.timestamp);
                                        const eventType = event.type === 'video_enable' ? 'videoEnable' : 'videoDisable';
                                        const displayText = event.type === 'video_enable' ? 'Video Started' : 'Video Stopped';

                                        return (
                                            <Tooltip
                                                key = { `video-${mediaEventIndex}` }
                                                title = { `${displayText} at ${formatTime(event.timestamp)}` }
                                                arrow>
                                                <circle
                                                    cx = { x }
                                                    cy = { trackY + 9 }
                                                    r = { 5 }
                                                    fill = { getEventColor(eventType) }
                                                    stroke = 'white'
                                                    strokeWidth = { 1 }
                                                    style = {{ cursor: 'pointer' }}/>
                                            </Tooltip>
                                        );
                                    })}

                                {/* Audio Events on timeline */}
                                {eventFilters.mute && participant.mediaEvents
                                    .filter(event =>
                                        event.type === 'audio_mute' || event.type === 'audio_unmute'
                                    )
                                    .map((event, mediaEventIndex) => {
                                        const x = timeToX(event.timestamp);
                                        const eventType = event.type === 'audio_mute' ? 'audio_mute' : 'audio_unmute';
                                        const displayText = event.type === 'audio_mute' ? 'Audio Muted' : 'Audio Unmuted';

                                        return (
                                            <Tooltip
                                                key = { `audio-${mediaEventIndex}` }
                                                title = { `${displayText} at ${formatTime(event.timestamp)}` }
                                                arrow>
                                                <circle
                                                    cx = { x }
                                                    cy = { trackY + 9 }
                                                    r = { 5 }
                                                    fill = { getEventColor(eventType) }
                                                    stroke = 'white'
                                                    strokeWidth = { 1 }
                                                    style = {{ cursor: 'pointer' }}/>
                                            </Tooltip>
                                        );
                                    })}
                            </g>
                        );
                    })}
                </svg>
            </Box>

            {/* Legend with Filters */}
            <Box mt = { 3 } mb = { 2 }>
                <Typography variant = 'h6' gutterBottom>
                    Event Filters & Legend
                </Typography>

                {/* Call Quality Issues */}
                <Typography variant = 'subtitle2' sx = {{ mt: 2, mb: 1, fontWeight: 'bold' }}>
                    Call Quality Issues
                </Typography>
                <Grid container spacing = { 1 } alignItems = 'center'>
                    <Grid item>
                        <FormControlLabel
                            control = {
                                <Checkbox
                                    checked = { eventFilters.bwe_issue }
                                    onChange = { e => setEventFilters(prev => ({ ...prev, bwe_issue: e.target.checked })) }
                                    size = 'small'/>
                            }
                            label = {
                                <Box display = 'flex' alignItems = 'center' gap = { 1 }>
                                    <svg width = { 16 } height = { 16 }>
                                        <polygon
                                            points = '8,2 14,8 8,14 2,8'
                                            fill = '#FF6B35'
                                            stroke = 'white'
                                            strokeWidth = { 1 }/>
                                    </svg>
                                    <Typography variant = 'body2'>BWE Issue</Typography>
                                </Box>
                            }/>
                    </Grid>
                    <Grid item>
                        <FormControlLabel
                            control = {
                                <Checkbox
                                    checked = { eventFilters.ice_restart }
                                    onChange = { e => setEventFilters(prev => ({ ...prev, ice_restart: e.target.checked })) }
                                    size = 'small'/>
                            }
                            label = {
                                <Box display = 'flex' alignItems = 'center' gap = { 1 }>
                                    <svg width = { 16 } height = { 16 }>
                                        <polygon
                                            points = '8,2 12,5 12,11 8,14 4,11 4,5'
                                            fill = '#FF9800'
                                            stroke = 'white'
                                            strokeWidth = { 1 }/>
                                    </svg>
                                    <Typography variant = 'body2'>ICE Restart</Typography>
                                </Box>
                            }/>
                    </Grid>
                    <Grid item>
                        <FormControlLabel
                            control = {
                                <Checkbox
                                    checked = { eventFilters.connectionIssue }
                                    onChange = { e => setEventFilters(prev => ({ ...prev, connectionIssue: e.target.checked })) }
                                    size = 'small'/>
                            }
                            label = {
                                <Box display = 'flex' alignItems = 'center' gap = { 1 }>
                                    <Box width = { 16 } height = { 16 } borderRadius = '50%' bgcolor = '#FF9800'/>
                                    <Typography variant = 'body2'>Connection Issue</Typography>
                                </Box>
                            }/>
                    </Grid>
                </Grid>

                {/* Participant Events */}
                <Typography variant = 'subtitle2' sx = {{ mt: 3, mb: 1, fontWeight: 'bold' }}>
                    Participant Events
                </Typography>
                <Grid container spacing = { 1 } alignItems = 'center'>
                    <Grid item>
                        <FormControlLabel
                            control = {
                                <Checkbox
                                    checked = { eventFilters.join }
                                    onChange = { e => setEventFilters(prev => ({ ...prev, join: e.target.checked })) }
                                    size = 'small'/>
                            }
                            label = {
                                <Box display = 'flex' alignItems = 'center' gap = { 1 }>
                                    <svg width = { 16 } height = { 16 }>
                                        <polygon
                                            points = '3,4 3,6 10,6 13,8 10,10 3,10 3,12'
                                            fill = { theme.palette.success.main }
                                            stroke = 'white'
                                            strokeWidth = { 1 }/>
                                    </svg>
                                    <Typography variant = 'body2'>Join/Leave</Typography>
                                </Box>
                            }/>
                    </Grid>
                    <Grid item>
                        <FormControlLabel
                            control = {
                                <Checkbox
                                    checked = { eventFilters.screenshare }
                                    onChange = { e => setEventFilters(prev => ({ ...prev, screenshare: e.target.checked })) }
                                    size = 'small'/>
                            }
                            label = {
                                <Box display = 'flex' alignItems = 'center' gap = { 1 }>
                                    <Box width = { 16 } height = { 6 } borderRadius = { 1 } bgcolor = { theme.palette.info.main }/>
                                    <Typography variant = 'body2'>Screen Share</Typography>
                                </Box>
                            }/>
                    </Grid>
                    <Grid item>
                        <FormControlLabel
                            control = {
                                <Checkbox
                                    checked = { eventFilters.mute }
                                    onChange = { e => setEventFilters(prev => ({ ...prev, mute: e.target.checked })) }
                                    size = 'small'/>
                            }
                            label = {
                                <Box display = 'flex' alignItems = 'center' gap = { 1 }>
                                    <Box width = { 16 } height = { 16 } borderRadius = '50%' bgcolor = { theme.palette.warning.main }/>
                                    <Typography variant = 'body2'>Audio Mute/Unmute</Typography>
                                </Box>
                            }/>
                    </Grid>
                    <Grid item>
                        <FormControlLabel
                            control = {
                                <Checkbox
                                    checked = { eventFilters.dominant_speaker }
                                    onChange = { e => setEventFilters(prev => ({ ...prev, dominant_speaker: e.target.checked })) }
                                    size = 'small'/>
                            }
                            label = {
                                <Box display = 'flex' alignItems = 'center' gap = { 1 }>
                                    <Box width = { 16 } height = { 4 } borderRadius = { 1 } bgcolor = { theme.palette.secondary.main }/>
                                    <Typography variant = 'body2'>Dominant Speaker</Typography>
                                </Box>
                            }/>
                    </Grid>
                    <Grid item>
                        <FormControlLabel
                            control = {
                                <Checkbox
                                    checked = { eventFilters.video }
                                    onChange = { e => setEventFilters(prev => ({ ...prev, video: e.target.checked })) }
                                    size = 'small'/>
                            }
                            label = {
                                <Box display = 'flex' alignItems = 'center' gap = { 1 }>
                                    <Box width = { 16 } height = { 16 } borderRadius = '50%' bgcolor = { theme.palette.info.main }/>
                                    <Typography variant = 'body2'>Video Events</Typography>
                                </Box>
                            }/>
                    </Grid>
                </Grid>

                {/* Other Elements */}
                <Typography variant = 'subtitle2' sx = {{ mt: 3, mb: 1, fontWeight: 'bold' }}>
                    Timeline Elements
                </Typography>
                <Grid container spacing = { 2 } alignItems = 'center'>
                    <Grid item>
                        <Box display = 'flex' alignItems = 'center' gap = { 1 }>
                            <Box width = { 16 } height = { 8 } borderRadius = { 1 } bgcolor = { theme.palette.grey[400] }/>
                            <Typography variant = 'body2'>Participant Session</Typography>
                        </Box>
                    </Grid>
                </Grid>
            </Box>

            {/* Summary */}
            <Box mt = { 2 }>
                <Typography variant = 'body2' color = 'textSecondary'>
                    Click on any participant to view detailed information. Hover
                    over event markers for timestamps and details.
                </Typography>
            </Box>
        </Box>
    );
};

export default TimelineVisualization;
