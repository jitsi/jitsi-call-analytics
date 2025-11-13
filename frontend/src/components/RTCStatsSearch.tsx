/**
 * RTCStats Search Component
 * Search interface for RTCStats production conferences with pilot environment support
 */

import {
    PlayArrow as AnalyzeIcon,
    Cancel as CancelIcon,
    CheckCircle as CheckIcon,
    CloudDownload as DownloadIcon,
    Search as SearchIcon,
    Storage as ServerIcon,
    Schedule as TimeIcon
} from '@mui/icons-material';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    Grid,
    LinearProgress,
    Link,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Paper,
    TextField,
    Typography,
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import React, { useState } from 'react';

import {
    ConferenceSearchResult,
    DownloadStatus,
    RTCStatsSearchResponse,
    RTCStatsService
} from '../services/RTCStatsService';
import { RTCStatsEnvironment } from '../types/rtcstats';

// Get the PUBLIC_URL for proper subpath navigation
const PUBLIC_URL = process.env.PUBLIC_URL || '';

// Check if dev mode is enabled (shows environment selector)
const isDevMode = process.env.REACT_APP_DEV_MODE === 'true';

interface IRTCStatsSearchProps {
    onConferenceReady?: (conferenceId: string, environment: RTCStatsEnvironment) => void;
}

