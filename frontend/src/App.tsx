/**
 * Main App Component
 * Routes and layout for Jitsi Analytics Dashboard
 */

import { Analytics as AnalyticsIcon, Business as BusinessIcon } from '@mui/icons-material';
import { AppBar, Box, Chip, Container, Toolbar, Typography } from '@mui/material';
import React from 'react';
import { Route, Routes } from 'react-router-dom';

import CallAnalyzer from './components/CallAnalyzer';
import CallTimeline from './components/CallTimeline';
import EndpointDetails from './components/EndpointDetails';
import JVBDetails from './components/JVBDetails';
import JicofoDetails from './components/JicofoDetails';

const App: React.FC = () => {
    return (
        <Box sx = {{ flexGrow: 1, minHeight: '100vh', backgroundColor: '#f8fafc' }}>
            <AppBar position = 'static' elevation = { 0 }>
                <Toolbar sx = {{ py: 1 }}>
                    <Box sx = {{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <BusinessIcon sx = {{ fontSize: 32, color: 'primary.main' }} />
                        <Box>
                            <Typography
                                variant = 'h5'
                                component = 'div'
                                sx = {{
                                    fontWeight: 600,
                                    color: 'text.primary',
                                    lineHeight: 1.2
                                }}>
                                Jitsi Call Analytics
                            </Typography>
                            <Typography
                                variant = 'caption'
                                sx = {{
                                    color: 'text.secondary',
                                    fontSize: '0.75rem'
                                }}>
                                Professional Call Analytics & Performance Insights
                            </Typography>
                        </Box>
                    </Box>

                    <Box sx = {{ flexGrow: 1 }} />

                    <Box sx = {{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                            icon = { <AnalyticsIcon /> }
                            label = 'Enterprise'
                            size = 'small'
                            variant = 'outlined'
                            sx = {{
                                borderColor: 'primary.main',
                                color: 'primary.main'
                            }}/>
                    </Box>
                </Toolbar>
            </AppBar>

            <Container maxWidth = 'xl' sx = {{ py: 4 }}>
                <Routes>
                    <Route path = '/' element = { <CallAnalyzer /> } />
                    <Route path = '/call/:sessionId' element = { <CallTimeline /> } />
                    <Route path = '/jvb/:jvbId' element = { <JVBDetails /> } />
                    <Route path = '/bridge/:bridgeId' element = { <JVBDetails /> } />
                    <Route
                        path = '/jicofo/:shardId'
                        element = { <JicofoDetails /> }/>
                    <Route
                        path = '/endpoint/:endpointId'
                        element = { <EndpointDetails /> }/>
                </Routes>
            </Container>
        </Box>
    );
};

export default App;
