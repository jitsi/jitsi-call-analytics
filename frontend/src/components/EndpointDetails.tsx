/**
 * Endpoint Details Page
 * Dedicated full-page view for comprehensive endpoint debugging and analysis
 */

import { getLogger } from '@jitsi/logger';
import {
    ArrowBack as ArrowBackIcon,
    Clear as ClearIcon,
    Computer as ComputerIcon,
    ExpandMore as ExpandMoreIcon,
    FilterList as FilterIcon,
    Description as LogsIcon,
    NetworkWifi as NetworkWifiIcon,
    Speed as PerformanceIcon,
    SignalWifi4Bar as SignalIcon,
    Smartphone as SmartphoneIcon,
    VideocamOff as VideocamOffIcon,
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
    Checkbox,
    Chip,
    FormControl,
    FormControlLabel,
    FormGroup,
    Grid,
    IconButton,
    InputLabel,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    MenuItem,
    Paper,
    Select,
    Tab,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableRow,
    Tabs,
    TextField,
    Typography,
} from '@mui/material';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { API_BASE_URL } from '../config/api';
import { ICallEvent } from '../types/shared';

import WebRTCStatsVisualizer from './WebRTCStatsVisualizer';

const logger = getLogger('frontend/src/components/EndpointDetails');

interface ITabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

function TabPanel(props: ITabPanelProps) {
    const { children, value, index, ...other } = props;

    return (
        <div
            role = 'tabpanel'
            hidden = { value !== index }
            id = { `endpoint-tabpanel-${index}` }
            aria-labelledby = { `endpoint-tab-${index}` }
            { ...other }>
            {value === index && <Box sx = {{ py: 3 }}>{children}</Box>}
        </div>
    );
}