const RTCStatsSearch: React.FC<IRTCStatsSearchProps> = ({ onConferenceReady }) => {
    // Set default dates: last 7 days
    const getDefaultEndDate = () => new Date();
    const getDefaultStartDate = () => {
        const date = new Date();

        date.setDate(date.getDate() - 7);

        return date;
    };

    const [ searchPattern, setSearchPattern ] = useState('');
    const [ conferenceId, setConferenceId ] = useState('');
    const [ isPilot, setIsPilot ] = useState(false);
    const [ startDate, setStartDate ] = useState<Date | null>(getDefaultStartDate());
    const [ endDate, setEndDate ] = useState<Date | null>(getDefaultEndDate());
    const [ loading, setLoading ] = useState(false);
    const [ error, setError ] = useState<string | null>(null);
    const [ searchResults, setSearchResults ] = useState<RTCStatsSearchResponse | null>(null);
    const [ downloadStatuses, setDownloadStatuses ] = useState<Map<string, DownloadStatus>>(new Map());
    const [ showDownloadDialog, setShowDownloadDialog ] = useState(false);
    const [ selectedConference, setSelectedConference ] = useState<ConferenceSearchResult | null>(null);

    const handleSearch = async () => {
        if (!searchPattern.trim()) {
            setError('Please enter a conference URL');

            return;
        }

        setLoading(true);
        setError(null);
        setSearchResults(null);

        try {
            const environment: RTCStatsEnvironment = isPilot ? RTCStatsEnvironment.PILOT : RTCStatsEnvironment.PROD;
            const results = await RTCStatsService.searchConferences(
                searchPattern,
                environment,
                startDate || undefined,
                endDate || undefined
            );

            setSearchResults(results);

            // Check download status for each conference
            const statusMap = new Map<string, DownloadStatus>();

            for (const conference of results.conferences) {
                try {
                    const status = await RTCStatsService.getDownloadStatus(conference.conferenceId);

                    if (status) {
                        statusMap.set(conference.conferenceId, status);
                    }
                } catch {
                    // Ignore status check errors for individual conferences
                }
            }
            setDownloadStatuses(statusMap);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to search conferences',
            );
        } finally {
            setLoading(false);
        }
    };
    const pollDownloadStatus = async (confId: string) => {
        console.log('[pollDownloadStatus] Starting to poll for conference:', confId);
        const poll = async () => {
            try {
                console.log('[pollDownloadStatus] Checking status for:', confId);
                const status = await RTCStatsService.getDownloadStatus(confId);

                console.log('[pollDownloadStatus] Status response:', status);

                if (status) {
                    setDownloadStatuses(prev => new Map(prev).set(confId, status));

                    if (status.status === 'completed') {
                        console.log('[pollDownloadStatus] Download completed!');
                        setShowDownloadDialog(false);
                        onConferenceReady?.(confId, status.environment);
                    } else if (status.status === 'failed' || status.status === 'cancelled') {
                        console.error('[pollDownloadStatus] Download failed or cancelled:', status.status, status.error);
                        setShowDownloadDialog(false);
                        setError(`Download ${status.status}: ${status.error || 'Unknown error'}`);
                    } else if (status.status === 'downloading' || status.status === 'pending') {
                        console.log('[pollDownloadStatus] Download in progress, will poll again in 2s...');
                        // Continue polling
                        setTimeout(poll, 2000);
                    }
                }
            } catch (err) {
                console.error('[pollDownloadStatus] Error polling download status:', err);
                setTimeout(poll, 5000); // Retry less frequently on error
            }
        };

        poll();
    };
    const handleDownload = async (conference: ConferenceSearchResult) => {
        console.log('[handleDownload] Starting download flow for conference:', conference.conferenceId, 'environment:', conference.environment);
        setSelectedConference(conference);

        // Open the analysis tab immediately (before async operations) to avoid popup blocking
        const url = `${PUBLIC_URL}/?rtcstats=true&conferenceId=${encodeURIComponent(conference.conferenceId)}&environment=${encodeURIComponent(conference.environment)}`;

        console.log('[handleDownload] Opening analysis tab immediately:', url);
        const newWindow = window.open(url, '_blank');

        if (!newWindow) {
            console.warn('[handleDownload] Failed to open new tab - popup may be blocked');
            setError('Failed to open new tab. Please allow popups for this site.');

            return;
        }

        setShowDownloadDialog(true);

        try {
            console.log('[handleDownload] Calling downloadConference API...');
            const response = await RTCStatsService.downloadConference(conference.conferenceId, conference.environment);

            console.log('[handleDownload] Download API response:', response);

            if (response.alreadyDownloaded) {
                console.log('[handleDownload] Conference already downloaded, tab will analyze immediately');
                setShowDownloadDialog(false);
                // Conference already downloaded, the opened tab will handle analysis

                return;
            }

            console.log('[handleDownload] Download started, beginning to poll for status...');
            // Start polling for download status
            pollDownloadStatus(conference.conferenceId);
        } catch (err) {
            console.error('[handleDownload] Download failed:', err);
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to start download',
            );
            setShowDownloadDialog(false);
        }
    };
    const handleCancelDownload = () => {
        setShowDownloadDialog(false);
        setSelectedConference(null);
        // In a full implementation, you'd call RTCStatsService.cancelDownload here
    };

    const handleDirectAnalyze = async () => {
        if (!conferenceId.trim()) {
            setError('Please enter a conference ID');

            return;
        }

        const environment: RTCStatsEnvironment = isPilot ? RTCStatsEnvironment.PILOT : RTCStatsEnvironment.PROD;
        const conference: ConferenceSearchResult = {
            conferenceId: conferenceId.trim(),
            environment,
            searchPattern: conferenceId.trim()
        };

        // Directly download and analyze the conference
        await handleDownload(conference);
    };

    const getStatusChip = (conference: ConferenceSearchResult) => {
        const status = downloadStatuses.get(conference.conferenceId);

        if (!status) {
            return <Chip label = 'Not Downloaded' size = 'small' variant = 'outlined' />;
        }

        switch (status.status) {
        case 'completed':
            return <Chip label = 'Ready' color = 'success' size = 'small' icon = { <CheckIcon /> } />;
        case 'downloading':
            return <Chip label = { `Downloading ${status.progress}%` } color = 'primary' size = 'small' />;
        case 'pending':
            return <Chip label = 'Pending' color = 'primary' size = 'small' />;
        case 'failed':
            return <Chip label = 'Failed' color = 'error' size = 'small' icon = { <CancelIcon /> } />;
        case 'cancelled':
            return <Chip label = 'Cancelled' color = 'warning' size = 'small' icon = { <CancelIcon /> } />;
        default:
            return <Chip label = 'Unknown' size = 'small' variant = 'outlined' />;
        }
    };

    const formatTimestamp = (timestamp?: Date): string => {
        if (!timestamp) return 'Unknown';

        return new Date(timestamp).toLocaleString();
    };

    return (
        <Box>
            <Typography variant = 'h5' gutterBottom>
                RTCStats Conference Search
            </Typography>
            <Typography variant = 'body1' color = 'textSecondary' paragraph>
                Search RTCStats servers by conference URL and download data for analysis
            </Typography>

            {/* Direct Conference ID Analysis */}
            <Paper sx = {{ p: 3, mb: 3 }}>
                <Typography variant = 'h6' gutterBottom>
                    Direct Conference Analysis
                </Typography>
                <Grid container spacing = { 2 } alignItems = 'center'>
                    <Grid item xs = { 12 } md = { isDevMode ? 6 : 9 }>
                        <TextField
                            fullWidth
                            label = 'Conference ID'
                            placeholder = 'Enter exact conference ID to analyze'
                            value = { conferenceId }
                            onChange = { e => setConferenceId(e.target.value) }
                            disabled = { loading }
                            variant = 'outlined'
                            onKeyPress = { e => {
                                if (e.key === 'Enter') {
                                    handleDirectAnalyze();
                                }
                            } }/>
                    </Grid>
                    {isDevMode && (
                        <Grid item xs = { 12 } md = { 3 }>
                            <FormControlLabel
                                control = {
                                    <Checkbox
                                        checked = { isPilot }
                                        onChange = { e => setIsPilot(e.target.checked) }
                                        disabled = { loading }/>
                                }
                                label = {
                                    <Box display = 'flex' alignItems = 'center' gap = { 1 }>
                                        <ServerIcon fontSize = 'small' />
                                        <Typography variant = 'body2'>
                                            Pilot Environment
                                        </Typography>
                                    </Box>
                                }/>
                        </Grid>
                    )}
                    <Grid item xs = { 12 } md = { 3 }>
                        <Button
                            fullWidth
                            variant = 'contained'
                            color = 'success'
                            onClick = { handleDirectAnalyze }
                            disabled = { loading || !conferenceId.trim() }
                            startIcon = {
                                loading ? (
                                    <CircularProgress size = { 20 } />
                                ) : (
                                    <AnalyzeIcon />
                                )
                            }>
                            {loading ? 'Loading...' : 'Analyze'}
                        </Button>
                    </Grid>
                </Grid>
                {error && !(searchResults) && (
                    <Alert severity = 'error' sx = {{ mt: 2 }}>
                        {error}
                    </Alert>
                )}
            </Paper>

            {/* Search Interface */}
            <Paper sx = {{ p: 3, mb: 3 }}>
                <Typography variant = 'h6' gutterBottom>
                    Search Conferences
                </Typography>
                <LocalizationProvider dateAdapter = { AdapterDateFns }>
                    <Grid container spacing = { 2 } alignItems = 'center'>
                        <Grid item xs = { 12 } md = { 6 }>
                            <TextField
                                fullWidth
                                label = 'Conference URL'
                                placeholder = 'Enter conference URL (e.g., meet.jit.si/myroom)'
                                value = { searchPattern }
                                onChange = { e => setSearchPattern(e.target.value) }
                                disabled = { loading }
                                variant = 'outlined'
                                onKeyPress = { e => {
                                    if (e.key === 'Enter') {
                                        handleSearch();
                                    }
                                } }/>
                        </Grid>
                        <Grid item xs = { 12 } md = { 3 }>
                            <DatePicker
                                label = 'Start Date'
                                value = { startDate }
                                onChange = { newValue => setStartDate(newValue) }
                                disabled = { loading }
                                slotProps = {{
                                    textField: {
                                        fullWidth: true,
                                        size: 'medium'
                                    }
                                }}/>
                        </Grid>
                        <Grid item xs = { 12 } md = { 3 }>
                            <DatePicker
                                label = 'End Date'
                                value = { endDate }
                                onChange = { newValue => setEndDate(newValue) }
                                disabled = { loading }
                                slotProps = {{
                                    textField: {
                                        fullWidth: true,
                                        size: 'medium'
                                    }
                                }}/>
                        </Grid>
                        <Grid item xs = { 12 } md = { 12 }>
                            <Button
                                fullWidth
                                variant = 'contained'
                                onClick = { handleSearch }
                                disabled = { loading || !searchPattern.trim() }
                                startIcon = {
                                    loading ? (
                                        <CircularProgress size = { 20 } />
                                    ) : (
                                        <SearchIcon />
                                    )
                                }>
                                {loading ? 'Searching...' : 'Search'}
                            </Button>
                        </Grid>
                    </Grid>
                </LocalizationProvider>

                {error && searchResults && (
                    <Alert severity = 'error' sx = {{ mt: 2 }}>
                        {error}
                    </Alert>
                )}
            </Paper>

            {/* Search Results */}
            {searchResults && (
                <Paper sx = {{ p: 3 }}>
                    <Box display = 'flex' justifyContent = 'space-between' alignItems = 'center' mb = { 2 }>
                        <Typography variant = 'h6'>
                            Search Results ({searchResults.count} conferences found)
                        </Typography>
                        {isDevMode && (
                            <Chip
                                label = { `${searchResults.environment} environment` }
                                color = { searchResults.environment === RTCStatsEnvironment.PILOT ? 'secondary' : 'primary' }
                                variant = 'outlined'
                                size = 'small'/>
                        )}
                    </Box>

                    {searchResults.conferences.length === 0 ? (
                        <Typography color = 'textSecondary'>
                            No conferences found for URL: "{searchResults.searchPattern}"
                        </Typography>
                    ) : (
                        <List>
                            {searchResults.conferences.map((conference, index) => {
                                const status = downloadStatuses.get(conference.conferenceId);
                                const isReady = status?.status === 'completed';

                                return (
                                    <ListItem key = { index } divider = { index < searchResults.conferences.length - 1 }>
                                        <ListItemIcon>
                                            <TimeIcon color = 'action' />
                                        </ListItemIcon>
                                        <ListItemText
                                            primary = {
                                                <Box display = 'flex' alignItems = 'center' gap = { 2 }>
                                                    <Link
                                                        component = 'button'
                                                        variant = 'body1'
                                                        onClick = { () => handleDownload(conference) }
                                                        sx = {{ textAlign: 'left' }}>
                                                        {conference.conferenceId}
                                                    </Link>
                                                    {getStatusChip(conference)}
                                                </Box>
                                            }
                                            secondary = {
                                                <Box>
                                                    <Typography variant = 'body2' color = 'textSecondary'>
                                                        {formatTimestamp(conference.timestamp)}
                                                    </Typography>
                                                    {conference.durationFormatted && (
                                                        <Typography variant = 'body2' color = 'textSecondary'>
                                                            Duration: {conference.durationFormatted}
                                                        </Typography>
                                                    )}
                                                    {conference.participantCount !== undefined && (
                                                        <Typography variant = 'body2' color = 'textSecondary'>
                                                            Participants: {conference.participantCount}
                                                        </Typography>
                                                    )}
                                                </Box>
                                            }/>
                                        <Box display = 'flex' gap = { 1 }>
                                            {isReady ? (
                                                <Button
                                                    variant = 'contained'
                                                    color = 'success'
                                                    size = 'small'
                                                    startIcon = { <AnalyzeIcon /> }
                                                    onClick = { () => onConferenceReady?.(conference.conferenceId, conference.environment) }>
                                                    Analyze
                                                </Button>
                                            ) : (
                                                <Button
                                                    variant = 'outlined'
                                                    size = 'small'
                                                    startIcon = { <DownloadIcon /> }
                                                    onClick = { () => handleDownload(conference) }
                                                    disabled = { status?.status === 'downloading' || status?.status === 'pending' }>
                                                    {status?.status === 'downloading' ? 'Downloading...' : 'Download'}
                                                </Button>
                                            )}
                                        </Box>
                                    </ListItem>
                                );
                            })}
                        </List>
                    )}
                </Paper>
            )}

            {/* Download Progress Dialog */}
            <Dialog open = { showDownloadDialog } maxWidth = 'sm' fullWidth>
                <DialogTitle>Downloading Conference Data</DialogTitle>
                <DialogContent>
                    {selectedConference && (
                        <Box>
                            <Typography variant = 'body1' gutterBottom>
                                Downloading: <strong>{selectedConference.conferenceId}</strong>
                            </Typography>
                            {isDevMode && (
                                <Typography variant = 'body2' color = 'textSecondary' gutterBottom>
                                    Environment: {selectedConference.environment}
                                </Typography>
                            )}

                            {(() => {
                                const status = downloadStatuses.get(selectedConference.conferenceId);

                                if (status) {
                                    return (
                                        <Box sx = {{ mt: 2 }}>
                                            <Box display = 'flex' justifyContent = 'space-between' mb = { 1 }>
                                                <Typography variant = 'body2'>Progress</Typography>
                                                <Typography variant = 'body2'>{status.progress}%</Typography>
                                            </Box>
                                            <LinearProgress variant = 'determinate' value = { status.progress } />
                                            <Typography variant = 'caption' color = 'textSecondary' sx = {{ mt: 1, display: 'block' }}>
                                                Status: {status.status}
                                            </Typography>
                                        </Box>
                                    );
                                }

                                return (
                                    <Box sx = {{ mt: 2, textAlign: 'center' }}>
                                        <CircularProgress />
                                        <Typography variant = 'body2' sx = {{ mt: 2 }}>
                                            Initiating download...
                                        </Typography>
                                    </Box>
                                );
                            })()}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick = { handleCancelDownload }>
                        Cancel
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default RTCStatsSearch;
