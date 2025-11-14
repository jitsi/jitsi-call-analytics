/**
 * Frontend Entry Point
 * React application for Jitsi Analytics Dashboard
 */

import { getLogger, setLogLevel } from '@jitsi/logger';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { eightByEightTheme } from './theme/8x8Theme';

// Configure global log level from environment variable
// REACT_APP_LOG_LEVEL options: trace, debug, info, warn, error
// Default is 'warn' for frontend (less verbose than backend)
const logLevel = (process.env.REACT_APP_LOG_LEVEL || 'warn').toLowerCase();

setLogLevel(logLevel);

const logger = getLogger('frontend/src/index');

logger.info('Frontend logger initialized', { logLevel });

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement,
);

root.render(
    <React.StrictMode>
        <BrowserRouter basename = { process.env.PUBLIC_URL }>
            <ThemeProvider theme = { eightByEightTheme }>
                <CssBaseline />
                <App />
            </ThemeProvider>
        </BrowserRouter>
    </React.StrictMode>,
);