const EndpointDetails: React.FC = () => {
    const { endpointId } = useParams<{ endpointId: string; }>();
    const location = useLocation();
    const navigate = useNavigate();

    // Get participant data from navigation state or fetch from API
    const participantFromState = location.state?.participant;

    const [ tabValue, setTabValue ] = useState(0);
    const [ endpointLogs, setEndpointLogs ] = useState<any[]>([]);
    const [ participantData, setParticipantData ]
        = useState<any>(participantFromState);
    const [ logsLoading, setLogsLoading ] = useState(false);
    const [ logsError, setLogsError ] = useState<string | null>(null);
    const [ sessionEvents, setSessionEvents ] = useState<ICallEvent[]>([]);

    // Log filter state
    const [ filterExpanded, setFilterExpanded ] = useState(false);
    const [ searchFilter, setSearchFilter ] = useState('');
    const [ componentFilter, setComponentFilter ] = useState('ALL');
    const [ enabledLevels, setEnabledLevels ] = useState({
        INFO: true,
        WARN: true,
        ERROR: true,
        DEBUG: true,
        TRACE: true,
    });

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
    };

    // Get parameters from URL
    const searchParams = new URLSearchParams(location.search);
    const displayName = searchParams.get('displayName');
    const isRTCStats = searchParams.get('rtcstats') === 'true';
    const conferenceId = searchParams.get('conferenceId');
    const environment = searchParams.get('environment');
    const dumpsPath = searchParams.get('dumpsPath');

    // Fetch real participant console logs (using displayName for aggregation, fallback to endpointId)
    useEffect(() => {
        const fetchEndpointLogs = async () => {
            if (!endpointId && !displayName) {
                return;
            }

            setLogsLoading(true);
            setLogsError(null);

            try {
                // Use displayName if available (for aggregated logs), otherwise fallback to endpointId
                const identifier = displayName || endpointId;
                const endpoint = displayName ? 'participant' : 'endpoint';

                // Build URL with RTCStats parameters or dumpsPath
                // dumpsPath works for both RTCStats downloads and uploaded dumps
                let url = `${API_BASE_URL}/api/v1/sessions/${endpoint}/${encodeURIComponent(identifier!)}/logs`;

                const params = new URLSearchParams();

                if (isRTCStats && conferenceId && environment) {
                    params.set('rtcstats', 'true');
                    params.set('conferenceId', conferenceId);
                    params.set('environment', environment);
                } else if (dumpsPath) {
                    // dumpsPath works for both RTCStats and uploaded dumps
                    params.set('dumpsPath', dumpsPath);
                }

                if (params.toString()) {
                    url += `?${params.toString()}`;
                }

                const response = await fetch(url);
                const result = await response.json();

                if (result.success && result.data.logs) {
                    setEndpointLogs(result.data.logs);
                } else {
                    throw new Error(
                        result.error || 'Failed to fetch endpoint logs',
                    );
                }
            } catch (error) {
                logger.error('Failed to fetch endpoint logs', { endpointId, error });
                setLogsError((error as Error).message);
                setEndpointLogs([]);
            } finally {
                setLogsLoading(false);
            }
        };

        fetchEndpointLogs();
    }, [ endpointId, displayName, isRTCStats, conferenceId, environment, dumpsPath, location.search ]);

    // Fetch session events for connection event classification
    useEffect(() => {
        const fetchSessionEvents = async () => {
            if (!displayName && !endpointId) return;

            try {
                // Use displayName if available, otherwise use endpointId
                const identifier = displayName || endpointId;

                // Build URL with RTCStats parameters or dumpsPath
                let url = `${API_BASE_URL}/api/v1/sessions/participant/${encodeURIComponent(identifier!)}/events`;

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
                const result = await response.json();

                if (result.success && result.data.events) {
                    setSessionEvents(result.data.events);
                }

                // Also update participant data with the enhanced data from backend
                if (result.success && result.data) {
                    setParticipantData((prev: any) => ({
                        ...prev,
                        ...result.data.participant,
                        performanceMetrics: result.data.performanceMetrics
                    }));
                }
            } catch (error) {
                logger.error('Failed to fetch session events', { endpointId, error });
                setSessionEvents([]);
            }
        };

        fetchSessionEvents();
    }, [ endpointId, displayName ]);

    const formatTime = (timestamp: number): string => {
        return new Date(timestamp).toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short',
        });
    };

    const formatTimeShort = (timestamp: number): string => {
        return new Date(timestamp).toLocaleTimeString();
    };

    // Get unique components from logs for filter dropdown
    const getUniqueComponents = () => {
        if (endpointLogs.length > 0) {
            const components = Array.from(
                new Set(endpointLogs.map(log => log.component)),
            );

            return components
                .filter(comp => comp && comp !== 'Unknown')
                .sort();
        }

        return [];
    };

    // Apply filters to logs
    const getFilteredLogs = (): any[] => {
        return endpointLogs.filter((log: any) => {
            // Search filter
            if (searchFilter) {
                const searchLower = searchFilter.toLowerCase();
                const messageMatch = log.message?.toLowerCase().includes(searchLower);
                const componentMatch = log.component?.toLowerCase().includes(searchLower);

                if (!messageMatch && !componentMatch) {
                    return false;
                }
            }

            // Level filter
            if (!(enabledLevels as any)[log.level]) {
                return false;
            }

            // Component filter
            if (
                componentFilter !== 'ALL'
                && log.component !== componentFilter
            ) {
                return false;
            }

            return true;
        });
    };

    // Clear all filters
    const clearFilters = () => {
        setSearchFilter('');
        setComponentFilter('ALL');
        setEnabledLevels({
            INFO: true,
            WARN: true,
            ERROR: true,
            DEBUG: true,
            TRACE: true,
        });
    };

    const getClientIcon = () => {
        if (!participantData) return <ComputerIcon />;
        switch (participantData.clientInfo?.type) {
        case 'mobile':
            return <SmartphoneIcon />;
        case 'desktop':
            return <ComputerIcon />;
        default:
            return <ComputerIcon />;
        }
    };

    // Generate performance metrics from logs analysis
    const generatePerformanceMetrics = () => {
        const errorLogs = endpointLogs.filter(log => log.level === 'ERROR');
        const warningLogs = endpointLogs.filter(log => log.level === 'WARN');
        const networkLogs = endpointLogs.filter(
            log =>
                log.message
                && (log.message.toLowerCase().includes('network')
                    || log.message.toLowerCase().includes('connection')
                    || log.message.toLowerCase().includes('ice')),
        );

        return {
            totalLogs: endpointLogs.length,
            errorCount: errorLogs.length,
            warningCount: warningLogs.length,
            networkEventCount: networkLogs.length,
            logTimeSpan:
                endpointLogs.length > 0
                    ? Math.round(
                          (endpointLogs[0].timestamp
                              - endpointLogs[endpointLogs.length - 1].timestamp)
                              / 1000,
                    )
                    : 0,
            averageLogsPerMinute:
                endpointLogs.length > 0
                    ? Math.round(
                          endpointLogs.length
                              / ((endpointLogs[0].timestamp
                                  - endpointLogs[endpointLogs.length - 1]
                                      .timestamp)
                                  / 60000) || 0,
                    )
                    : 0,
        };
    };

    const performanceMetrics = generatePerformanceMetrics();

    return (
        <Box
            sx = {{
                p: 3,
                maxWidth: '100%',
                backgroundColor: '#f5f5f5',
                minHeight: '100vh',
            }}>
            {/* Header */}
            <Paper sx = {{ p: 3, mb: 3 }}>
                <Box display = 'flex' alignItems = 'center' gap = { 2 } mb = { 2 }>
                    <IconButton onClick = { () => navigate(-1) } size = 'small'>
                        <ArrowBackIcon />
                    </IconButton>
                    <Box display = 'flex' alignItems = 'center' gap = { 2 }>
                        {getClientIcon()}
                        <Typography variant = 'h4'>Endpoint Analysis</Typography>
                    </Box>
                </Box>

                <Grid container spacing = { 2 } alignItems = 'center'>
                    <Grid item xs = { 12 } md = { 6 }>
                        <Typography variant = 'h6' color = 'primary'>
                            {displayName
                                || participantData?.displayName
                                || 'Unknown Participant'}
                        </Typography>
                        <Typography
                            variant = 'body2'
                            color = 'textSecondary'
                            sx = {{ fontFamily: 'monospace' }}>
                            {displayName
                                ? 'Participant Analysis (aggregated from multiple sessions)'
                                : `Endpoint ID: ${endpointId}`}
                        </Typography>

                        {/* Display session count for aggregated participants */}
                        {participantData?.endpointIds?.length > 1 && (
                            <Box sx = {{ mt: 1 }}>
                                <Typography
                                    variant = 'body2'
                                    color = 'textSecondary'
                                    sx = {{ fontWeight: 500 }}>
                                    Aggregated from{' '}
                                    {participantData.endpointIds.length}{' '}
                                    sessions
                                </Typography>
                            </Box>
                        )}

                        {participantData && (
                            <Typography variant = 'body2' color = 'textSecondary'>
                                {participantData.clientInfo?.type} •{' '}
                                {participantData.clientInfo?.browser} •{' '}
                                {participantData.connection?.networkType}
                            </Typography>
                        )}
                    </Grid>

                    <Grid item xs = { 12 } md = { 6 }>
                        <Grid container spacing = { 2 }>
                            <Grid item xs = { 4 } textAlign = 'center'>
                                <Typography variant = 'h6' color = 'primary'>
                                    {performanceMetrics.totalLogs}
                                </Typography>
                                <Typography
                                    variant = 'body2'
                                    color = 'textSecondary'>
                                    Total Logs
                                </Typography>
                            </Grid>
                            <Grid item xs = { 4 } textAlign = 'center'>
                                <Typography variant = 'h6' color = 'error'>
                                    {performanceMetrics.errorCount}
                                </Typography>
                                <Typography
                                    variant = 'body2'
                                    color = 'textSecondary'>
                                    Errors
                                </Typography>
                            </Grid>
                            <Grid item xs = { 4 } textAlign = 'center'>
                                <Typography variant = 'h6' color = 'warning'>
                                    {performanceMetrics.warningCount}
                                </Typography>
                                <Typography
                                    variant = 'body2'
                                    color = 'textSecondary'>
                                    Warnings
                                </Typography>
                            </Grid>
                        </Grid>
                    </Grid>
                </Grid>
            </Paper>

            {/* Tabs */}
            <Paper sx = {{ mb: 3 }}>
                <Box sx = {{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs
                        value = { tabValue }
                        onChange = { handleTabChange }
                        aria-label = 'endpoint details tabs'>
                        <Tab
                            label = 'Console Logs'
                            icon = { <LogsIcon /> }
                            iconPosition = 'start'/>
                        <Tab
                            label = 'Performance Metrics'
                            icon = { <PerformanceIcon /> }
                            iconPosition = 'start'/>
                        <Tab
                            label = 'WebRTC Stats'
                            icon = { <WebRTCIcon /> }
                            iconPosition = 'start'/>
                    </Tabs>
                </Box>

                {/* Console Logs Tab */}
                <TabPanel value = { tabValue } index = { 0 }>
                    {logsLoading && (
                        <Alert severity = 'info' sx = {{ mb: 2 }}>
                            Loading endpoint console logs...
                        </Alert>
                    )}

                    {displayName && (
                        <Alert severity = 'info' sx = {{ mb: 2 }}>
                            Showing aggregated console logs from all sessions
                            for participant: <strong>{displayName}</strong>
                        </Alert>
                    )}

                    {logsError && (
                        <Alert severity = 'warning' sx = {{ mb: 2 }}>
                            Could not load real logs: {logsError}
                        </Alert>
                    )}

                    {/* Advanced Log Filters */}
                    <Accordion
                        expanded = { filterExpanded }
                        onChange = { (e, isExpanded) =>
                            setFilterExpanded(isExpanded)
                        }
                        sx = {{ mb: 3 }}>
                        <AccordionSummary expandIcon = { <ExpandMoreIcon /> }>
                            <Box display = 'flex' alignItems = 'center' gap = { 1 }>
                                <FilterIcon />
                                <Typography variant = 'h6'>
                                    Advanced Log Filters (
                                    {getFilteredLogs().length} of{' '}
                                    {endpointLogs.length} logs)
                                </Typography>
                            </Box>
                        </AccordionSummary>
                        <AccordionDetails>
                            <Grid container spacing = { 3 }>
                                {/* Search Filter */}
                                <Grid item xs = { 12 } md = { 6 }>
                                    <TextField
                                        fullWidth
                                        label = 'Search logs'
                                        value = { searchFilter }
                                        onChange = { e =>
                                            setSearchFilter(e.target.value)
                                        }
                                        placeholder = 'Search message or component...'
                                        variant = 'outlined'/>
                                </Grid>

                                {/* Component Filter */}
                                <Grid item xs = { 12 } md = { 4 }>
                                    <FormControl fullWidth>
                                        <InputLabel>Component</InputLabel>
                                        <Select
                                            value = { componentFilter }
                                            onChange = { e =>
                                                setComponentFilter(
                                                    e.target.value as string,
                                                )
                                            }
                                            label = 'Component'>
                                            <MenuItem value = 'ALL'>
                                                All Components
                                            </MenuItem>
                                            {getUniqueComponents().map(
                                                component => (
                                                    <MenuItem
                                                        key = { component }
                                                        value = { component }>
                                                        {component
                                                            .split('/')
                                                            .pop() || component}
                                                    </MenuItem>
                                                ),
                                            )}
                                        </Select>
                                    </FormControl>
                                </Grid>

                                {/* Clear Filters */}
                                <Grid item xs = { 12 } md = { 2 }>
                                    <Box
                                        display = 'flex'
                                        alignItems = 'center'
                                        height = '56px'>
                                        <IconButton
                                            onClick = { clearFilters }
                                            title = 'Clear all filters'
                                            size = 'large'>
                                            <ClearIcon />
                                        </IconButton>
                                    </Box>
                                </Grid>

                                {/* Log Level Checkboxes */}
                                <Grid item xs = { 12 }>
                                    <Typography
                                        variant = 'subtitle1'
                                        gutterBottom>
                                        Log Levels:
                                    </Typography>
                                    <FormGroup row>
                                        {Object.entries(enabledLevels).map(
                                            ([ level, enabled ]) => (
                                                <FormControlLabel
                                                    key = { level }
                                                    control = {
                                                        <Checkbox
                                                            checked = { enabled }
                                                            onChange = { e =>
                                                                setEnabledLevels(
                                                                    prev => ({
                                                                        ...prev,
                                                                        [level]:
                                                                            e
                                                                                .target
                                                                                .checked,
                                                                    }),
                                                                )
                                                            }/>
                                                    }
                                                    label = {
                                                        <Chip
                                                            label = { level }
                                                            size = 'medium'
                                                            color = {
                                                                level
                                                                === 'ERROR'
                                                                    ? 'error'
                                                                    : level
                                                                        === 'WARN'
                                                                        ? 'warning'
                                                                        : level
                                                                          === 'DEBUG'
                                                                            ? 'info'
                                                                            : 'default'
                                                            }
                                                            sx = {{ ml: 0.5 }}/>
                                                    }/>
                                            ),
                                        )}
                                    </FormGroup>
                                </Grid>
                            </Grid>
                        </AccordionDetails>
                    </Accordion>

                    {/* Enhanced Log Display */}
                    <List
                        sx = {{
                            maxHeight: '70vh',
                            overflow: 'auto',
                            bgcolor: '#f9f9f9',
                            borderRadius: 2,
                            border: '1px solid #e0e0e0',
                        }}>
                        {getFilteredLogs().map((log: any, index: number) => (
                            <ListItem
                                key = { index }
                                divider
                                sx = {{
                                    py: 0.1,
                                    alignItems: 'center',
                                    '&:hover': { bgcolor: '#f0f0f0' },
                                }}>
                                <ListItemText
                                    primary = {
                                        <Box
                                            display = 'flex'
                                            alignItems = 'center'
                                            gap = { 1 }
                                            sx = {{ flexWrap: 'nowrap' }}>
                                            <Chip
                                                label = { log.level }
                                                size = 'small'
                                                color = {
                                                    log.level === 'ERROR'
                                                        ? 'error'
                                                        : log.level === 'WARN'
                                                            ? 'warning'
                                                            : log.level
                                                              === 'DEBUG'
                                                                ? 'info'
                                                                : 'default'
                                                }
                                                sx = {{
                                                    minWidth: '60px',
                                                    fontWeight: 'bold',
                                                    flexShrink: 0,
                                                }}/>
                                            <Chip
                                                label = {
                                                    log.component
                                                        ?.split('/')
                                                        .pop()
                                                    || log.component
                                                    || 'Unknown'
                                                }
                                                size = 'small'
                                                variant = 'outlined'
                                                sx = {{
                                                    fontSize: '0.7rem',
                                                    maxWidth: '150px',
                                                    flexShrink: 0,
                                                }}/>
                                            <Typography
                                                variant = 'caption'
                                                color = 'textSecondary'
                                                sx = {{
                                                    flexShrink: 0,
                                                    minWidth: '65px',
                                                }}>
                                                {formatTime(log.timestamp)}
                                            </Typography>
                                            <Typography
                                                variant = 'body2'
                                                sx = {{
                                                    fontFamily:
                                                        'Consolas, Monaco, "Courier New", monospace',
                                                    fontSize: '0.8rem',
                                                    whiteSpace: 'pre-wrap',
                                                    wordBreak: 'break-word',
                                                    flex: 1,
                                                    ml: 1,
                                                }}>
                                                {log.message}
                                            </Typography>
                                        </Box>
                                    }/>
                            </ListItem>
                        ))}
                    </List>

                    {getFilteredLogs().length === 0
                        && endpointLogs.length > 0 && (
                        <Alert severity = 'info' sx = {{ mt: 2 }}>
                            No logs match the current filters. Try adjusting
                            your search or filter criteria.
                        </Alert>
                    )}

                    {endpointLogs.length === 0 && !logsLoading && (
                        <Alert severity = 'warning' sx = {{ mt: 2 }}>
                            {logsError
                                ? `Could not load real logs: ${logsError}`
                                : 'No console logs available for this endpoint.'}
                        </Alert>
                    )}
                </TabPanel>

                {/* Performance Metrics Tab */}
                <TabPanel value = { tabValue } index = { 1 }>
                    <Grid container spacing = { 3 }>
                        <Grid item xs = { 12 } md = { 6 }>
                            <Card>
                                <CardContent>
                                    <Typography
                                        variant = 'h6'
                                        gutterBottom
                                        color = 'primary'>
                                        Log Analysis Overview
                                    </Typography>
                                    <TableContainer>
                                        <Table size = 'small'>
                                            <TableBody>
                                                <TableRow>
                                                    <TableCell>
                                                        <strong>
                                                            Total Log Entries
                                                        </strong>
                                                    </TableCell>
                                                    <TableCell align = 'right'>
                                                        {
                                                            performanceMetrics.totalLogs
                                                        }
                                                    </TableCell>
                                                </TableRow>
                                                <TableRow>
                                                    <TableCell>
                                                        <strong>
                                                            Error Count
                                                        </strong>
                                                    </TableCell>
                                                    <TableCell
                                                        align = 'right'
                                                        style = {{
                                                            color:
                                                                performanceMetrics.errorCount
                                                                > 0
                                                                    ? 'red'
                                                                    : 'inherit',
                                                        }}>
                                                        {
                                                            performanceMetrics.errorCount
                                                        }
                                                    </TableCell>
                                                </TableRow>
                                                <TableRow>
                                                    <TableCell>
                                                        <strong>
                                                            Warning Count
                                                        </strong>
                                                    </TableCell>
                                                    <TableCell
                                                        align = 'right'
                                                        style = {{
                                                            color:
                                                                performanceMetrics.warningCount
                                                                > 0
                                                                    ? 'orange'
                                                                    : 'inherit',
                                                        }}>
                                                        {
                                                            performanceMetrics.warningCount
                                                        }
                                                    </TableCell>
                                                </TableRow>
                                                <TableRow>
                                                    <TableCell>
                                                        <strong>
                                                            Network Events
                                                        </strong>
                                                    </TableCell>
                                                    <TableCell align = 'right'>
                                                        {
                                                            performanceMetrics.networkEventCount
                                                        }
                                                    </TableCell>
                                                </TableRow>
                                                <TableRow>
                                                    <TableCell>
                                                        <strong>
                                                            Log Time Span
                                                        </strong>
                                                    </TableCell>
                                                    <TableCell align = 'right'>
                                                        {
                                                            performanceMetrics.logTimeSpan
                                                        }
                                                        s
                                                    </TableCell>
                                                </TableRow>
                                                <TableRow>
                                                    <TableCell>
                                                        <strong>
                                                            Avg Logs/Min
                                                        </strong>
                                                    </TableCell>
                                                    <TableCell align = 'right'>
                                                        {
                                                            performanceMetrics.averageLogsPerMinute
                                                        }
                                                    </TableCell>
                                                </TableRow>
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                </CardContent>
                            </Card>
                        </Grid>

                        {participantData && (
                            <Grid item xs = { 12 } md = { 6 }>
                                <Card>
                                    <CardContent>
                                        <Typography
                                            variant = 'h6'
                                            gutterBottom
                                            color = 'primary'>
                                            Performance Metrics
                                        </Typography>

                                        <TableContainer>
                                            <Table size = 'small'>
                                                <TableBody>
                                                    <TableRow>
                                                        <TableCell>
                                                            <strong>Packet Loss</strong>
                                                        </TableCell>
                                                        <TableCell align = 'right'>
                                                            <Typography
                                                                variant = 'body2'
                                                                fontWeight = 'bold'
                                                                color = {
                                                                    (participantData.performanceMetrics?.packetLoss || participantData.qualityMetrics?.packetLoss || 0) > 3
                                                                        ? 'error.main'
                                                                        : (participantData.performanceMetrics?.packetLoss || participantData.qualityMetrics?.packetLoss || 0) > 1
                                                                            ? 'warning.main'
                                                                            : 'success.main'
                                                                }>
                                                                {(participantData.performanceMetrics?.packetLoss || participantData.qualityMetrics?.packetLoss || 0).toFixed(1)}%
                                                            </Typography>
                                                        </TableCell>
                                                    </TableRow>
                                                    <TableRow>
                                                        <TableCell>
                                                            <strong>Average RTT</strong>
                                                        </TableCell>
                                                        <TableCell align = 'right'>
                                                            <Typography
                                                                variant = 'body2'
                                                                fontWeight = 'bold'
                                                                color = {
                                                                    (participantData.performanceMetrics?.avgRTT || participantData.qualityMetrics?.roundTripTime || 0) > 200
                                                                        ? 'error.main'
                                                                        : (participantData.performanceMetrics?.avgRTT || participantData.qualityMetrics?.roundTripTime || 0) > 100
                                                                            ? 'warning.main'
                                                                            : 'success.main'
                                                                }>
                                                                {Math.round(participantData.performanceMetrics?.avgRTT || participantData.qualityMetrics?.roundTripTime || 0)}ms
                                                            </Typography>
                                                        </TableCell>
                                                    </TableRow>
                                                    <TableRow>
                                                        <TableCell>
                                                            <strong>Average Jitter</strong>
                                                        </TableCell>
                                                        <TableCell align = 'right'>
                                                            <Typography
                                                                variant = 'body2'
                                                                fontWeight = 'bold'
                                                                color = {
                                                                    (participantData.performanceMetrics?.avgJitter || participantData.qualityMetrics?.jitter || 0) > 30
                                                                        ? 'error.main'
                                                                        : (participantData.performanceMetrics?.avgJitter || participantData.qualityMetrics?.jitter || 0) > 15
                                                                            ? 'warning.main'
                                                                            : 'success.main'
                                                                }>
                                                                {Math.round(participantData.performanceMetrics?.avgJitter || participantData.qualityMetrics?.jitter || 0)}ms
                                                            </Typography>
                                                        </TableCell>
                                                    </TableRow>
                                                    <TableRow>
                                                        <TableCell>
                                                            <strong>Media Interruptions</strong>
                                                        </TableCell>
                                                        <TableCell align = 'right'>
                                                            <Typography
                                                                variant = 'body2'
                                                                fontWeight = 'bold'
                                                                color = {
                                                                    sessionEvents.filter(event =>
                                                                        (displayName ? true : event.participantId === endpointId)
                                                                        && event.eventType === 'mediaInterruption'
                                                                    ).length > 5
                                                                        ? 'error.main'
                                                                        : sessionEvents.filter(event =>
                                                                            (displayName ? true : event.participantId === endpointId)
                                                                            && event.eventType === 'mediaInterruption'
                                                                        ).length > 0
                                                                            ? 'warning.main'
                                                                            : 'success.main'
                                                                }>
                                                                {sessionEvents.filter(event =>
                                                                    (displayName ? true : event.participantId === endpointId)
                                                                    && event.eventType === 'mediaInterruption'
                                                                ).length}
                                                            </Typography>
                                                        </TableCell>
                                                    </TableRow>
                                                    <TableRow>
                                                        <TableCell>
                                                            <strong>ICE Restarts</strong>
                                                        </TableCell>
                                                        <TableCell align = 'right'>
                                                            <Typography
                                                                variant = 'body2'
                                                                fontWeight = 'bold'
                                                                color = {
                                                                    sessionEvents.filter(event =>
                                                                        (displayName ? true : event.participantId === endpointId)
                                                                        && event.eventType === 'networkIssue'
                                                                    ).length > 5
                                                                        ? 'error.main'
                                                                        : sessionEvents.filter(event =>
                                                                            (displayName ? true : event.participantId === endpointId)
                                                                            && event.eventType === 'networkIssue'
                                                                        ).length > 0
                                                                            ? 'warning.main'
                                                                            : 'success.main'
                                                                }>
                                                                {sessionEvents.filter(event =>
                                                                    (displayName ? true : event.participantId === endpointId)
                                                                    && event.eventType === 'networkIssue'
                                                                ).length}
                                                            </Typography>
                                                        </TableCell>
                                                    </TableRow>
                                                    <TableRow>
                                                        <TableCell>
                                                            <strong>Strophe Errors</strong>
                                                        </TableCell>
                                                        <TableCell align = 'right'>
                                                            <Typography
                                                                variant = 'body2'
                                                                fontWeight = 'bold'
                                                                color = {
                                                                    sessionEvents.filter(event =>
                                                                        (displayName ? true : event.participantId === endpointId)
                                                                        && event.eventType === 'connectionIssue'
                                                                    ).length > 3
                                                                        ? 'error.main'
                                                                        : sessionEvents.filter(event =>
                                                                            (displayName ? true : event.participantId === endpointId)
                                                                            && event.eventType === 'connectionIssue'
                                                                        ).length > 0
                                                                            ? 'warning.main'
                                                                            : 'success.main'
                                                                }>
                                                                {sessionEvents.filter(event =>
                                                                    (displayName ? true : event.participantId === endpointId)
                                                                    && event.eventType === 'connectionIssue'
                                                                ).length}
                                                            </Typography>
                                                        </TableCell>
                                                    </TableRow>
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                    </CardContent>
                                </Card>
                            </Grid>
                        )}

                        {/* Call Quality - Connection Event Classification */}
                        <Grid item xs = { 12 }>
                            <Card>
                                <CardContent>
                                    <Typography
                                        variant = 'h6'
                                        gutterBottom
                                        color = 'primary'>
                                        Call Quality - Connection Events
                                    </Typography>

                                    <Grid container spacing = { 3 }>
                                        {/* Strophe Errors */}
                                        <Grid item xs = { 12 } md = { 4 }>
                                            <Typography variant = 'subtitle2' gutterBottom>
                                                Strophe Errors
                                            </Typography>
                                            {sessionEvents.filter(event =>
                                                (displayName ? true : event.participantId === endpointId)
                                                && event.eventType === 'connectionIssue'
                                            ).length > 0 ? (
                                                    <List dense>
                                                        {sessionEvents
                                                        .filter(event =>
                                                            (displayName ? true : event.participantId === endpointId)
                                                            && event.eventType === 'connectionIssue'
                                                        )
                                                        .slice(0, 5)
                                                        .map((event, index) => (
                                                            <ListItem key = { index } sx = {{ py: 0.5 }}>
                                                                <ListItemIcon>
                                                                    <SignalIcon fontSize = 'small' color = 'error' />
                                                                </ListItemIcon>
                                                                <ListItemText
                                                                    primary = 'Strophe Connection Issue'
                                                                    secondary = { `${formatTimeShort(event.timestamp)} - ${event.metadata?.type || 'Connection error'}` }
                                                                    primaryTypographyProps = {{ variant: 'body2' }}
                                                                    secondaryTypographyProps = {{ variant: 'caption' }}/>
                                                            </ListItem>
                                                        ))}
                                                    </List>
                                                ) : (
                                                    <Typography variant = 'body2' color = 'textSecondary' sx = {{ fontStyle: 'italic', py: 2 }}>
                                                        No Strophe errors detected
                                                    </Typography>
                                                )}
                                        </Grid>

                                        {/* ICE Restarts */}
                                        <Grid item xs = { 12 } md = { 4 }>
                                            <Typography variant = 'subtitle2' gutterBottom>
                                                ICE Restarts
                                            </Typography>
                                            {sessionEvents.filter(event =>
                                                (displayName ? true : event.participantId === endpointId)
                                                && event.eventType === 'networkIssue'
                                            ).length > 0 ? (
                                                    <List dense>
                                                        {sessionEvents
                                                        .filter(event =>
                                                            (displayName ? true : event.participantId === endpointId)
                                                            && event.eventType === 'networkIssue'
                                                        )
                                                        .slice(0, 5)
                                                        .map((event, index) => (
                                                            <ListItem key = { index } sx = {{ py: 0.5 }}>
                                                                <ListItemIcon>
                                                                    <NetworkWifiIcon fontSize = 'small' color = 'warning' />
                                                                </ListItemIcon>
                                                                <ListItemText
                                                                    primary = 'ICE Restart'
                                                                    secondary = { `${formatTimeShort(event.timestamp)} - ${event.metadata?.type || 'Network connectivity issue'}` }
                                                                    primaryTypographyProps = {{ variant: 'body2' }}
                                                                    secondaryTypographyProps = {{ variant: 'caption' }}/>
                                                            </ListItem>
                                                        ))}
                                                    </List>
                                                ) : (
                                                    <Typography variant = 'body2' color = 'textSecondary' sx = {{ fontStyle: 'italic', py: 2 }}>
                                                        No ICE restarts detected
                                                    </Typography>
                                                )}
                                        </Grid>

                                        {/* Media Interruptions (BWE Issues) */}
                                        <Grid item xs = { 12 } md = { 4 }>
                                            <Typography variant = 'subtitle2' gutterBottom>
                                                Media Interruptions
                                            </Typography>
                                            {sessionEvents.filter(event =>
                                                (displayName ? true : event.participantId === endpointId)
                                                && event.eventType === 'mediaInterruption'
                                            ).length > 0 ? (
                                                    <List dense>
                                                        {sessionEvents
                                                        .filter(event =>
                                                            (displayName ? true : event.participantId === endpointId)
                                                            && event.eventType === 'mediaInterruption'
                                                        )
                                                        .slice(0, 5)
                                                        .map((event, index) => (
                                                            <ListItem key = { index } sx = {{ py: 0.5 }}>
                                                                <ListItemIcon>
                                                                    <VideocamOffIcon fontSize = 'small' color = 'error' />
                                                                </ListItemIcon>
                                                                <ListItemText
                                                                    primary = {
                                                                        event.metadata?.subType === 'remoteSourceInterrupted'
                                                                            ? 'Remote Source Interrupted'
                                                                            : event.metadata?.subType === 'remoteSourceSuspended'
                                                                                ? 'Remote Source Suspended'
                                                                                : event.metadata?.subType === 'bwe_issue'
                                                                                    ? 'BWE Issue'
                                                                                    : 'Media Issue'
                                                                    }
                                                                    secondary = { `${formatTimeShort(event.timestamp)} - ${
                                                                        event.metadata?.subType === 'bwe_issue'
                                                                            ? 'Bandwidth/Media quality issue'
                                                                            : 'Media stream interruption'
                                                                    }` }
                                                                    primaryTypographyProps = {{ variant: 'body2' }}
                                                                    secondaryTypographyProps = {{ variant: 'caption' }}/>
                                                            </ListItem>
                                                        ))}
                                                    </List>
                                                ) : (
                                                    <Typography variant = 'body2' color = 'textSecondary' sx = {{ fontStyle: 'italic', py: 2 }}>
                                                        No media interruptions detected
                                                    </Typography>
                                                )}
                                        </Grid>
                                    </Grid>
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>
                </TabPanel>

                {/* WebRTC Stats Tab */}
                <TabPanel value = { tabValue } index = { 2 }>
                    <WebRTCStatsVisualizer
                        participantId = { endpointId || '' }
                        displayName = { displayName || undefined }/>
                </TabPanel>
            </Paper>
        </Box>
    );
};

export default EndpointDetails;
